const crypto = require('crypto');
const Decimal = require('decimal.js');
const { sequelize } = require('../config/database');
const { Product, ProductPriceOption } = require('../models');
const { Order, OrderLine, Payment } = require('../models/sales');
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
  notes = null,
  idempotencyKey = null,
  actorUserId
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
      const unitPrice = BigInt(priceOption.priceMinor);
      const lineSubtotal = unitPrice * BigInt(units);
      const basePerUnit = new Decimal(priceOption.quantityBaseUnits);
      const totalBase = basePerUnit.times(units);

      prepared.push({ product, priceOption, units, unitPrice, lineSubtotal, basePerUnit, totalBase });
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
        priceLabelSnapshot: row.priceOption.label,
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

    await Payment.create({
      tenantId,
      branchId,
      orderId: order.id,
      method: paymentMethod,
      amountMinor: total.toString(),
      reference: paymentReference ? String(paymentReference).trim().slice(0, 180) : null,
      receivedByUserId: actorUserId
    }, { transaction });

    const fullOrder = await Order.findByPk(order.id, {
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }],
      transaction
    });
    return { order: fullOrder, replayed: false };
  });
}

module.exports = { postCounterSale };
