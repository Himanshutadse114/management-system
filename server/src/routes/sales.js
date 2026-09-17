const express = require('express');
const { Op, QueryTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  AuditLog,
  Product,
  ProductPriceOption,
  InventoryBalance,
  BranchSettings
} = require('../models');
const { Order, OrderLine, Payment, SalesRefund, PAYMENT_METHODS } = require('../models/sales');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');
const { postCounterSale, refundPaidOrder } = require('../services/salesService');
const { minorInteger } = require('../services/inventoryService');

const router = express.Router();
const SALES_READ_ROLES = ['BRANCH_MANAGER', 'CASHIER', 'AUDITOR'];
const SALES_WRITE_ROLES = ['BRANCH_MANAGER', 'CASHIER'];

router.use(authenticate, requireApproved);

function scopedAccess(roles) {
  return (req, res, next) => requireBranchRoles(...roles)(req, res, (error) => {
    if (error) return next(error);
    if (!req.branch || String(req.branch.tenantId) !== String(req.params.tenantId)) {
      return res.status(404).json({ message: 'Branch not found in this tenant.', code: 'BRANCH_SCOPE_MISMATCH' });
    }
    next();
  });
}

const readAccess = scopedAccess(SALES_READ_ROLES);
const writeAccess = scopedAccess(SALES_WRITE_ROLES);

function cleanText(value, max = 255) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

function imageUrl(objectKey) {
  const base = String(process.env.PUBLIC_MEDIA_BASE_URL || '').trim().replace(/\/$/, '');
  return base && objectKey ? `${base}/${objectKey}` : null;
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

router.get('/tenants/:tenantId/branches/:branchId/catalogue', readAccess, async (req, res, next) => {
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
      attributes: ['id', 'name', 'brand', 'sku', 'barcode', 'productType', 'inventoryUnit', 'bottleVolumeMl', 'trackInventory', 'imageObjectKey'],
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
        return {
          ...value,
          imageUrl: imageUrl(value.imageObjectKey),
          availableQuantityBase: value.inventoryBalances?.[0]?.quantityBase || '0.000',
          inventoryBalances: undefined,
          imageObjectKey: undefined
        };
      })
    });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/checkout', writeAccess, async (req, res, next) => {
  try {
    const paymentMethod = String(req.body?.paymentMethod || '').toUpperCase();
    const splitPayments = Array.isArray(req.body?.payments) && req.body.payments.length ? req.body.payments : null;
    const requestedMethods = splitPayments ? splitPayments.map((row) => String(row.method || '').toUpperCase()) : [paymentMethod];
    if (requestedMethods.some((method) => !PAYMENT_METHODS.includes(method))) {
      return res.status(400).json({ message: `paymentMethod must be one of: ${PAYMENT_METHODS.join(', ')}` });
    }
    const settings = await BranchSettings.findOne({ where: { tenantId: req.params.tenantId, branchId: req.params.branchId } });
    if (settings && requestedMethods.some((method) => !(settings.allowedPaymentMethods || []).includes(method))) return res.status(409).json({ message: 'One or more payment methods are disabled in branch settings.', code: 'PAYMENT_METHOD_DISABLED' });

    const discountMinor = req.body?.discountMinor == null ? '0' : minorInteger(req.body.discountMinor, 'discountMinor').toString();
    const taxMinor = req.body?.taxMinor == null ? '0' : minorInteger(req.body.taxMinor, 'taxMinor').toString();
    const idempotencyKey = cleanText(req.header('Idempotency-Key') || req.body?.idempotencyKey, 180);
    const orderType = req.branch.type === 'WINE_SHOP' ? 'WINE_SHOP' : 'COUNTER';
    const discountReason = cleanText(req.body?.discountReason, 500);
    if (BigInt(discountMinor) > 0n && !discountReason) return res.status(400).json({ message: 'Discount reason is required for manager approval.' });

    const result = await postCounterSale({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      orderType,
      lines: req.body?.lines,
      discountMinor,
      taxMinor,
      paymentMethod,
      paymentReference: req.body?.paymentReference,
      payments: splitPayments,
      notes: [req.body?.notes, discountReason ? `Discount approved: ${discountReason}` : null].filter(Boolean).join('\n') || null,
      idempotencyKey,
      actorUserId: req.userId,
      allowPriceOverride: true
    });

    if (!result.replayed) {
      await audit(req, 'COUNTER_SALE_PAID', 'Order', result.order.id, {
        orderNumber: result.order.orderNumber,
        totalMinor: result.order.totalMinor,
        cogsMinor: result.order.cogsMinor,
        grossProfitMinor: result.order.grossProfitMinor,
        paymentMethods: requestedMethods,
        discountReason,
        priceOverrides: (req.body?.lines || []).filter((line) => line.unitPriceMinorOverride != null).map((line) => ({ priceOptionId: line.priceOptionId, unitPriceMinorOverride: line.unitPriceMinorOverride, reason: cleanText(line.priceOverrideReason, 500) }))
      });
    }
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'Duplicate checkout request.' });
    next(error);
  }
});

