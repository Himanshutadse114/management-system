const crypto = require('crypto');
const express = require('express');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  AuditLog,
  BranchMembership,
  BranchSettings,
  Product,
  ProductPriceOption,
  User
} = require('../models');
const { RestaurantTable, MenuItem, RecipeComponent, KitchenTicket, KitchenTicketLine, Reservation, RestaurantNotification } = require('../models/restaurant');
const { Order, OrderLine, Payment, PAYMENT_METHODS } = require('../models/sales');
const { GuestOrderRequest } = require('../models/growth');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');
const {
  createRestaurantOrder,
  addRestaurantLines,
  setRestaurantStatus,
  payRestaurantOrder,
  cancelRestaurantOrder,
  moveRestaurantOrder,
  mergeRestaurantOrders,
  splitRestaurantOrder
} = require('../services/restaurantService');
const { minorInteger } = require('../services/inventoryService');

const router = express.Router();
const RESTAURANT_READ_ROLES = ['BRANCH_MANAGER', 'WAITER', 'CASHIER', 'AUDITOR'];
const ORDER_WRITE_ROLES = ['BRANCH_MANAGER', 'WAITER'];
const ORDER_PAY_ROLES = ['BRANCH_MANAGER', 'WAITER', 'CASHIER'];

router.use(authenticate, requireApproved);

function scopedAccess(roles) {
  return (req, res, next) => requireBranchRoles(...roles)(req, res, (error) => {
    if (error) return next(error);
    if (!req.branch || String(req.branch.tenantId) !== String(req.params.tenantId)) {
      return res.status(404).json({ message: 'Branch not found in this tenant.', code: 'BRANCH_SCOPE_MISMATCH' });
    }
    if (req.branch.type !== 'BAR_RESTAURANT') {
      return res.status(409).json({ message: 'Restaurant operations are only available for Bar + Restaurant branches.', code: 'NOT_RESTAURANT_BRANCH' });
    }
    next();
  });
}

const readAccess = scopedAccess(RESTAURANT_READ_ROLES);
const orderWriteAccess = scopedAccess(ORDER_WRITE_ROLES);
const paymentAccess = scopedAccess(ORDER_PAY_ROLES);
const managerAccess = scopedAccess(['BRANCH_MANAGER']);

function cleanText(value, max = 255) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

function callerRole(req) {
  if (req.access?.isSuperAdmin) return 'SUPER_ADMIN';
  const tenantMembership = (req.access?.tenants || []).find((row) => String(row.tenantId) === String(req.params.tenantId) && row.role === 'TENANT_ADMIN');
  if (tenantMembership) return 'TENANT_ADMIN';
  return (req.access?.branches || []).find((row) => String(row.branchId) === String(req.params.branchId))?.role || null;
}

function isPrivileged(req) {
  return ['SUPER_ADMIN', 'TENANT_ADMIN', 'BRANCH_MANAGER'].includes(callerRole(req));
}

function canOperateOrder(req, order) {
  if (isPrivileged(req)) return true;
  return callerRole(req) === 'WAITER' && String(order.waiterUserId || '') === String(req.userId);
}

async function audit(req, action, entityType, entityId, metadata = null) {
  await AuditLog.create({
    tenantId: req.params.tenantId,
    branchId: req.params.branchId,
    actorUserId: req.userId,
    action,
    entityType,
    entityId: entityId ? String(entityId) : null,
    metadata,
    ipAddress: req.ip || null
  });
}

router.get('/tenants/:tenantId/branches/:branchId/notifications', readAccess, async (req, res, next) => {
  try {
    const role = callerRole(req);
    const where = {
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      [Op.or]: [{ userId: req.userId }, { role }]
    };
    if (String(req.query.unread || '').toLowerCase() === 'true') where.readAt = null;
    const notifications = await RestaurantNotification.findAll({ where, order: [['createdAt', 'DESC']], limit: 100 });
    res.json({ notifications });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/notifications/:notificationId/read', readAccess, async (req, res, next) => {
  try {
    const role = callerRole(req);
    const notification = await RestaurantNotification.findOne({ where: { id: req.params.notificationId, tenantId: req.params.tenantId, branchId: req.params.branchId, [Op.or]: [{ userId: req.userId }, { role }] } });
    if (!notification) return res.status(404).json({ message: 'Notification not found.' });
    notification.readAt = notification.readAt || new Date();
    await notification.save();
    res.json({ notification });
  } catch (error) { next(error); }
});

function normalizeModifierGroups(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 12).map((group, groupIndex) => {
    const name = cleanText(group?.name, 100);
    if (!name) { const error = new Error(`Modifier group ${groupIndex + 1} needs a name.`); error.status = 400; throw error; }
    const options = (Array.isArray(group?.options) ? group.options : []).slice(0, 30).map((option, optionIndex) => {
      const label = cleanText(option?.label, 120);
      if (!label) { const error = new Error(`${name} option ${optionIndex + 1} needs a label.`); error.status = 400; throw error; }
      return { id: cleanText(option?.id, 80) || crypto.randomUUID(), label, priceMinor: minorInteger(option?.priceMinor ?? '0', `${name} option price`).toString() };
    });
    const min = Math.max(0, Math.min(Number(group?.min ?? (group?.required ? 1 : 0)) || 0, options.length));
    const max = Math.max(min, Math.min(Number(group?.max ?? options.length) || options.length, options.length));
    return { id: cleanText(group?.id, 80) || crypto.randomUUID(), name, min, max, required: min > 0, options };
  });
}

