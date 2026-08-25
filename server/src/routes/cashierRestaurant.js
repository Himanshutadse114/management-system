const express = require('express');
const { Op } = require('sequelize');
const { AuditLog } = require('../models');
const { RestaurantTable } = require('../models/restaurant');
const { Order, OrderLine, PAYMENT_METHODS } = require('../models/sales');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');
const { effectiveRole } = require('../security/rolePolicy');
const { payRestaurantOrder } = require('../services/restaurantService');

const router = express.Router();
router.use(authenticate, requireApproved);

function cashierRestaurantScope(req, res, next) {
  if (effectiveRole(req.access, req.params.tenantId, req.params.branchId) !== 'CASHIER') return next('route');
  return requireBranchRoles('CASHIER')(req, res, (error) => {
    if (error) return next(error);
    if (!req.branch || String(req.branch.tenantId) !== String(req.params.tenantId)) {
      return res.status(404).json({ message: 'Branch not found in this tenant.' });
    }
    if (req.branch.type !== 'BAR_RESTAURANT') {
      return res.status(409).json({ message: 'Restaurant settlements are only available for Bar + Restaurant branches.' });
    }
    next();
  });
}

function safeLine(line) {
  const value = line.toJSON ? line.toJSON() : line;
  return {
    id: value.id,
    productNameSnapshot: value.productNameSnapshot,
    priceLabelSnapshot: value.priceLabelSnapshot,
    quantityUnits: value.quantityUnits,
    unitPriceMinor: value.unitPriceMinor,
    lineSubtotalMinor: value.lineSubtotalMinor,
    status: value.status
  };
}

function safeSettlement(order, table = null) {
  const value = order.toJSON ? order.toJSON() : order;
  return {
    id: value.id,
    orderNumber: value.orderNumber,
    status: value.status,
    tableId: value.tableId,
    waiterUserId: value.waiterUserId,
    subtotalMinor: value.subtotalMinor,
    discountMinor: value.discountMinor,
    taxMinor: value.taxMinor,
    totalMinor: value.totalMinor,
    createdAt: value.createdAt,
    table: table ? { id: table.id, name: table.name, code: table.code } : null,
    lines: (value.lines || []).map(safeLine)
  };
}

async function audit(req, action, order, metadata = null) {
  await AuditLog.create({
    tenantId: req.params.tenantId,
    branchId: req.params.branchId,
    actorUserId: req.userId,
    action,
    entityType: 'Order',
    entityId: String(order.id),
    metadata,
    ipAddress: req.ip || null
  });
}

router.get('/tenants/:tenantId/branches/:branchId/settlements', cashierRestaurantScope, async (req, res, next) => {
  try {
    const orders = await Order.findAll({
      where: {
        tenantId: req.params.tenantId,
        branchId: req.params.branchId,
        orderType: 'RESTAURANT',
        status: 'AWAITING_PAYMENT'
      },
      include: [{ model: OrderLine, as: 'lines' }],
      order: [['createdAt', 'ASC']],
      limit: 100
    });
    const tableIds = [...new Set(orders.map((order) => order.tableId).filter(Boolean))];
    const tables = tableIds.length ? await RestaurantTable.findAll({ where: { id: { [Op.in]: tableIds }, branchId: req.params.branchId } }) : [];
    const tableMap = new Map(tables.map((table) => [String(table.id), table]));
    res.json({ settlements: orders.map((order) => safeSettlement(order, tableMap.get(String(order.tableId)))) });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/orders/:orderId/pay', cashierRestaurantScope, async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: {
        id: req.params.orderId,
        tenantId: req.params.tenantId,
        branchId: req.params.branchId,
        orderType: 'RESTAURANT',
        status: 'AWAITING_PAYMENT'
      },
      include: [{ model: OrderLine, as: 'lines' }]
    });
    if (!order) return res.status(404).json({ message: 'Awaiting-payment restaurant order not found.' });

    const paymentMethod = String(req.body?.paymentMethod || '').toUpperCase();
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: `Payment method must be one of: ${PAYMENT_METHODS.join(', ')}` });
    }

    const updated = await payRestaurantOrder({
      orderId: order.id,
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      paymentMethod,
      paymentReference: req.body?.paymentReference,
      actorUserId: req.userId
    });
    await audit(req, 'RESTAURANT_ORDER_PAID', order, { orderNumber: order.orderNumber, totalMinor: order.totalMinor, paymentMethod });
    res.json({ order: safeSettlement(updated) });
  } catch (error) { next(error); }
});

module.exports = router;
