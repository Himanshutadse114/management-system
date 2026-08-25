const express = require('express');
const { Op } = require('sequelize');
const { AuditLog, Product, ProductPriceOption, InventoryBalance } = require('../models');
const { RestaurantTable } = require('../models/restaurant');
const { Order, OrderLine } = require('../models/sales');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');
const { createRestaurantOrder, addRestaurantLines, setRestaurantStatus } = require('../services/restaurantService');

const router = express.Router();
router.use(authenticate, requireApproved);

function waiterScope(req, res, next) {
  return requireBranchRoles('WAITER')(req, res, (error) => {
    if (error) return next(error);
    if (!req.branch || String(req.branch.tenantId) !== String(req.params.tenantId)) {
      return res.status(404).json({ message: 'Branch not found in this tenant.' });
    }
    if (req.branch.type !== 'BAR_RESTAURANT') {
      return res.status(409).json({ message: 'Table service is only available for Bar + Restaurant branches.' });
    }
    next();
  });
}

function mediaUrl(objectKey) {
  const base = String(process.env.PUBLIC_MEDIA_BASE_URL || '').trim().replace(/\/$/, '');
  return base && objectKey ? `${base}/${objectKey}` : null;
}

function cleanText(value, max = 255) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

function safeLine(line) {
  const value = line.toJSON ? line.toJSON() : line;
  return {
    id: value.id,
    productId: value.productId,
    priceOptionId: value.priceOptionId,
    productNameSnapshot: value.productNameSnapshot,
    priceLabelSnapshot: value.priceLabelSnapshot,
    quantityUnits: value.quantityUnits,
    baseQuantityPerUnit: value.baseQuantityPerUnit,
    totalBaseQuantity: value.totalBaseQuantity,
    unitPriceMinor: value.unitPriceMinor,
    lineSubtotalMinor: value.lineSubtotalMinor,
    status: value.status,
    createdAt: value.createdAt
  };
}

function safeOrder(order, table = null) {
  const value = order.toJSON ? order.toJSON() : order;
  return {
    id: value.id,
    tenantId: value.tenantId,
    branchId: value.branchId,
    orderNumber: value.orderNumber,
    orderType: value.orderType,
    status: value.status,
    tableId: value.tableId,
    waiterUserId: value.waiterUserId,
    subtotalMinor: value.subtotalMinor,
    discountMinor: value.discountMinor,
    taxMinor: value.taxMinor,
    totalMinor: value.totalMinor,
    notes: value.notes,
    acceptedAt: value.acceptedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    table: table ? { id: table.id, name: table.name, code: table.code, seats: table.seats } : null,
    lines: (value.lines || []).map(safeLine)
  };
}

async function audit(req, action, entityId, metadata = null) {
  await AuditLog.create({
    tenantId: req.params.tenantId,
    branchId: req.params.branchId,
    actorUserId: req.userId,
    action,
    entityType: 'Order',
    entityId: entityId ? String(entityId) : null,
    metadata,
    ipAddress: req.ip || null
  });
}

async function loadOwnOrder(req) {
  return Order.findOne({
    where: {
      id: req.params.orderId,
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      orderType: 'RESTAURANT',
      waiterUserId: req.userId
    },
    include: [{ model: OrderLine, as: 'lines' }]
  });
}

router.get('/waiter/tenants/:tenantId/branches/:branchId/catalogue', waiterScope, async (req, res, next) => {
  try {
    const products = await Product.findAll({
      where: { tenantId: req.params.tenantId, status: 'ACTIVE' },
      attributes: ['id', 'name', 'brand', 'productType', 'trackInventory', 'imageObjectKey'],
      include: [
        {
          model: ProductPriceOption,
          as: 'priceOptions',
          where: { branchId: req.params.branchId, active: true },
          required: true,
          attributes: ['id', 'label', 'quantityBaseUnits', 'priceMinor', 'sortOrder']
        },
        {
          model: InventoryBalance,
          as: 'inventoryBalances',
          where: { branchId: req.params.branchId },
          required: false,
          attributes: ['quantityBase']
        }
      ],
      order: [['name', 'ASC'], [{ model: ProductPriceOption, as: 'priceOptions' }, 'sortOrder', 'ASC']]
    });

    res.json({
      branch: { id: req.branch.id, name: req.branch.name, code: req.branch.code, type: req.branch.type, currency: req.branch.currency },
      products: products.map((product) => {
        const value = product.toJSON();
        const available = value.trackInventory === false || Number(value.inventoryBalances?.[0]?.quantityBase || 0) > 0;
        return {
          id: value.id,
          name: value.name,
          brand: value.brand,
          productType: value.productType,
          imageUrl: mediaUrl(value.imageObjectKey),
          available,
          priceOptions: available ? (value.priceOptions || []) : []
        };
      })
    });
  } catch (error) { next(error); }
});