router.get('/tenants/:tenantId/branches/:branchId/orders', readAccess, async (req, res, next) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 60), 1), 200);
    const where = { tenantId: req.params.tenantId, branchId: req.params.branchId };
    if (req.query.status) where.status = String(req.query.status).toUpperCase();
    const orders = await Order.findAll({
      where,
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }, { model: SalesRefund, as: 'refunds' }],
      order: [['createdAt', 'DESC']],
      limit
    });
    res.json({ orders });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/orders/:orderId', readAccess, async (req, res, next) => {
  try {
    const order = await Order.findOne({
      where: { id: req.params.orderId, tenantId: req.params.tenantId, branchId: req.params.branchId },
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }, { model: SalesRefund, as: 'refunds' }]
    });
    if (!order) return res.status(404).json({ message: 'Order not found.' });
    res.json({ order });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/orders/:orderId/refund', writeAccess, async (req, res, next) => {
  try {
    const result = await refundPaidOrder({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      orderId: req.params.orderId,
      reason: req.body?.reason,
      stockDisposition: req.body?.stockDisposition,
      refundMethod: req.body?.refundMethod,
      idempotencyKey: cleanText(req.header('Idempotency-Key') || req.body?.idempotencyKey, 180),
      actorUserId: req.userId
    });
    if (!result.replayed) {
      await audit(req, 'SALE_REFUNDED', 'SalesRefund', result.refund.id, {
        orderId: req.params.orderId,
        amountMinor: result.refund.amountMinor,
        method: result.refund.method,
        stockDisposition: result.refund.stockDisposition,
        reason: result.refund.reason
      });
    }
    res.json(result);
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/summary', readAccess, async (req, res, next) => {
  try {
    const timezone = req.branch.timezone || 'Asia/Kolkata';
    const rows = await sequelize.query(`
      SELECT
        COUNT(*)::int AS "orderCount",
        COALESCE(SUM("totalMinor"), 0)::text AS "salesMinor",
        COALESCE(SUM("subtotalMinor" - "discountMinor"), 0)::text AS "netSalesBeforeTaxMinor",
        COALESCE(SUM("cogsMinor"), 0)::text AS "cogsMinor",
        COALESCE(SUM("grossProfitMinor"), 0)::text AS "grossProfitMinor",
        COALESCE(SUM("discountMinor"), 0)::text AS "discountMinor"
      FROM orders
      WHERE "tenantId" = :tenantId
        AND "branchId" = :branchId
        AND status = 'PAID'
        AND ("paidAt" AT TIME ZONE :timezone)::date = (NOW() AT TIME ZONE :timezone)::date
    `, {
      replacements: { tenantId: req.params.tenantId, branchId: req.params.branchId, timezone },
      type: QueryTypes.SELECT
    });

    const paymentRows = await sequelize.query(`
      SELECT p.method, COALESCE(SUM(p."amountMinor"), 0)::text AS "amountMinor"
      FROM payments p
      JOIN orders o ON o.id = p."orderId"
      WHERE p."tenantId" = :tenantId
        AND p."branchId" = :branchId
        AND o.status = 'PAID'
        AND (o."paidAt" AT TIME ZONE :timezone)::date = (NOW() AT TIME ZONE :timezone)::date
      GROUP BY p.method
      ORDER BY p.method ASC
    `, {
      replacements: { tenantId: req.params.tenantId, branchId: req.params.branchId, timezone },
      type: QueryTypes.SELECT
    });

    res.json({ summary: { ...(rows[0] || {}), paymentMix: paymentRows } });
  } catch (error) { next(error); }
});

module.exports = router;
