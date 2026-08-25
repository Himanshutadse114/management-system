const crypto = require('crypto');
const express = require('express');
const { Op } = require('sequelize');
const {
  AuditLog,
  BranchMembership,
  Product,
  ProductPriceOption,
  User
} = require('../models');
const { RestaurantTable, MenuItem } = require('../models/restaurant');
const { Order, OrderLine, Payment, PAYMENT_METHODS } = require('../models/sales');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');
const {
  createRestaurantOrder,
  addRestaurantLines,
  setRestaurantStatus,
  payRestaurantOrder,
  cancelRestaurantOrder
} = require('../services/restaurantService');

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
    const product = await Product.findOne({ where: { id: req.body?.productId, tenantId: req.params.tenantId, status: 'ACTIVE' } });
    if (!product) return res.status(404).json({ message: 'Active product not found.' });
    const priceCount = await ProductPriceOption.count({ where: { productId: product.id, branchId: req.params.branchId, active: true } });
    if (!priceCount) return res.status(400).json({ message: 'Add at least one active branch price option before publishing the product to the menu.' });
    const [item, created] = await MenuItem.findOrCreate({
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
        dietaryTags: Array.isArray(req.body?.dietaryTags) ? req.body.dietaryTags.slice(0, 20) : null
      }
    });
    if (!created) {
      item.displayName = cleanText(req.body?.displayName, 180) || item.displayName || product.name;
      item.description = req.body?.description !== undefined ? cleanText(req.body.description, 2000) : item.description;
      item.sectionName = cleanText(req.body?.sectionName, 100) || item.sectionName || 'Menu';
      if (Number.isInteger(req.body?.sortOrder)) item.sortOrder = req.body.sortOrder;
      if (req.body?.featured !== undefined) item.featured = Boolean(req.body.featured);
      if (req.body?.active !== undefined) item.active = Boolean(req.body.active);
      if (Array.isArray(req.body?.dietaryTags)) item.dietaryTags = req.body.dietaryTags.slice(0, 20);
      await item.save();
    }
    await audit(req, created ? 'MENU_ITEM_PUBLISHED' : 'MENU_ITEM_UPDATED', 'MenuItem', item.id, { productId: product.id, sectionName: item.sectionName });
    res.status(created ? 201 : 200).json({ item });
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
    const paymentMethod = String(req.body?.paymentMethod || '').toUpperCase();
    if (!PAYMENT_METHODS.includes(paymentMethod)) return res.status(400).json({ message: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}` });
    const updated = await payRestaurantOrder({
      orderId: order.id,
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      paymentMethod,
      paymentReference: req.body?.paymentReference,
      actorUserId: req.userId
    });
    await audit(req, 'RESTAURANT_ORDER_PAID', 'Order', order.id, { orderNumber: order.orderNumber, totalMinor: order.totalMinor, paymentMethod });
    res.json({ order: updated });
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