function normalizeComboItems(value) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 30).map((item) => ({
    id: cleanText(item?.id, 80) || crypto.randomUUID(),
    label: cleanText(item?.label ?? item, 160),
    quantity: Math.max(1, Math.min(Number(item?.quantity || 1), 50))
  })).filter((item) => item.label);
}

router.get('/tenants/:tenantId/branches/:branchId/kitchen-tickets', managerAccess, async (req, res, next) => {
  try {
    const where = { tenantId: req.params.tenantId, branchId: req.params.branchId };
    if (req.query.status && String(req.query.status).toUpperCase() !== 'ALL') where.status = String(req.query.status).toUpperCase();
    else if (!req.query.status) where.status = { [Op.in]: ['NEW', 'PREPARING', 'READY'] };
    const tickets = await KitchenTicket.findAll({ where, include: [{ model: KitchenTicketLine, as: 'lines' }], order: [['firedAt', 'ASC']], limit: 200 });
    const orderIds = [...new Set(tickets.map((row) => row.orderId))];
    const orders = orderIds.length ? await Order.findAll({ where: { id: { [Op.in]: orderIds }, tenantId: req.params.tenantId }, attributes: ['id','orderNumber','tableId','waiterUserId'] }) : [];
    const tableIds = [...new Set(orders.map((row) => row.tableId).filter(Boolean))];
    const tables = tableIds.length ? await RestaurantTable.findAll({ where: { id: { [Op.in]: tableIds }, branchId: req.params.branchId }, attributes: ['id','name','code'] }) : [];
    const orderMap = new Map(orders.map((row) => [String(row.id), row.toJSON()]));
    const tableMap = new Map(tables.map((row) => [String(row.id), row.toJSON()]));
    res.json({ tickets: tickets.map((ticket) => { const value=ticket.toJSON(); const order=orderMap.get(String(value.orderId)); return { ...value, order: order ? { ...order, table:tableMap.get(String(order.tableId))||null } : null }; }) });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/guest-orders', managerAccess, async (req, res, next) => {
  try {
    const where = { tenantId: req.params.tenantId, branchId: req.params.branchId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    const requests = await GuestOrderRequest.findAll({ where, order: [['createdAt', 'DESC']], limit: 150 });
    res.json({ requests });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/guest-orders/:requestId/accept', managerAccess, async (req, res, next) => {
  try {
    const request = await GuestOrderRequest.findOne({ where: { id: req.params.requestId, tenantId: req.params.tenantId, branchId: req.params.branchId } });
    if (!request) return res.status(404).json({ message: 'Guest order request not found.' });
    if (request.status === 'ACCEPTED') return res.json({ request, replayed: true });
    if (request.status !== 'PENDING') return res.status(409).json({ message: `Request cannot be accepted from ${request.status}.` });
    if (request.paymentStatus === 'AWAITING_VERIFICATION') return res.status(409).json({ message: 'Verify the guest UPI reference before accepting this order.' });
    const result = await createRestaurantOrder({ tenantId: request.tenantId, branchId: request.branchId, tableId: request.tableId, lines: request.cart.map((line) => ({ priceOptionId: line.priceOptionId, quantityUnits: line.quantityUnits, modifiers: (line.modifiers || []).map((row) => row.optionId), notes: line.notes })), waiterUserId: req.userId, actorUserId: req.userId, notes: request.notes, idempotencyKey: `guest-request:${request.id}` });
    request.status = 'ACCEPTED'; request.acceptedOrderId = result.order.id; request.acceptedByUserId = req.userId; request.acceptedAt = new Date(); await request.save();
    if(request.paymentStatus==='VERIFIED')result.order=await payRestaurantOrder({orderId:result.order.id,tenantId:request.tenantId,branchId:request.branchId,paymentMethod:'UPI',paymentReference:request.paymentReference,actorUserId:req.userId});
    await audit(req, 'GUEST_ORDER_ACCEPTED', 'GuestOrderRequest', request.id, { orderId: result.order.id, channel: request.channel, totalMinor: request.subtotalMinor });
    res.json({ request, order: result.order, replayed: result.replayed });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/guest-orders/:requestId/verify-payment', managerAccess, async (req, res, next) => {
  try {
    const request = await GuestOrderRequest.findOne({ where:{id:req.params.requestId,tenantId:req.params.tenantId,branchId:req.params.branchId,status:'PENDING'} });
    if(!request)return res.status(404).json({message:'Pending guest order request not found.'});
    if(request.paymentMethod!=='UPI'||!request.paymentReference)return res.status(409).json({message:'This request has no UPI reference to verify.'});
    request.paymentStatus='VERIFIED';request.paymentVerifiedByUserId=req.userId;request.paymentVerifiedAt=new Date();await request.save();
    await audit(req,'GUEST_PAYMENT_VERIFIED','GuestOrderRequest',request.id,{paymentMethod:request.paymentMethod,paymentReference:request.paymentReference});
    res.json({request});
  } catch(error){next(error);}
});

router.post('/tenants/:tenantId/branches/:branchId/guest-orders/:requestId/reject', managerAccess, async (req, res, next) => {
  try {
    const request = await GuestOrderRequest.findOne({ where: { id: req.params.requestId, tenantId: req.params.tenantId, branchId: req.params.branchId, status: 'PENDING' } });
    if (!request) return res.status(404).json({ message: 'Pending guest order request not found.' });
    const reason = cleanText(req.body?.reason, 1000);
    if (!reason) return res.status(400).json({ message: 'Rejection reason is required.' });
    request.status = 'REJECTED'; request.rejectionReason = reason; await request.save();
    await audit(req, 'GUEST_ORDER_REJECTED', 'GuestOrderRequest', request.id, { reason, channel: request.channel });
    res.json({ request });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/kitchen-tickets/:ticketId/status', managerAccess, async (req, res, next) => {
  try {
    const nextStatus = String(req.body?.status || '').toUpperCase();
    const allowed = { NEW:['PREPARING','READY','CANCELLED'], PREPARING:['READY','CANCELLED'], READY:['COMPLETED'], COMPLETED:[], CANCELLED:[] };
    const ticket = await KitchenTicket.findOne({ where: { id:req.params.ticketId, tenantId:req.params.tenantId, branchId:req.params.branchId } });
    if (!ticket) return res.status(404).json({ message:'Kitchen ticket not found.' });
    if (!(allowed[ticket.status]||[]).includes(nextStatus)) return res.status(409).json({ message:`Ticket cannot move from ${ticket.status} to ${nextStatus}.` });
    ticket.status=nextStatus; ticket.updatedByUserId=req.userId;
    if(nextStatus==='PREPARING')ticket.startedAt=new Date();
    if(nextStatus==='READY')ticket.readyAt=new Date();
    if(nextStatus==='COMPLETED')ticket.completedAt=new Date();
    await ticket.save();
    if (nextStatus === 'READY') {
      const order = await Order.findOne({ where: { id: ticket.orderId, tenantId: req.params.tenantId, branchId: req.params.branchId } });
      if (order?.waiterUserId) await RestaurantNotification.findOrCreate({
        where: { tenantId: req.params.tenantId, dedupeKey: `ticket-ready:${ticket.id}` },
        defaults: { tenantId: req.params.tenantId, branchId: req.params.branchId, userId: order.waiterUserId, type: 'KITCHEN_READY', title: `${ticket.station} order ready`, message: `${order.orderNumber} is ready for service.`, entityType: 'KitchenTicket', entityId: ticket.id, dedupeKey: `ticket-ready:${ticket.id}` }
      });
    }
    await audit(req,'KITCHEN_TICKET_STATUS_CHANGED','KitchenTicket',ticket.id,{previous:req.body?.previous||null,status:nextStatus,station:ticket.station});
    res.json({ticket});
  } catch(error){next(error);}
});

router.get('/tenants/:tenantId/branches/:branchId/reservations', managerAccess, async (req,res,next)=>{try{const from=req.query.from?new Date(req.query.from):new Date(Date.now()-24*60*60*1000);const to=req.query.to?new Date(req.query.to):new Date(Date.now()+30*24*60*60*1000);if(Number.isNaN(from.getTime())||Number.isNaN(to.getTime()))return res.status(400).json({message:'Invalid reservation date range.'});const reservations=await Reservation.findAll({where:{tenantId:req.params.tenantId,branchId:req.params.branchId,startsAt:{[Op.between]:[from,to]}},order:[['startsAt','ASC']],limit:500});res.json({reservations});}catch(error){next(error);}});

router.post('/tenants/:tenantId/branches/:branchId/reservations', managerAccess, async (req,res,next)=>{try{const guestName=cleanText(req.body?.guestName,160);const phone=cleanText(req.body?.phone,40);const partySize=Number(req.body?.partySize);const startsAt=new Date(req.body?.startsAt);const durationMinutes=Number(req.body?.durationMinutes||90);if(!guestName||!phone)return res.status(400).json({message:'Guest name and phone are required.'});if(!Number.isInteger(partySize)||partySize<1||partySize>100)return res.status(400).json({message:'Party size must be between 1 and 100.'});if(Number.isNaN(startsAt.getTime())||!Number.isInteger(durationMinutes)||durationMinutes<15||durationMinutes>720)return res.status(400).json({message:'Valid start time and duration are required.'});let table=null;if(req.body?.tableId){table=await RestaurantTable.findOne({where:{id:req.body.tableId,tenantId:req.params.tenantId,branchId:req.params.branchId,status:'ACTIVE'}});if(!table)return res.status(400).json({message:'Table not found.'});const existing=await Reservation.findAll({where:{tenantId:req.params.tenantId,branchId:req.params.branchId,tableId:table.id,status:{[Op.in]:['BOOKED','CONFIRMED','SEATED']}}});const end=startsAt.getTime()+durationMinutes*60000;if(existing.some((row)=>new Date(row.startsAt).getTime()<end&&(new Date(row.startsAt).getTime()+Number(row.durationMinutes)*60000)>startsAt.getTime()))return res.status(409).json({message:'This table already has an overlapping reservation.',code:'RESERVATION_TABLE_CONFLICT'});}const reservation=await Reservation.create({tenantId:req.params.tenantId,branchId:req.params.branchId,tableId:table?.id||null,guestName,phone,email:cleanText(req.body?.email,320)?.toLowerCase()||null,partySize,startsAt,durationMinutes,status:table?'BOOKED':'WAITLIST',depositMinor:minorInteger(req.body?.depositMinor??'0','depositMinor').toString(),depositReference:cleanText(req.body?.depositReference,180),notes:cleanText(req.body?.notes,2000),consentToContact:req.body?.consentToContact===true,createdByUserId:req.userId});await audit(req,'RESERVATION_CREATED','Reservation',reservation.id,{guestName,partySize,startsAt:startsAt.toISOString(),tableId:table?.id||null,status:reservation.status,depositMinor:reservation.depositMinor});res.status(201).json({reservation});}catch(error){next(error);}});

router.patch('/tenants/:tenantId/branches/:branchId/reservations/:reservationId', managerAccess, async(req,res,next)=>{try{const reservation=await Reservation.findOne({where:{id:req.params.reservationId,tenantId:req.params.tenantId,branchId:req.params.branchId}});if(!reservation)return res.status(404).json({message:'Reservation not found.'});if(req.body?.status!==undefined){const status=String(req.body.status).toUpperCase();if(!['WAITLIST','BOOKED','CONFIRMED','SEATED','COMPLETED','NO_SHOW','CANCELLED'].includes(status))return res.status(400).json({message:'Invalid reservation status.'});reservation.status=status;}if(req.body?.tableId!==undefined)reservation.tableId=req.body.tableId||null;if(req.body?.notes!==undefined)reservation.notes=cleanText(req.body.notes,2000);await reservation.save();await audit(req,'RESERVATION_UPDATED','Reservation',reservation.id,{status:reservation.status,tableId:reservation.tableId});res.json({reservation});}catch(error){next(error);}});

async function loadOrder(req) {
  return Order.findOne({
    where: { id: req.params.orderId, tenantId: req.params.tenantId, branchId: req.params.branchId },
    include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }]
  });
}

async function resolveWaiterUserId(req) {
  const role = callerRole(req);
  if (role === 'WAITER') return req.userId;
  const requested = cleanText(req.body?.waiterUserId, 80);
  if (!requested) return req.userId;
  const membership = await BranchMembership.findOne({
    where: {
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      userId: requested,
      role: 'WAITER',
      status: 'ACTIVE'
    }
  });
  if (!membership) {
    const error = new Error('Selected waiter is not active in this branch.');
    error.status = 400;
    throw error;
  }
  return requested;
}

router.get('/tenants/:tenantId/branches/:branchId/tables', readAccess, async (req, res, next) => {
  try {
    const tables = await RestaurantTable.findAll({
      where: { tenantId: req.params.tenantId, branchId: req.params.branchId },
      order: [['code', 'ASC']]
    });
    const activeOrders = await Order.findAll({
      where: {
        tenantId: req.params.tenantId,
        branchId: req.params.branchId,
        orderType: 'RESTAURANT',
        status: { [Op.in]: ['OPEN', 'SERVED', 'AWAITING_PAYMENT'] }
      },
      attributes: ['id', 'orderNumber', 'tableId', 'status', 'waiterUserId', 'totalMinor', 'createdAt']
    });
    const byTable = new Map(activeOrders.map((order) => [String(order.tableId), order]));
    res.json({ tables: tables.map((table) => ({ ...table.toJSON(), activeOrder: byTable.get(String(table.id)) || null })) });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/tables', managerAccess, async (req, res, next) => {
  try {
    const name = cleanText(req.body?.name, 100);
    const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
    const seats = Math.min(Math.max(Number(req.body?.seats || 4), 1), 50);
    if (!name || !code) return res.status(400).json({ message: 'Table name and code are required.' });
    const table = await RestaurantTable.create({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      name,
      code,
      seats,
      status: 'ACTIVE',
      qrToken: crypto.randomBytes(24).toString('base64url')
    });
    await audit(req, 'RESTAURANT_TABLE_CREATED', 'RestaurantTable', table.id, { name, code, seats });
    res.status(201).json({ table });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'This table code already exists in the branch.' });
    next(error);
  }
});

router.patch('/tenants/:tenantId/branches/:branchId/tables/:tableId', managerAccess, async (req, res, next) => {
  try {
    const table = await RestaurantTable.findOne({ where: { id: req.params.tableId, tenantId: req.params.tenantId, branchId: req.params.branchId } });
    if (!table) return res.status(404).json({ message: 'Table not found.' });
    if (req.body?.name !== undefined) table.name = cleanText(req.body.name, 100) || table.name;
    if (req.body?.seats !== undefined) table.seats = Math.min(Math.max(Number(req.body.seats || 1), 1), 50);
    if (req.body?.status !== undefined) {
      const status = String(req.body.status).toUpperCase();
      if (!['ACTIVE', 'INACTIVE'].includes(status)) return res.status(400).json({ message: 'Table status must be ACTIVE or INACTIVE.' });
      table.status = status;
    }
    await table.save();
    await audit(req, 'RESTAURANT_TABLE_UPDATED', 'RestaurantTable', table.id, { fields: Object.keys(req.body || {}) });
    res.json({ table });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/menu', readAccess, async (req, res, next) => {
  try {
    const items = await MenuItem.findAll({
      where: { tenantId: req.params.tenantId, branchId: req.params.branchId },
      order: [['sectionName', 'ASC'], ['sortOrder', 'ASC'], ['displayName', 'ASC']]
    });
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = productIds.length ? await Product.findAll({
      where: { id: { [Op.in]: productIds }, tenantId: req.params.tenantId },
      include: [{ model: ProductPriceOption, as: 'priceOptions', where: { branchId: req.params.branchId }, required: false }]
    }) : [];
    const productMap = new Map(products.map((product) => [String(product.id), product]));
    res.json({ items: items.map((item) => ({ ...item.toJSON(), product: productMap.get(String(item.productId)) || null })) });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/menu', managerAccess, async (req, res, next) => {
  try {
    // LINKED keeps older installed clients compatible: before the prepared
    // dish form existed they posted only productId, for both tracked and
    // non-tracked products.
    const sourceType = String(req.body?.sourceType || (req.body?.productId ? 'LINKED' : 'PREPARED')).toUpperCase();
    if (!['PREPARED', 'STOCK', 'LINKED'].includes(sourceType)) {
      return res.status(400).json({ message: 'Menu source must be PREPARED or STOCK.' });
    }

    let product;
    let priceOption = null;
    let item;
    let created = false;
    await sequelize.transaction(async (transaction) => {
      if (sourceType === 'PREPARED') {
        const displayName = cleanText(req.body?.displayName, 180);
        if (!displayName) {
          const error = new Error('Enter the dish or drink name.');
          error.status = 400;
          throw error;
        }
        const priceMinor = minorInteger(req.body?.priceMinor, 'Menu price');
        if (priceMinor <= 0n) {
          const error = new Error('Menu price must be greater than zero.');
          error.status = 400;
          throw error;
        }
        const priceLabel = cleanText(req.body?.priceLabel, 80) || 'Serving';

        if (req.body?.productId) {
          product = await Product.findOne({
            where: { id: req.body.productId, tenantId: req.params.tenantId, status: 'ACTIVE', trackInventory: false },
            transaction,
            lock: transaction.LOCK.UPDATE
          });
          if (!product) {
            const error = new Error('This prepared menu item is unavailable.');
            error.status = 404;
            throw error;
          }
          product.name = displayName;
          await product.save({ transaction });
        } else {
          product = await Product.create({
            tenantId: req.params.tenantId,
            name: displayName,
            productType: String(req.body?.productType || 'FOOD').toUpperCase() === 'MIXER' ? 'MIXER' : 'FOOD',
            inventoryUnit: 'PIECE',
            trackInventory: false,
            status: 'ACTIVE'
          }, { transaction });
        }

        priceOption = await ProductPriceOption.findOne({
          where: { tenantId: req.params.tenantId, branchId: req.params.branchId, productId: product.id, active: true },
          order: [['sortOrder', 'ASC']],
          transaction,
          lock: transaction.LOCK.UPDATE
        });
        if (priceOption) {
          priceOption.label = priceLabel;
          priceOption.quantityBaseUnits = '1.000';
          priceOption.priceMinor = priceMinor.toString();
          await priceOption.save({ transaction });
        } else {
          priceOption = await ProductPriceOption.create({
            tenantId: req.params.tenantId,
            branchId: req.params.branchId,
            productId: product.id,
            label: priceLabel,
            quantityBaseUnits: '1.000',
            priceMinor: priceMinor.toString(),
            active: true,
            sortOrder: 0
          }, { transaction });
        }
      } else {
        product = await Product.findOne({
          where: {
            id: req.body?.productId,
            tenantId: req.params.tenantId,
            status: 'ACTIVE',
            ...(sourceType === 'STOCK' ? { trackInventory: true } : {})
          },
          transaction
        });
        if (!product) {
          const error = new Error('Choose an active stock item.');
          error.status = 404;
          throw error;
        }
        const priceCount = await ProductPriceOption.count({
          where: { productId: product.id, branchId: req.params.branchId, active: true },
          transaction
        });
        if (!priceCount) {
          const error = new Error('Add at least one active branch price option before publishing this stock item.');
          error.status = 400;
          throw error;
        }
      }

      [item, created] = await MenuItem.findOrCreate({
        where: { branchId: req.params.branchId, productId: product.id },
        defaults: {
          tenantId: req.params.tenantId,
          branchId: req.params.branchId,
          productId: product.id,
          displayName: cleanText(req.body?.displayName, 180) || product.name,
          description: cleanText(req.body?.description, 2000),
          sectionName: cleanText(req.body?.sectionName, 100) || 'Menu',
          sortOrder: Number.isInteger(req.body?.sortOrder) ? req.body.sortOrder : 0,
          featured: Boolean(req.body?.featured),
          active: req.body?.active !== false,
          dietaryTags: Array.isArray(req.body?.dietaryTags) ? req.body.dietaryTags.slice(0, 20) : null,
          modifierGroups: normalizeModifierGroups(req.body?.modifierGroups),
          comboItems: normalizeComboItems(req.body?.comboItems)
        },
        transaction
      });
      if (!created) {
        item.displayName = cleanText(req.body?.displayName, 180) || item.displayName || product.name;
        item.description = req.body?.description !== undefined ? cleanText(req.body.description, 2000) : item.description;
        item.sectionName = cleanText(req.body?.sectionName, 100) || item.sectionName || 'Menu';
        if (Number.isInteger(req.body?.sortOrder)) item.sortOrder = req.body.sortOrder;
        if (req.body?.featured !== undefined) item.featured = Boolean(req.body.featured);
        if (req.body?.active !== undefined) item.active = Boolean(req.body.active);
        if (Array.isArray(req.body?.dietaryTags)) item.dietaryTags = req.body.dietaryTags.slice(0, 20);
        if (Array.isArray(req.body?.modifierGroups)) item.modifierGroups = normalizeModifierGroups(req.body.modifierGroups);
        if (Array.isArray(req.body?.comboItems)) item.comboItems = normalizeComboItems(req.body.comboItems);
        await item.save({ transaction });
      }
    });

    await audit(req, created ? 'MENU_ITEM_PUBLISHED' : 'MENU_ITEM_UPDATED', 'MenuItem', item.id, {
      productId: product.id,
      sectionName: item.sectionName,
      sourceType
    });
    res.status(created ? 201 : 200).json({ item, product, priceOption, sourceType });
  } catch (error) { next(error); }
});

router.patch('/tenants/:tenantId/branches/:branchId/menu/:menuItemId', managerAccess, async (req, res, next) => {
  try {
    const item = await MenuItem.findOne({ where: { id: req.params.menuItemId, tenantId: req.params.tenantId, branchId: req.params.branchId } });
    if (!item) return res.status(404).json({ message: 'Menu item not found.' });
    if (req.body?.displayName !== undefined) item.displayName = cleanText(req.body.displayName, 180) || item.displayName;
    if (req.body?.description !== undefined) item.description = cleanText(req.body.description, 2000);
    if (req.body?.sectionName !== undefined) item.sectionName = cleanText(req.body.sectionName, 100) || 'Menu';
    if (Number.isInteger(req.body?.sortOrder)) item.sortOrder = req.body.sortOrder;
    if (req.body?.featured !== undefined) item.featured = Boolean(req.body.featured);
    if (req.body?.active !== undefined) item.active = Boolean(req.body.active);
    if (Array.isArray(req.body?.dietaryTags)) item.dietaryTags = req.body.dietaryTags.slice(0, 20);
    if (Array.isArray(req.body?.modifierGroups)) item.modifierGroups = normalizeModifierGroups(req.body.modifierGroups);
    if (Array.isArray(req.body?.comboItems)) item.comboItems = normalizeComboItems(req.body.comboItems);
    await item.save();
    await audit(req, 'MENU_ITEM_UPDATED', 'MenuItem', item.id, { fields: Object.keys(req.body || {}) });
    res.json({ item });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/waiters', managerAccess, async (req, res, next) => {
  try {
    const memberships = await BranchMembership.findAll({
      where: { tenantId: req.params.tenantId, branchId: req.params.branchId, role: 'WAITER', status: 'ACTIVE' },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email', 'avatarUrl'] }],
      order: [['createdAt', 'ASC']]
    });
    res.json({ waiters: memberships.map((row) => ({ membershipId: row.id, userId: row.userId, email: row.email, user: row.user })) });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/orders', readAccess, async (req, res, next) => {
  try {
    const where = { tenantId: req.params.tenantId, branchId: req.params.branchId, orderType: 'RESTAURANT' };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    if (callerRole(req) === 'WAITER') where.waiterUserId = req.userId;
    const orders = await Order.findAll({
      where,
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }],
      order: [['createdAt', 'DESC']],
      limit: 150
    });
    const tableIds = [...new Set(orders.map((order) => order.tableId).filter(Boolean))];
    const waiterIds = [...new Set(orders.map((order) => order.waiterUserId).filter(Boolean))];
    const [tables, waiters] = await Promise.all([
      tableIds.length ? RestaurantTable.findAll({ where: { id: { [Op.in]: tableIds } } }) : [],
      waiterIds.length ? User.findAll({ where: { id: { [Op.in]: waiterIds } }, attributes: ['id', 'name', 'email', 'avatarUrl'] }) : []
    ]);
    const tableMap = new Map(tables.map((table) => [String(table.id), table]));
    const waiterMap = new Map(waiters.map((user) => [String(user.id), user]));
    res.json({ orders: orders.map((order) => ({ ...order.toJSON(), table: tableMap.get(String(order.tableId)) || null, waiter: waiterMap.get(String(order.waiterUserId)) || null })) });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/unresolved', readAccess, async (req, res, next) => {
  try {
    const where = {
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      orderType: 'RESTAURANT',
      status: { [Op.in]: ['OPEN', 'SERVED', 'AWAITING_PAYMENT'] }
    };
    if (callerRole(req) === 'WAITER') where.waiterUserId = req.userId;
    const orders = await Order.findAll({
      where,
      include: [{ model: OrderLine, as: 'lines' }],
      order: [['createdAt', 'ASC']]
    });
    res.json({ orders });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/orders', orderWriteAccess, async (req, res, next) => {
  try {
    const waiterUserId = await resolveWaiterUserId(req);
    const result = await createRestaurantOrder({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      tableId: req.body?.tableId,
      lines: req.body?.lines,
      waiterUserId,
      actorUserId: req.userId,
      notes: req.body?.notes,
      idempotencyKey: cleanText(req.header('Idempotency-Key') || req.body?.idempotencyKey, 180)
    });
    if (!result.replayed) await audit(req, 'RESTAURANT_ORDER_OPENED', 'Order', result.order.id, { orderNumber: result.order.orderNumber, tableId: result.order.tableId, waiterUserId });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/orders/:orderId/lines', orderWriteAccess, async (req, res, next) => {
  try {
    const order = await loadOrder(req);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (!canOperateOrder(req, order)) return res.status(403).json({ message: 'Waiters can only change their own orders.', code: 'ORDER_ACCESS_DENIED' });
    const updated = await addRestaurantLines({ order, lines: req.body?.lines, actorUserId: req.userId });
    await audit(req, 'RESTAURANT_ORDER_ITEMS_ADDED', 'Order', order.id, { addedLineCount: Array.isArray(req.body?.lines) ? req.body.lines.length : 0 });
    res.json({ order: updated });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/orders/:orderId/status', orderWriteAccess, async (req, res, next) => {
  try {
    const order = await loadOrder(req);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (!canOperateOrder(req, order)) return res.status(403).json({ message: 'Waiters can only change their own orders.', code: 'ORDER_ACCESS_DENIED' });
    const nextStatus = String(req.body?.status || '').toUpperCase();
    if (!['SERVED', 'AWAITING_PAYMENT'].includes(nextStatus)) return res.status(400).json({ message: 'Status must be SERVED or AWAITING_PAYMENT.' });
    const updated = await setRestaurantStatus({ orderId: order.id, tenantId: req.params.tenantId, branchId: req.params.branchId, nextStatus });
    if (nextStatus === 'AWAITING_PAYMENT') await RestaurantNotification.findOrCreate({
      where: { tenantId: req.params.tenantId, dedupeKey: `bill-ready:${order.id}` },
      defaults: { tenantId: req.params.tenantId, branchId: req.params.branchId, role: 'CASHIER', type: 'BILL_READY', title: 'Bill ready to collect', message: `${order.orderNumber} is waiting for payment.`, entityType: 'Order', entityId: order.id, dedupeKey: `bill-ready:${order.id}` }
    });
    await audit(req, 'RESTAURANT_ORDER_STATUS_CHANGED', 'Order', order.id, { previous: order.status, status: nextStatus });
    res.json({ order: updated });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/orders/:orderId/pay', paymentAccess, async (req, res, next) => {
  try {
    const order = await loadOrder(req);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    if (callerRole(req) === 'WAITER' && String(order.waiterUserId || '') !== String(req.userId)) {
      return res.status(403).json({ message: 'Waiters can only settle their own orders.', code: 'ORDER_ACCESS_DENIED' });
    }
    const splitPayments = Array.isArray(req.body?.payments) ? req.body.payments : null;
    const paymentMethod = String(req.body?.paymentMethod || splitPayments?.[0]?.method || '').toUpperCase();
    const requestedMethods = splitPayments?.map((row) => String(row?.method || '').toUpperCase()) || [paymentMethod];
    if (!requestedMethods.length || requestedMethods.some((method) => !PAYMENT_METHODS.includes(method))) {
      return res.status(400).json({ message: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}` });
    }
    const settings = await BranchSettings.findOne({ where: { tenantId: req.params.tenantId, branchId: req.params.branchId } });
    const disabledMethod = settings && requestedMethods.find((method) => !(settings.allowedPaymentMethods || []).includes(method));
    if (disabledMethod) return res.status(409).json({ message: `${disabledMethod} is disabled in branch settings.`, code: 'PAYMENT_METHOD_DISABLED' });
    const updated = await payRestaurantOrder({
      orderId: order.id,
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      paymentMethod,
      payments: splitPayments,
      paymentReference: req.body?.paymentReference,
      actorUserId: req.userId
    });
    await audit(req, 'RESTAURANT_ORDER_PAID', 'Order', order.id, { orderNumber: order.orderNumber, totalMinor: order.totalMinor, paymentMethods: requestedMethods });
    res.json({ order: updated });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/recipes/:productId', managerAccess, async (req, res, next) => {
  try {
    const components = await RecipeComponent.findAll({ where: { tenantId: req.params.tenantId, branchId: req.params.branchId, outputProductId: req.params.productId, active: true }, order: [['createdAt', 'ASC']] });
    res.json({ components });
  } catch (error) { next(error); }
});

router.put('/tenants/:tenantId/branches/:branchId/recipes/:productId', managerAccess, async (req, res, next) => {
  try {
    const output = await Product.findOne({ where: { id: req.params.productId, tenantId: req.params.tenantId, status: 'ACTIVE' } });
    if (!output) return res.status(404).json({ message: 'Menu product not found.' });
    const rows = Array.isArray(req.body?.components) ? req.body.components.slice(0, 100) : [];
    const prepared = [];
    for (const [index, row] of rows.entries()) {
      const ingredient = await Product.findOne({ where: { id: row?.ingredientProductId, tenantId: req.params.tenantId, status: 'ACTIVE' } });
      if (!ingredient || String(ingredient.id) === String(output.id)) return res.status(400).json({ message: `Recipe line ${index + 1} has an invalid ingredient.` });
      let priceOptionId = row?.priceOptionId || null;
      if (priceOptionId) {
        const option = await ProductPriceOption.findOne({ where: { id: priceOptionId, productId: output.id, branchId: req.params.branchId, active: true } });
        if (!option) return res.status(400).json({ message: `Recipe line ${index + 1} has an invalid variant.` });
      }
      const quantity = Number(row?.quantityBasePerUnit);
      const waste = Number(row?.wastePercent || 0);
      if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000000 || !Number.isFinite(waste) || waste < 0 || waste > 100) return res.status(400).json({ message: `Recipe line ${index + 1} has invalid quantity or waste.` });
      prepared.push({ tenantId: req.params.tenantId, branchId: req.params.branchId, outputProductId: output.id, priceOptionId, ingredientProductId: ingredient.id, quantityBasePerUnit: quantity.toFixed(3), wastePercent: waste.toFixed(3), active: true });
    }
    await sequelize.transaction(async (transaction) => {
      await RecipeComponent.destroy({ where: { tenantId: req.params.tenantId, branchId: req.params.branchId, outputProductId: output.id }, transaction });
      if (prepared.length) await RecipeComponent.bulkCreate(prepared, { transaction });
    });
    await audit(req, 'RECIPE_REPLACED', 'Product', output.id, { componentCount: prepared.length });
    const components = await RecipeComponent.findAll({ where: { tenantId: req.params.tenantId, branchId: req.params.branchId, outputProductId: output.id, active: true } });
    res.json({ components });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/orders/:orderId/move', managerAccess, async (req, res, next) => {
  try {
    const updated = await moveRestaurantOrder({
      orderId: req.params.orderId,
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      destinationTableId: req.body?.destinationTableId
    });
    await audit(req, 'RESTAURANT_ORDER_MOVED', 'Order', updated.id, { orderNumber: updated.orderNumber, destinationTableId: updated.tableId });
    res.json({ order: updated });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/orders/:orderId/merge', managerAccess, async (req, res, next) => {
  try {
    const updated = await mergeRestaurantOrders({
      sourceOrderId: req.params.orderId,
      targetOrderId: req.body?.targetOrderId,
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      actorUserId: req.userId
    });
    await audit(req, 'RESTAURANT_ORDERS_MERGED', 'Order', updated.id, { sourceOrderId: req.params.orderId, targetOrderId: updated.id, orderNumber: updated.orderNumber });
    res.json({ order: updated });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/orders/:orderId/split', managerAccess, async (req, res, next) => {
  try {
    const result = await splitRestaurantOrder({
      orderId: req.params.orderId,
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      destinationTableId: req.body?.destinationTableId,
      lines: req.body?.lines,
      actorUserId: req.userId,
      idempotencyKey: cleanText(req.header('Idempotency-Key') || req.body?.idempotencyKey, 180)
    });
    if (!result.replayed) await audit(req, 'RESTAURANT_ORDER_SPLIT', 'Order', result.order.id, { sourceOrderId: req.params.orderId, destinationTableId: result.order.tableId, orderNumber: result.order.orderNumber });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/orders/:orderId/cancel', managerAccess, async (req, res, next) => {
  try {
    const reason = cleanText(req.body?.reason, 2000);
    if (!reason) return res.status(400).json({ message: 'Manager cancellation reason is required.' });
    const order = await loadOrder(req);
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    const updated = await cancelRestaurantOrder({
      orderId: order.id,
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      reason,
      approvedByUserId: req.userId
    });
    await audit(req, 'RESTAURANT_ORDER_CANCELLED', 'Order', order.id, { orderNumber: order.orderNumber, reason, restoredStock: true });
    res.json({ order: updated });
  } catch (error) { next(error); }
});

module.exports = router;