router.get('/waiter/tenants/:tenantId/branches/:branchId/tables', waiterScope, async (req, res, next) => {
  try {
    const tables = await RestaurantTable.findAll({
      where: { tenantId: req.params.tenantId, branchId: req.params.branchId, status: 'ACTIVE' },
      order: [['code', 'ASC']]
    });
    const activeOrders = await Order.findAll({
      where: {
        tenantId: req.params.tenantId,
        branchId: req.params.branchId,
        orderType: 'RESTAURANT',
        status: { [Op.in]: ['OPEN', 'SERVED', 'AWAITING_PAYMENT'] }
      },
      attributes: ['id', 'orderNumber', 'tableId', 'status', 'waiterUserId']
    });
    const byTable = new Map(activeOrders.map((order) => [String(order.tableId), order]));
    res.json({
      tables: tables.map((table) => {
        const active = byTable.get(String(table.id));
        const own = active && String(active.waiterUserId || '') === String(req.userId);
        return {
          id: table.id,
          name: table.name,
          code: table.code,
          seats: table.seats,
          status: table.status,
          activeOrder: !active ? null : own
            ? { id: active.id, orderNumber: active.orderNumber, status: active.status, own: true }
            : { occupied: true, own: false }
        };
      })
    });
  } catch (error) { next(error); }
});

router.get('/waiter/tenants/:tenantId/branches/:branchId/orders', waiterScope, async (req, res, next) => {
  try {
    const where = {
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      orderType: 'RESTAURANT',
      waiterUserId: req.userId
    };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    const orders = await Order.findAll({
      where,
      include: [{ model: OrderLine, as: 'lines' }],
      order: [['createdAt', 'DESC']],
      limit: 100
    });
    const tableIds = [...new Set(orders.map((order) => order.tableId).filter(Boolean))];
    const tables = tableIds.length ? await RestaurantTable.findAll({ where: { id: { [Op.in]: tableIds }, branchId: req.params.branchId } }) : [];
    const tableMap = new Map(tables.map((table) => [String(table.id), table]));
    res.json({ orders: orders.map((order) => safeOrder(order, tableMap.get(String(order.tableId)))) });
  } catch (error) { next(error); }
});

router.get('/waiter/tenants/:tenantId/branches/:branchId/unresolved', waiterScope, async (req, res, next) => {
  try {
    const orders = await Order.findAll({
      where: {
        tenantId: req.params.tenantId,
        branchId: req.params.branchId,
        orderType: 'RESTAURANT',
        waiterUserId: req.userId,
        status: { [Op.in]: ['OPEN', 'SERVED', 'AWAITING_PAYMENT'] }
      },
      include: [{ model: OrderLine, as: 'lines' }],
      order: [['createdAt', 'ASC']]
    });
    res.json({ orders: orders.map((order) => safeOrder(order)) });
  } catch (error) { next(error); }
});

router.post('/waiter/tenants/:tenantId/branches/:branchId/orders', waiterScope, async (req, res, next) => {
  try {
    const result = await createRestaurantOrder({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      tableId: req.body?.tableId,
      lines: req.body?.lines,
      waiterUserId: req.userId,
      actorUserId: req.userId,
      notes: req.body?.notes,
      idempotencyKey: cleanText(req.header('Idempotency-Key') || req.body?.idempotencyKey, 180)
    });
    if (!result.replayed) await audit(req, 'WAITER_ORDER_OPENED', result.order.id, { orderNumber: result.order.orderNumber, tableId: result.order.tableId });
    const reloaded = await Order.findByPk(result.order.id, { include: [{ model: OrderLine, as: 'lines' }] });
    res.status(result.replayed ? 200 : 201).json({ replayed: result.replayed, order: safeOrder(reloaded) });
  } catch (error) { next(error); }
});

router.post('/waiter/tenants/:tenantId/branches/:branchId/orders/:orderId/lines', waiterScope, async (req, res, next) => {
  try {
    const order = await loadOwnOrder(req);
    if (!order) return res.status(404).json({ message: 'Your table order was not found.' });
    if (!['OPEN', 'SERVED'].includes(order.status)) return res.status(409).json({ message: 'Items cannot be added after payment has been requested.' });
    await addRestaurantLines({ order, lines: req.body?.lines, actorUserId: req.userId });
    await audit(req, 'WAITER_ORDER_ITEMS_ADDED', order.id, { addedLineCount: Array.isArray(req.body?.lines) ? req.body.lines.length : 0 });
    const reloaded = await loadOwnOrder(req);
    res.json({ order: safeOrder(reloaded) });
  } catch (error) { next(error); }
});

router.post('/waiter/tenants/:tenantId/branches/:branchId/orders/:orderId/status', waiterScope, async (req, res, next) => {
  try {
    const order = await loadOwnOrder(req);
    if (!order) return res.status(404).json({ message: 'Your table order was not found.' });
    const nextStatus = String(req.body?.status || '').toUpperCase();
    if (!['SERVED', 'AWAITING_PAYMENT'].includes(nextStatus)) return res.status(400).json({ message: 'Waiters can only mark an order served or request payment.' });
    const updated = await setRestaurantStatus({ orderId: order.id, tenantId: req.params.tenantId, branchId: req.params.branchId, nextStatus });
    await audit(req, 'WAITER_ORDER_STATUS_CHANGED', order.id, { previous: order.status, status: nextStatus });
    const value = updated.toJSON ? updated.toJSON() : updated;
    value.lines = order.lines || [];
    res.json({ order: safeOrder(value) });
  } catch (error) { next(error); }
});

module.exports = router;
