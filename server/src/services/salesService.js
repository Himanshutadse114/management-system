const crypto = require('crypto');
const Decimal = require('decimal.js');
const { sequelize } = require('../config/database');
const { Product, ProductPriceOption } = require('../models');
const { Order, OrderLine, Payment, SalesRefund, PAYMENT_METHODS } = require('../models/sales');
const { applyInventoryMovement, positiveDecimal, minorInteger } = require('./inventoryService');

function orderNumber() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `ORD-${y}${m}${d}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

function bigintSum(values) {
  return values.reduce((total, value) => total + BigInt(value || 0), 0n);
}

async function postCounterSale({
  tenantId,
  branchId,
  orderType,
  lines,
  discountMinor = '0',
  taxMinor = '0',
  paymentMethod,
  paymentReference = null,
  payments = null,
  notes = null,
  idempotencyKey = null,
  actorUserId,
  allowPriceOverride = false
}) {
  if (!Array.isArray(lines) || !lines.length) {
    const error = new Error('At least one sale line is required.');
    error.status = 400;
    throw error;
  }

  if (idempotencyKey) {
    const existing = await Order.findOne({
      where: { tenantId, idempotencyKey },
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }]
    });
    if (existing) return { order: existing, replayed: true };
  }

  const discount = minorInteger(discountMinor, 'discountMinor');
  const tax = minorInteger(taxMinor, 'taxMinor');

  return sequelize.transaction(async (transaction) => {
    const prepared = [];

    for (const [index, line] of lines.entries()) {
      const unitsDecimal = positiveDecimal(line.quantityUnits, `line ${index + 1} quantityUnits`);
      if (!unitsDecimal.isInteger()) {
        const error = new Error(`Sale line ${index + 1}: quantityUnits must be a whole number.`);
        error.status = 400;
        throw error;
      }
      const units = Number(unitsDecimal.toFixed(0));
      if (!Number.isSafeInteger(units) || units > 10000) {
        const error = new Error(`Sale line ${index + 1}: quantityUnits is out of range.`);
        error.status = 400;
        throw error;
      }

      const priceOption = await ProductPriceOption.findOne({
        where: {
          id: line.priceOptionId,
          tenantId,
          branchId,
          active: true
        },
        include: [{ model: Product, as: 'product', where: { tenantId, status: 'ACTIVE' }, required: true }],
        transaction
      });
      if (!priceOption || !priceOption.product) {
        const error = new Error(`Sale line ${index + 1}: price option is unavailable.`);
        error.status = 400;
        throw error;
      }

      const product = priceOption.product;
      let unitPrice = BigInt(priceOption.priceMinor);
      let priceOverrideReason = null;
      if (line.unitPriceMinorOverride != null && String(line.unitPriceMinorOverride).trim() !== '') {
        if (!allowPriceOverride) {
          const error = new Error('Price overrides require Branch Manager approval.');
          error.status = 403;
          error.code = 'PRICE_OVERRIDE_DENIED';
          throw error;
        }
        unitPrice = minorInteger(line.unitPriceMinorOverride, `line ${index + 1} unitPriceMinorOverride`);
        priceOverrideReason = String(line.priceOverrideReason || '').trim().slice(0, 500);
        if (!priceOverrideReason) {
          const error = new Error(`Sale line ${index + 1}: a price override reason is required.`);
          error.status = 400;
          throw error;
        }
      }
      const lineSubtotal = unitPrice * BigInt(units);
      const basePerUnit = new Decimal(priceOption.quantityBaseUnits);
      const totalBase = basePerUnit.times(units);

      prepared.push({ product, priceOption, units, unitPrice, lineSubtotal, basePerUnit, totalBase, priceOverrideReason });
    }

    const subtotal = bigintSum(prepared.map((row) => row.lineSubtotal));
    if (discount > subtotal) {
      const error = new Error('Discount cannot exceed the subtotal.');
      error.status = 400;
      throw error;
    }
    const total = subtotal - discount + tax;
    if (total < 0n) {
      const error = new Error('Sale total cannot be negative.');
      error.status = 400;
      throw error;
    }
    const paymentRows = Array.isArray(payments) && payments.length
      ? payments.map((payment, index) => ({ method: String(payment.method || '').toUpperCase(), amountMinor: minorInteger(payment.amountMinor, `payment ${index + 1} amountMinor`), reference: payment.reference ? String(payment.reference).trim().slice(0, 180) : null }))
      : [{ method: String(paymentMethod || '').toUpperCase(), amountMinor: total, reference: paymentReference ? String(paymentReference).trim().slice(0, 180) : null }];
    if (paymentRows.some((payment) => !PAYMENT_METHODS.includes(payment.method) || payment.amountMinor <= 0n)) {
      const error = new Error(`Every payment must have a positive amount and method: ${PAYMENT_METHODS.join(', ')}.`); error.status = 400; throw error;
    }
    if (bigintSum(paymentRows.map((payment) => payment.amountMinor)) !== total) {
      const error = new Error('Payment amounts must add up exactly to the order total.'); error.status = 400; error.code = 'PAYMENT_TOTAL_MISMATCH'; throw error;
    }

    const now = new Date();
    const order = await Order.create({
      tenantId,
      branchId,
      orderNumber: orderNumber(),
      orderType,
      status: 'PAID',
      openedByUserId: actorUserId,
      closedByUserId: actorUserId,
      subtotalMinor: subtotal.toString(),
      discountMinor: discount.toString(),
      taxMinor: tax.toString(),
      totalMinor: total.toString(),
      paidMinor: total.toString(),
      cogsMinor: '0',
      grossProfitMinor: '0',
      notes: notes ? String(notes).trim().slice(0, 4000) : null,
      idempotencyKey: idempotencyKey ? String(idempotencyKey).slice(0, 180) : null,
      acceptedAt: now,
      paidAt: now
    }, { transaction });

    let cogs = 0n;
    for (const row of prepared) {
      const line = await OrderLine.create({
        tenantId,
        branchId,
        orderId: order.id,
        productId: row.product.id,
        priceOptionId: row.priceOption.id,
        productNameSnapshot: row.product.name,
        priceLabelSnapshot: row.priceOverrideReason ? `${row.priceOption.label} · override approved` : row.priceOption.label,
        quantityUnits: row.units,
        baseQuantityPerUnit: row.basePerUnit.toDecimalPlaces(3).toFixed(3),
        totalBaseQuantity: row.totalBase.toDecimalPlaces(3).toFixed(3),
        unitPriceMinor: row.unitPrice.toString(),
        lineSubtotalMinor: row.lineSubtotal.toString(),
        costAmountMinor: '0',
        status: 'ACTIVE'
      }, { transaction });

      if (row.product.trackInventory) {
        const movementResult = await applyInventoryMovement({
          tenantId,
          branchId,
          productId: row.product.id,
          movementType: 'SALE',
          quantityDeltaBase: row.totalBase.negated(),
          referenceType: 'ORDER_LINE',
          referenceId: line.id,
          reason: `Sale ${order.orderNumber} · ${row.priceOption.label}`,
          idempotencyKey: `sale:${order.id}:${line.id}`,
          actorUserId,
          transaction
        });
        line.costAmountMinor = movementResult.movement.costAmountMinor;
        await line.save({ transaction });
        cogs += BigInt(movementResult.movement.costAmountMinor || 0);
      }
    }

    const netSalesBeforeTax = subtotal - discount;
    order.cogsMinor = cogs.toString();
    order.grossProfitMinor = (netSalesBeforeTax - cogs).toString();
    await order.save({ transaction });

    for (const payment of paymentRows) {
      await Payment.create({
        tenantId, branchId, orderId: order.id, method: payment.method,
        amountMinor: payment.amountMinor.toString(), reference: payment.reference,
        receivedByUserId: actorUserId
      }, { transaction });
    }

    const fullOrder = await Order.findByPk(order.id, {
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }],
      transaction
    });
    return { order: fullOrder, replayed: false };
  });
}

async function refundPaidOrder({
  tenantId,
  branchId,
  orderId,
  reason,
  stockDisposition = 'RESTOCK',
  refundMethod = null,
  idempotencyKey = null,
  actorUserId
}) {
  const safeReason = String(reason || '').trim().slice(0, 2000);
  if (!safeReason) {
    const error = new Error('Refund reason is required.');
    error.status = 400;
    throw error;
  }
  const disposition = String(stockDisposition || '').toUpperCase();
  if (!['RESTOCK', 'NO_RESTOCK'].includes(disposition)) {
    const error = new Error('stockDisposition must be RESTOCK or NO_RESTOCK.');
    error.status = 400;
    throw error;
  }
  const safeKey = idempotencyKey ? String(idempotencyKey).trim().slice(0, 180) : null;
  if (safeKey) {
    const replay = await SalesRefund.findOne({ where: { tenantId, idempotencyKey: safeKey } });
    if (replay) return { refund: replay, replayed: true };
  }

  return sequelize.transaction(async (transaction) => {
    const order = await Order.findOne({
      where: { id: orderId, tenantId, branchId },
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!order) {
      const error = new Error('Paid order not found.'); error.status = 404; throw error;
    }
    const existing = await SalesRefund.findOne({ where: { orderId: order.id }, transaction });
    if (existing) return { refund: existing, order, replayed: true };
    if (order.status !== 'PAID') {
      const error = new Error('Only a paid, non-refunded order can be refunded.'); error.status = 409; error.code = 'ORDER_NOT_REFUNDABLE'; throw error;
    }
    const originalPayment = order.payments?.[0] || null;
    const method = String(refundMethod || originalPayment?.method || 'OTHER').toUpperCase();
    if (!PAYMENT_METHODS.includes(method)) {
      const error = new Error(`refundMethod must be one of: ${PAYMENT_METHODS.join(', ')}`); error.status = 400; throw error;
    }

    const refund = await SalesRefund.create({
      tenantId,
      branchId,
      orderId: order.id,
      amountMinor: String(order.paidMinor || order.totalMinor || 0),
      method,
      stockDisposition: disposition,
      reason: safeReason,
      processedByUserId: actorUserId,
      cashierUserId: originalPayment?.receivedByUserId || order.closedByUserId || null,
      idempotencyKey: safeKey,
      processedAt: new Date()
    }, { transaction });

    if (disposition === 'RESTOCK') {
      for (const line of order.lines || []) {
        if (line.status !== 'ACTIVE') continue;
        const product = await Product.findOne({ where: { id: line.productId, tenantId }, transaction });
        if (!product?.trackInventory) continue;
        await applyInventoryMovement({
          tenantId,
          branchId,
          productId: line.productId,
          movementType: 'RETURN_IN',
          quantityDeltaBase: line.totalBaseQuantity,
          costAmountMinor: line.costAmountMinor,
          referenceType: 'SALES_REFUND',
          referenceId: refund.id,
          reason: `Refund ${order.orderNumber}: ${safeReason}`,
          idempotencyKey: `refund:${refund.id}:${line.id}`,
          actorUserId,
          transaction
        });
      }
    }

    order.status = 'REFUNDED';
    order.paidMinor = '0';
    await order.save({ transaction });
    return { refund, order, replayed: false };
  });
}

module.exports = { postCounterSale, refundPaidOrder };
