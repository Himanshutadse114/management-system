const crypto = require('crypto');
const Decimal = require('decimal.js');
const { sequelize } = require('../config/database');
const { Product, ProductPriceOption } = require('../models');
const { RestaurantTable } = require('../models/restaurant');
const { Order, OrderLine, Payment } = require('../models/sales');
const { applyInventoryMovement, positiveDecimal } = require('./inventoryService');

function orderNumber() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return `RST-${y}${m}${d}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
}

async function prepareLines({ tenantId, branchId, lines, transaction }) {
  if (!Array.isArray(lines) || !lines.length) {
    const error = new Error('At least one order line is required.');
    error.status = 400;
    throw error;
  }

  const prepared = [];
  for (const [index, line] of lines.entries()) {
    const qty = positiveDecimal(line.quantityUnits, `line ${index + 1} quantityUnits`);
    if (!qty.isInteger()) {
      const error = new Error(`Order line ${index + 1}: quantityUnits must be a whole number.`);
      error.status = 400;
      throw error;
    }
    const units = Number(qty.toFixed(0));
    if (!Number.isSafeInteger(units) || units > 500) {
      const error = new Error(`Order line ${index + 1}: quantityUnits is out of range.`);
      error.status = 400;
      throw error;
    }

    const priceOption = await ProductPriceOption.findOne({
      where: { id: line.priceOptionId, tenantId, branchId, active: true },
      include: [{ model: Product, as: 'product', where: { tenantId, status: 'ACTIVE' }, required: true }],
      transaction
    });
    if (!priceOption?.product) {
      const error = new Error(`Order line ${index + 1}: price option is unavailable.`);
      error.status = 400;
      throw error;
    }

    const unitPrice = BigInt(priceOption.priceMinor);
    const basePerUnit = new Decimal(priceOption.quantityBaseUnits);
    prepared.push({
      product: priceOption.product,
      priceOption,
      units,
      unitPrice,
      lineSubtotal: unitPrice * BigInt(units),
      basePerUnit,
      totalBase: basePerUnit.times(units)
    });
  }
  return prepared;
}

async function appendPreparedLines({ order, prepared, actorUserId, transaction }) {
  let addedSubtotal = 0n;
  let addedCogs = 0n;

  for (const row of prepared) {
    const line = await OrderLine.create({
      tenantId: order.tenantId,
      branchId: order.branchId,
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

    let lineCost = 0n;
    if (row.product.trackInventory) {
      const movement = await applyInventoryMovement({
        tenantId: order.tenantId,
        branchId: order.branchId,
        productId: row.product.id,
        movementType: 'SALE',
        quantityDeltaBase: row.totalBase.negated(),
        referenceType: 'ORDER_LINE',
        referenceId: line.id,
        reason: `Restaurant order ${order.orderNumber} · ${row.priceOption.label}`,
        idempotencyKey: `restaurant-sale:${order.id}:${line.id}`,
        actorUserId,
        transaction
      });
      lineCost = BigInt(movement.movement.costAmountMinor || 0);
      line.costAmountMinor = lineCost.toString();
      await line.save({ transaction });
    }

    addedSubtotal += row.lineSubtotal;
    addedCogs += lineCost;
  }

  return { addedSubtotal, addedCogs };
}

async function createRestaurantOrder({
  tenantId,
  branchId,
  tableId,
  lines,
  waiterUserId,
  actorUserId,
  notes = null,
  idempotencyKey = null
}) {
  if (idempotencyKey) {
    const existing = await Order.findOne({
      where: { tenantId, idempotencyKey },
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }]
    });
    if (existing) return { order: existing, replayed: true };
  }

  return sequelize.transaction(async (transaction) => {
    const table = await RestaurantTable.findOne({
      where: { id: tableId, tenantId, branchId, status: 'ACTIVE' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!table) {
      const error = new Error('Restaurant table not found.');
      error.status = 404;
      throw error;
    }

    const existingOpen = await Order.findOne({
      where: { tenantId, branchId, tableId, status: ['OPEN', 'SERVED', 'AWAITING_PAYMENT'] },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existingOpen) {
      const error = new Error(`Table already has active order ${existingOpen.orderNumber}.`);
      error.status = 409;
      error.code = 'TABLE_OCCUPIED';
      throw error;
    }

    const prepared = await prepareLines({ tenantId, branchId, lines, transaction });
    const order = await Order.create({
      tenantId,
      branchId,
      orderNumber: orderNumber(),
      orderType: 'RESTAURANT',
      status: 'OPEN',
      tableId,
      waiterUserId,
      openedByUserId: actorUserId,
      subtotalMinor: '0',
      discountMinor: '0',
      taxMinor: '0',
      totalMinor: '0',
      paidMinor: '0',
      cogsMinor: '0',
      grossProfitMinor: '0',
      notes: notes ? String(notes).trim().slice(0, 4000) : null,
      idempotencyKey: idempotencyKey ? String(idempotencyKey).slice(0, 180) : null,
      acceptedAt: new Date()
    }, { transaction });

    const totals = await appendPreparedLines({ order, prepared, actorUserId, transaction });
    order.subtotalMinor = totals.addedSubtotal.toString();
    order.totalMinor = totals.addedSubtotal.toString();
    order.cogsMinor = totals.addedCogs.toString();
    order.grossProfitMinor = (totals.addedSubtotal - totals.addedCogs).toString();
    await order.save({ transaction });

    const full = await Order.findByPk(order.id, {
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }],
      transaction
    });
    return { order: full, replayed: false };
  });
}

async function addRestaurantLines({ order, lines, actorUserId }) {
  return sequelize.transaction(async (transaction) => {
    const locked = await Order.findByPk(order.id, { transaction, lock: transaction.LOCK.UPDATE });
    if (!locked || !['OPEN', 'SERVED'].includes(locked.status)) {
      const error = new Error('Items can only be added to an open or served order.');
      error.status = 409;
      throw error;
    }

    const prepared = await prepareLines({ tenantId: locked.tenantId, branchId: locked.branchId, lines, transaction });
    const totals = await appendPreparedLines({ order: locked, prepared, actorUserId, transaction });
    const subtotal = BigInt(locked.subtotalMinor || 0) + totals.addedSubtotal;
    const cogs = BigInt(locked.cogsMinor || 0) + totals.addedCogs;
    locked.subtotalMinor = subtotal.toString();
    locked.totalMinor = (subtotal - BigInt(locked.discountMinor || 0) + BigInt(locked.taxMinor || 0)).toString();
    locked.cogsMinor = cogs.toString();
    locked.grossProfitMinor = (subtotal - BigInt(locked.discountMinor || 0) - cogs).toString();
    await locked.save({ transaction });

    return Order.findByPk(locked.id, {
      include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }],
      transaction
    });
  });
}

async function setRestaurantStatus({ orderId, tenantId, branchId, nextStatus }) {
  const allowed = {
    OPEN: ['SERVED', 'AWAITING_PAYMENT'],
    SERVED: ['AWAITING_PAYMENT'],
    AWAITING_PAYMENT: []
  };
  return sequelize.transaction(async (transaction) => {
    const order = await Order.findOne({ where: { id: orderId, tenantId, branchId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) {
      const error = new Error('Order not found.'); error.status = 404; throw error;
    }
    if (!(allowed[order.status] || []).includes(nextStatus)) {
      const error = new Error(`Order cannot move from ${order.status} to ${nextStatus}.`); error.status = 409; throw error;
    }
    order.status = nextStatus;
    await order.save({ transaction });
    return order;
  });
}

async function payRestaurantOrder({ orderId, tenantId, branchId, paymentMethod, paymentReference, actorUserId }) {
  return sequelize.transaction(async (transaction) => {
    const order = await Order.findOne({ where: { id: orderId, tenantId, branchId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) { const error = new Error('Order not found.'); error.status = 404; throw error; }
    if (!['OPEN', 'SERVED', 'AWAITING_PAYMENT'].includes(order.status)) {
      const error = new Error('Only an unresolved restaurant order can be paid.'); error.status = 409; throw error;
    }
    const total = BigInt(order.totalMinor || 0);
    await Payment.create({
      tenantId,
      branchId,
      orderId: order.id,
      method: paymentMethod,
      amountMinor: total.toString(),
      reference: paymentReference ? String(paymentReference).trim().slice(0, 180) : null,
      receivedByUserId: actorUserId
    }, { transaction });
    order.status = 'PAID';
    order.paidMinor = total.toString();
    order.closedByUserId = actorUserId;
    order.paidAt = new Date();
    await order.save({ transaction });
    return Order.findByPk(order.id, { include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }], transaction });
  });
}

async function cancelRestaurantOrder({ orderId, tenantId, branchId, reason, approvedByUserId }) {
  return sequelize.transaction(async (transaction) => {
    const order = await Order.findOne({ where: { id: orderId, tenantId, branchId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) { const error = new Error('Order not found.'); error.status = 404; throw error; }
    if (!['OPEN', 'SERVED', 'AWAITING_PAYMENT'].includes(order.status)) {
      const error = new Error('Only an unresolved order can be cancelled.'); error.status = 409; throw error;
    }

    const lines = await OrderLine.findAll({ where: { orderId: order.id, status: 'ACTIVE' }, transaction, lock: transaction.LOCK.UPDATE });
    for (const line of lines) {
      const product = await Product.findOne({ where: { id: line.productId, tenantId }, transaction });
      if (product?.trackInventory) {
        await applyInventoryMovement({
          tenantId,
          branchId,
          productId: line.productId,
          movementType: 'RETURN_IN',
          quantityDeltaBase: line.totalBaseQuantity,
          costAmountMinor: line.costAmountMinor,
          referenceType: 'ORDER_CANCELLATION',
          referenceId: line.id,
          reason: `Manager-approved cancellation ${order.orderNumber}: ${reason}`,
          idempotencyKey: `restaurant-cancel:${order.id}:${line.id}`,
          actorUserId: approvedByUserId,
          transaction
        });
      }
      line.status = 'CANCELLED';
      await line.save({ transaction });
    }

    order.status = 'CANCELLED';
    order.cancelledAt = new Date();
    order.cancellationReason = String(reason).trim().slice(0, 2000);
    order.cancelApprovedByUserId = approvedByUserId;
    order.closedByUserId = approvedByUserId;
    order.grossProfitMinor = '0';
    await order.save({ transaction });
    return Order.findByPk(order.id, { include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }], transaction });
  });
}

module.exports = {
  createRestaurantOrder,
  addRestaurantLines,
  setRestaurantStatus,
  payRestaurantOrder,
  cancelRestaurantOrder
};
