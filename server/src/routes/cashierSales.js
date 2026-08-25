const express = require('express');
const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const { AuditLog, Product, ProductPriceOption, InventoryBalance } = require('../models');
const { Order, OrderLine, Payment, PAYMENT_METHODS } = require('../models/sales');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');
const { effectiveRole } = require('../security/rolePolicy');
const { postCounterSale } = require('../services/salesService');
const { minorInteger } = require('../services/inventoryService');

const router = express.Router();
router.use(authenticate, requireApproved);

function cashierScope(req, res, next) {
  return requireBranchRoles('CASHIER')(req, res, (error) => {
    if (error) return next(error);
    if (effectiveRole(req.access, req.params.tenantId, req.params.branchId) !== 'CASHIER') return next('route');
    if (!req.branch || String(req.branch.tenantId) !== String(req.params.tenantId)) {
      return res.status(404).json({ message: 'Branch not found in this tenant.' });
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
  const { costAmountMinor, ...safe } = value;
  return safe;
}

function safeOrder(order) {
  const value = order.toJSON ? order.toJSON() : order;
  const { cogsMinor, grossProfitMinor, ...safe } = value;
  safe.lines = (value.lines || []).map(safeLine);
  return safe;
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

router.get('/tenants/:tenantId/branches/:branchId/catalogue', cashierScope, async (req, res, next) => {
  try {
    const search = cleanText(req.query.search, 120);
    const where = { tenantId: req.params.tenantId, status: 'ACTIVE' };
    if (search) {
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { brand: { [Op.iLike]: `%${search}%` } },
        { sku: { [Op.iLike]: `%${search}%` } },
        { barcode: { [Op.iLike]: `%${search}%` } }
      ];
    }
    const products = await Product.findAll({
      where,
      attributes: ['id', 'name', 'brand', 'sku', 'barcode', 'productType', 'trackInventory', 'imageObjectKey'],
      include: [
        { model: ProductPriceOption, as: 'priceOptions', where: { branchId: req.params.branchId, active: true }, required: true, attributes: ['id', 'label', 'quantityBaseUnits', 'priceMinor', 'sortOrder'] },
        { model: InventoryBalance, as: 'inventoryBalances', where: { branchId: req.params.branchId }, required: false, attributes: ['quantityBase'] }
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
          sku: value.sku,
          barcode: value.barcode,
          productType: value.productType,
          imageUrl: mediaUrl(value.imageObjectKey),
          available,
          priceOptions: available ? (value.priceOptions || []) : []
        };
      })
    });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/checkout', cashierScope, async (req, res, next) => {
  try {
    const paymentMethod = String(req.body?.paymentMethod || '').toUpperCase();
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ message: `paymentMethod must be one of: ${PAYMENT_METHODS.join(', ')}` });
    }
    const discountMinor = req.body?.discountMinor == null ? '0' : minorInteger(req.body.discountMinor, 'discountMinor').toString();
    const taxMinor = req.body?.taxMinor == null ? '0' : minorInteger(req.body.taxMinor, 'taxMinor').toString();
    const idempotencyKey = cleanText(req.header('Idempotency-Key') || req.body?.idempotencyKey, 180);
    const result = await postCounterSale({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      orderType: req.branch.type === 'WINE_SHOP' ? 'WINE_SHOP' : 'COUNTER',
      lines: req.body?.lines,
      discountMinor,
      taxMinor,
      paymentMethod,
      paymentReference: req.body?.paymentReference,
      notes: req.body?.notes,
      idempotencyKey,
      actorUserId: req.userId
    });
    if (!result.replayed) await audit(req, 'COUNTER_SALE_PAID', result.order.id, { orderNumber: result.order.orderNumber, totalMinor: result.order.totalMinor, paymentMethod });
    res.status(result.replayed ? 200 : 201).json({ ...result, order: safeOrder(result.order) });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/orders', cashierScope, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const orders = await Order.findAll({
      where: {
        tenantId: req.params.tenantId,
        branchId: req.params.branchId,
        status: 'PAID',
        orderType: { [Op.in]: ['COUNTER', 'WINE_SHOP'] },
        closedByUserId: req.userId
      },
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }],
      order: [['createdAt', 'DESC']],
      limit
    });
    res.json({ orders: orders.map(safeOrder) });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/orders/:orderId', cashierScope, async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: { id: req.params.orderId, tenantId: req.params.tenantId, branchId: req.params.branchId, closedByUserId: req.userId },
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }]
    });
    if (!order) return res.status(404).json({ message: 'Sale not found in your cashier history.' });
    res.json({ order: safeOrder(order) });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/summary', cashierScope, async (req, res, next) => {
  try {
    const timezone = req.branch.timezone || 'Asia/Kolkata';
    const rows = await sequelize.query(`
      SELECT COUNT(*)::int AS "orderCount",
        COALESCE(SUM("totalMinor"), 0)::text AS "salesMinor",
        COALESCE(SUM("subtotalMinor" - "discountMinor"), 0)::text AS "netSalesBeforeTaxMinor",
        COALESCE(SUM("discountMinor"), 0)::text AS "discountMinor"
      FROM orders
      WHERE "tenantId" = :tenantId AND "branchId" = :branchId AND status = 'PAID'
        AND "closedByUserId" = :userId
        AND ("paidAt" AT TIME ZONE :timezone)::date = (NOW() AT TIME ZONE :timezone)::date
    `, { replacements: { tenantId: req.params.tenantId, branchId: req.params.branchId, userId: req.userId, timezone }, type: QueryTypes.SELECT });

    const paymentMix = await sequelize.query(`
      SELECT p.method, COALESCE(SUM(p."amountMinor"), 0)::text AS "amountMinor"
      FROM payments p JOIN orders o ON o.id = p."orderId"
      WHERE p."tenantId" = :tenantId AND p."branchId" = :branchId AND o.status = 'PAID'
        AND o."closedByUserId" = :userId
        AND (o."paidAt" AT TIME ZONE :timezone)::date = (NOW() AT TIME ZONE :timezone)::date
      GROUP BY p.method ORDER BY p.method ASC
    `, { replacements: { tenantId: req.params.tenantId, branchId: req.params.branchId, userId: req.userId, timezone }, type: QueryTypes.SELECT });

    res.json({ summary: { ...(rows[0] || {}), paymentMix } });
  } catch (error) { next(error); }
});

module.exports = router;
