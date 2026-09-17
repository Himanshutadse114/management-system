const crypto = require('crypto');
const Decimal = require('decimal.js');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Product, ProductPriceOption, Device, PrintJob } = require('../models');
const { RestaurantTable, MenuItem, RecipeComponent, KitchenTicket, KitchenTicketLine } = require('../models/restaurant');
const { Order, OrderLine, Payment } = require('../models/sales');
const { Customer, GuestOrderRequest, LoyaltyTransaction } = require('../models/growth');
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

    const menuItem = await MenuItem.findOne({ where: { tenantId, branchId, productId: priceOption.product.id, active: true }, transaction });
    const groups = Array.isArray(menuItem?.modifierGroups) ? menuItem.modifierGroups : [];
    const requestedIds = new Set((Array.isArray(line.modifiers) ? line.modifiers : []).map((value) => String(value?.optionId || value)));
    const selectedModifiers = [];
    for (const group of groups) {
      const options = Array.isArray(group.options) ? group.options : [];
      const selected = options.filter((option) => requestedIds.has(String(option.id)));
      const min = Math.max(0, Number(group.min ?? (group.required ? 1 : 0)) || 0);
      const max = Math.max(min, Number(group.max ?? options.length) || options.length);
      if (selected.length < min || selected.length > max) {
        const error = new Error(`${menuItem.displayName}: choose ${min === max ? min : `${min}-${max}`} option(s) from ${group.name}.`);
        error.status = 400;
        error.code = 'INVALID_MODIFIER_SELECTION';
        throw error;
      }
      for (const option of selected) selectedModifiers.push({
        groupId: String(group.id), groupName: String(group.name || 'Options').slice(0, 100),
        optionId: String(option.id), label: String(option.label || 'Option').slice(0, 120),
        priceMinor: String(BigInt(option.priceMinor || 0))
      });
    }
    const knownIds = new Set(groups.flatMap((group) => (group.options || []).map((option) => String(option.id))));
    if ([...requestedIds].some((id) => !knownIds.has(id))) {
      const error = new Error(`Order line ${index + 1}: one or more modifiers are unavailable.`); error.status = 400; throw error;
    }
    const modifierTotalPerUnit = selectedModifiers.reduce((sum, option) => sum + BigInt(option.priceMinor), 0n);
    const unitPrice = BigInt(priceOption.priceMinor) + modifierTotalPerUnit;
    const basePerUnit = new Decimal(priceOption.quantityBaseUnits);
    const recipeComponents = await RecipeComponent.findAll({
      where: {
        tenantId, branchId, outputProductId: priceOption.product.id, active: true,
        [Op.or]: [{ priceOptionId: priceOption.id }, { priceOptionId: null }]
      },
      transaction
    });
    prepared.push({
      product: priceOption.product,
      priceOption,
      units,
      unitPrice,
      modifierTotalPerUnit,
      selectedModifiers,
      notes: line.notes ? String(line.notes).trim().slice(0, 1000) : null,
      lineSubtotal: unitPrice * BigInt(units),
      basePerUnit,
      totalBase: basePerUnit.times(units),
      recipeComponents
    });
  }
  return prepared;
}

async function appendPreparedLines({ order, prepared, actorUserId, transaction }) {
  let addedSubtotal = 0n;
  let addedCogs = 0n;
  const createdLines = [];

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
      modifierTotalMinor: (row.modifierTotalPerUnit * BigInt(row.units)).toString(),
      modifiersSnapshot: row.selectedModifiers,
      notes: row.notes,
      costAmountMinor: '0',
      status: 'ACTIVE'
    }, { transaction });

    let lineCost = 0n;
    if (row.recipeComponents.length) {
      for (const component of row.recipeComponents) {
        const wasteMultiplier = new Decimal(1).plus(new Decimal(component.wastePercent || 0).dividedBy(100));
        const quantity = new Decimal(component.quantityBasePerUnit).times(row.units).times(wasteMultiplier).toDecimalPlaces(3);
        const movement = await applyInventoryMovement({
          tenantId: order.tenantId,
          branchId: order.branchId,
          productId: component.ingredientProductId,
          movementType: 'SALE',
          quantityDeltaBase: quantity.negated(),
          referenceType: 'ORDER_LINE',
          referenceId: line.id,
          reason: `Recipe consumption for ${order.orderNumber} · ${row.product.name}`,
          idempotencyKey: `restaurant-recipe:${order.id}:${line.id}:${component.id}`,
          actorUserId,
          transaction
        });
        lineCost += BigInt(movement.movement.costAmountMinor || 0);
      }
      line.costAmountMinor = lineCost.toString();
      await line.save({ transaction });
    } else if (row.product.trackInventory) {
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
    createdLines.push({ line, product: row.product });
  }

  return { addedSubtotal, addedCogs, createdLines };
}

async function fireKitchenTickets({ order, createdLines, actorUserId, transaction }) {
  const currentRound = Number(await KitchenTicket.max('roundNumber', { where: { orderId: order.id }, transaction }) || 0);
  const roundNumber = currentRound + 1;
  const groups = new Map();
  for (const entry of createdLines) {
    const station = ['ALCOHOL', 'MIXER'].includes(entry.product.productType) ? 'BAR' : 'KITCHEN';
    if (!groups.has(station)) groups.set(station, []);
    groups.get(station).push(entry.line);
  }
  const tickets = [];
  for (const [station, lines] of groups) {
    const ticket = await KitchenTicket.create({
      tenantId: order.tenantId, branchId: order.branchId, orderId: order.id,
      ticketNumber: `${order.orderNumber}-R${roundNumber}-${station}`.slice(0, 80), station,
      roundNumber, status: 'NEW', firedAt: new Date(), updatedByUserId: actorUserId
    }, { transaction });
    await KitchenTicketLine.bulkCreate(lines.map((line) => ({
      tenantId: order.tenantId, branchId: order.branchId, ticketId: ticket.id,
      orderLineId: line.id, itemNameSnapshot: line.productNameSnapshot,
      quantityUnits: line.quantityUnits, modifiersSnapshot: line.modifiersSnapshot || [], notes: line.notes || order.notes || null
    })), { transaction });
    const printers = await Device.findAll({
      where: { tenantId: order.tenantId, branchId: order.branchId, deviceType: 'KOT_PRINTER', status: 'ACTIVE' },
      transaction
    });
    for (const printer of printers.filter((row) => !row.station || String(row.station).toUpperCase() === station)) {
      await PrintJob.create({
        tenantId: order.tenantId, branchId: order.branchId, deviceId: printer.id,
        jobType: 'KOT', status: 'PENDING',
        payload: { ticketId: ticket.id, ticketNumber: ticket.ticketNumber, orderNumber: order.orderNumber, station, roundNumber, lines: lines.map((line) => ({ name: line.productNameSnapshot, quantity: line.quantityUnits, modifiers: line.modifiersSnapshot || [], notes: line.notes || null })) },
        idempotencyKey: `kot:${ticket.id}:${printer.id}`, createdByUserId: actorUserId
      }, { transaction });
    }
    tickets.push(ticket);
  }
  return tickets;
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
    if (tableId) {
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
    await fireKitchenTickets({ order, createdLines: totals.createdLines, actorUserId, transaction });
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
    await fireKitchenTickets({ order: locked, createdLines: totals.createdLines, actorUserId, transaction });
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

async function payRestaurantOrder({ orderId, tenantId, branchId, paymentMethod, paymentReference, payments = null, actorUserId }) {
  return sequelize.transaction(async (transaction) => {
    const order = await Order.findOne({ where: { id: orderId, tenantId, branchId }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) { const error = new Error('Order not found.'); error.status = 404; throw error; }
    if (!['OPEN', 'SERVED', 'AWAITING_PAYMENT'].includes(order.status)) {
      const error = new Error('Only an unresolved restaurant order can be paid.'); error.status = 409; throw error;
    }
    const total = BigInt(order.totalMinor || 0);
    const rows = Array.isArray(payments) && payments.length
      ? payments.map((payment) => ({ method: String(payment.method || '').toUpperCase(), amountMinor: BigInt(String(payment.amountMinor || '0')), reference: payment.reference ? String(payment.reference).trim().slice(0, 180) : null }))
      : [{ method: String(paymentMethod || '').toUpperCase(), amountMinor: total, reference: paymentReference ? String(paymentReference).trim().slice(0, 180) : null }];
    if (rows.some((payment) => !['CASH','CARD','UPI','OTHER'].includes(payment.method) || payment.amountMinor <= 0n)) {
      const error = new Error('Every payment must have a valid method and positive amount.'); error.status = 400; throw error;
    }
    if (rows.reduce((sum, payment) => sum + payment.amountMinor, 0n) !== total) {
      const error = new Error('Payment amounts must add up exactly to the order total.'); error.status = 400; error.code = 'PAYMENT_TOTAL_MISMATCH'; throw error;
    }
    for (const payment of rows) await Payment.create({
      tenantId, branchId, orderId: order.id, method: payment.method,
      amountMinor: payment.amountMinor.toString(), reference: payment.reference,
      receivedByUserId: actorUserId
    }, { transaction });
    order.status = 'PAID';
    order.paidMinor = total.toString();
    order.closedByUserId = actorUserId;
    order.paidAt = new Date();
    await order.save({ transaction });
    const guestRequest = await GuestOrderRequest.findOne({ where: { tenantId, acceptedOrderId: order.id }, transaction, lock: transaction.LOCK.UPDATE });
    if (guestRequest?.customerId) {
      const customer = await Customer.findOne({ where: { id: guestRequest.customerId, tenantId }, transaction, lock: transaction.LOCK.UPDATE });
      if (customer) {
        const earnedPoints = total / 10000n;
        customer.visitCount = Number(customer.visitCount || 0) + 1;
        customer.totalSpendMinor = (BigInt(customer.totalSpendMinor || 0) + total).toString();
        customer.loyaltyPoints = (BigInt(customer.loyaltyPoints || 0) + earnedPoints).toString();
        customer.lastVisitAt = new Date();
        await customer.save({ transaction });
        if (earnedPoints > 0n) await LoyaltyTransaction.create({ tenantId, customerId: customer.id, orderId: order.id, pointsDelta: earnedPoints.toString(), walletDeltaMinor: '0', reason: `Earned from ${order.orderNumber}`, actorUserId }, { transaction });
      }
    }
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
      const recipeComponents = await RecipeComponent.findAll({
        where: {
          tenantId, branchId, outputProductId: line.productId, active: true,
          [Op.or]: [{ priceOptionId: line.priceOptionId }, { priceOptionId: null }]
        },
        transaction
      });
      if (recipeComponents.length) {
        for (const component of recipeComponents) {
          const wasteMultiplier = new Decimal(1).plus(new Decimal(component.wastePercent || 0).dividedBy(100));
          const restoreQuantity = new Decimal(component.quantityBasePerUnit).times(line.quantityUnits).times(wasteMultiplier).toDecimalPlaces(3);
          await applyInventoryMovement({
            tenantId, branchId, productId: component.ingredientProductId, movementType: 'RETURN_IN',
            quantityDeltaBase: restoreQuantity,
            referenceType: 'ORDER_CANCELLATION', referenceId: line.id,
            reason: `Recipe reversal for cancelled order ${order.orderNumber}: ${reason}`,
            idempotencyKey: `restaurant-cancel:${order.id}:${line.id}:${component.id}`,
            actorUserId: approvedByUserId, transaction
          });
        }
      } else {
        const product = await Product.findOne({ where: { id: line.productId, tenantId }, transaction });
        if (product?.trackInventory) await applyInventoryMovement({
          tenantId, branchId, productId: line.productId, movementType: 'RETURN_IN',
          quantityDeltaBase: line.totalBaseQuantity, costAmountMinor: line.costAmountMinor,
          referenceType: 'ORDER_CANCELLATION', referenceId: line.id,
          reason: `Manager-approved cancellation ${order.orderNumber}: ${reason}`,
          idempotencyKey: `restaurant-cancel:${order.id}:${line.id}`,
          actorUserId: approvedByUserId, transaction
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
    await KitchenTicket.update({ status: 'CANCELLED', updatedByUserId: approvedByUserId }, {
      where: { orderId: order.id, status: ['NEW', 'PREPARING', 'READY'] }, transaction
    });
    return Order.findByPk(order.id, { include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }], transaction });
  });
}

const ACTIVE_RESTAURANT_STATUSES = ['OPEN', 'SERVED', 'AWAITING_PAYMENT'];

async function moveRestaurantOrder({ orderId, tenantId, branchId, destinationTableId }) {
  return sequelize.transaction(async (transaction) => {
    const order = await Order.findOne({ where: { id: orderId, tenantId, branchId, orderType: 'RESTAURANT' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!order) { const error = new Error('Order not found.'); error.status = 404; throw error; }
    if (!ACTIVE_RESTAURANT_STATUSES.includes(order.status)) { const error = new Error('Only an active order can move tables.'); error.status = 409; throw error; }
    const table = await RestaurantTable.findOne({ where: { id: destinationTableId, tenantId, branchId, status: 'ACTIVE' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!table) { const error = new Error('Destination table not found.'); error.status = 404; throw error; }
    const occupied = await Order.findOne({
      where: { tenantId, branchId, tableId: table.id, status: ACTIVE_RESTAURANT_STATUSES, id: { [Op.ne]: order.id } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (occupied) { const error = new Error(`Destination table already has active order ${occupied.orderNumber}.`); error.status = 409; error.code = 'TABLE_OCCUPIED'; throw error; }
    order.tableId = table.id;
    await order.save({ transaction });
    return Order.findByPk(order.id, { include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }], transaction });
  });
}

async function mergeRestaurantOrders({ sourceOrderId, targetOrderId, tenantId, branchId, actorUserId }) {
  if (String(sourceOrderId) === String(targetOrderId)) { const error = new Error('Choose two different orders to merge.'); error.status = 400; throw error; }
  return sequelize.transaction(async (transaction) => {
    const orders = await Order.findAll({
      where: { id: [sourceOrderId, targetOrderId], tenantId, branchId, orderType: 'RESTAURANT' },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    const source = orders.find((row) => String(row.id) === String(sourceOrderId));
    const target = orders.find((row) => String(row.id) === String(targetOrderId));
    if (!source || !target) { const error = new Error('Both restaurant orders are required.'); error.status = 404; throw error; }
    if (![source, target].every((row) => ACTIVE_RESTAURANT_STATUSES.includes(row.status))) {
      const error = new Error('Only active, unpaid orders can be merged.'); error.status = 409; throw error;
    }
    await OrderLine.update({ orderId: target.id }, { where: { orderId: source.id, status: 'ACTIVE' }, transaction });
    await KitchenTicket.update({ orderId: target.id, updatedByUserId: actorUserId }, { where: { orderId: source.id }, transaction });
    for (const field of ['subtotalMinor', 'discountMinor', 'taxMinor', 'totalMinor', 'cogsMinor', 'grossProfitMinor']) {
      target[field] = (BigInt(target[field] || 0) + BigInt(source[field] || 0)).toString();
      source[field] = '0';
    }
    target.status = target.status === 'AWAITING_PAYMENT' || source.status === 'AWAITING_PAYMENT' ? 'AWAITING_PAYMENT' : 'OPEN';
    source.status = 'VOIDED';
    source.cancelledAt = new Date();
    source.cancellationReason = `Merged into ${target.orderNumber}`;
    source.cancelApprovedByUserId = actorUserId;
    source.closedByUserId = actorUserId;
    await target.save({ transaction });
    await source.save({ transaction });
    return Order.findByPk(target.id, { include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }], transaction });
  });
}

async function splitRestaurantOrder({ orderId, tenantId, branchId, destinationTableId, lines, actorUserId, idempotencyKey = null }) {
  if (!Array.isArray(lines) || !lines.length) { const error = new Error('Choose at least one line to split.'); error.status = 400; throw error; }
  const safeKey = idempotencyKey ? String(idempotencyKey).trim().slice(0, 180) : null;
  if (safeKey) {
    const replay = await Order.findOne({ where: { tenantId, idempotencyKey: safeKey }, include: [{ model: OrderLine, as: 'lines' }] });
    if (replay) return { order: replay, replayed: true };
  }
  return sequelize.transaction(async (transaction) => {
    const source = await Order.findOne({ where: { id: orderId, tenantId, branchId, orderType: 'RESTAURANT' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!source) { const error = new Error('Order not found.'); error.status = 404; throw error; }
    if (!ACTIVE_RESTAURANT_STATUSES.includes(source.status)) { const error = new Error('Only an active, unpaid order can be split.'); error.status = 409; throw error; }
    if (BigInt(source.discountMinor || 0) !== 0n || BigInt(source.taxMinor || 0) !== 0n) {
      const error = new Error('Split the bill before applying order-level discount or tax.'); error.status = 409; throw error;
    }
    const table = await RestaurantTable.findOne({ where: { id: destinationTableId, tenantId, branchId, status: 'ACTIVE' }, transaction, lock: transaction.LOCK.UPDATE });
    if (!table) { const error = new Error('Destination table not found.'); error.status = 404; throw error; }
    const occupied = await Order.findOne({ where: { tenantId, branchId, tableId: table.id, status: ACTIVE_RESTAURANT_STATUSES }, transaction, lock: transaction.LOCK.UPDATE });
    if (occupied) { const error = new Error(`Destination table already has active order ${occupied.orderNumber}.`); error.status = 409; error.code = 'TABLE_OCCUPIED'; throw error; }

    const sourceLines = await OrderLine.findAll({ where: { orderId: source.id, status: 'ACTIVE' }, transaction, lock: transaction.LOCK.UPDATE });
    const requested = new Map(lines.map((row) => [String(row.lineId || ''), Number(row.quantityUnits)]));
    let movedUnits = 0;
    let allUnits = 0;
    for (const line of sourceLines) {
      allUnits += Number(line.quantityUnits);
      const units = requested.get(String(line.id)) || 0;
      if (!Number.isSafeInteger(units) || units < 0 || units > Number(line.quantityUnits)) { const error = new Error(`Invalid split quantity for ${line.productNameSnapshot}.`); error.status = 400; throw error; }
      movedUnits += units;
    }
    if (movedUnits <= 0) { const error = new Error('Choose at least one item quantity to split.'); error.status = 400; throw error; }
    if (movedUnits >= allUnits) { const error = new Error('Use move table when transferring the complete order.'); error.status = 409; throw error; }

    const splitOrder = await Order.create({
      tenantId, branchId, orderNumber: orderNumber(), orderType: 'RESTAURANT', status: source.status,
      tableId: table.id, waiterUserId: source.waiterUserId, openedByUserId: actorUserId,
      subtotalMinor: '0', discountMinor: '0', taxMinor: '0', totalMinor: '0', paidMinor: '0', cogsMinor: '0', grossProfitMinor: '0',
      notes: source.notes, idempotencyKey: safeKey, acceptedAt: source.acceptedAt || new Date()
    }, { transaction });

    let splitSubtotal = 0n;
    let splitCogs = 0n;
    for (const line of sourceLines) {
      const units = requested.get(String(line.id)) || 0;
      if (!units) continue;
      const originalUnits = Number(line.quantityUnits);
      const splitSubtotalLine = BigInt(line.unitPriceMinor) * BigInt(units);
      const splitCost = BigInt(line.costAmountMinor || 0) * BigInt(units) / BigInt(originalUnits);
      const splitModifier = BigInt(line.modifierTotalMinor || 0) * BigInt(units) / BigInt(originalUnits);
      const splitBase = new Decimal(line.baseQuantityPerUnit).times(units).toDecimalPlaces(3).toFixed(3);
      if (units === originalUnits) {
        line.orderId = splitOrder.id;
        await line.save({ transaction });
      } else {
        await OrderLine.create({
          tenantId, branchId, orderId: splitOrder.id, productId: line.productId, priceOptionId: line.priceOptionId,
          productNameSnapshot: line.productNameSnapshot, priceLabelSnapshot: line.priceLabelSnapshot,
          quantityUnits: units, baseQuantityPerUnit: line.baseQuantityPerUnit, totalBaseQuantity: splitBase,
          unitPriceMinor: line.unitPriceMinor, lineSubtotalMinor: splitSubtotalLine.toString(), modifierTotalMinor: splitModifier.toString(),
          modifiersSnapshot: line.modifiersSnapshot || [], notes: line.notes,
          costAmountMinor: splitCost.toString(), status: 'ACTIVE'
        }, { transaction });
        const remainingUnits = originalUnits - units;
        line.quantityUnits = remainingUnits;
        line.totalBaseQuantity = new Decimal(line.baseQuantityPerUnit).times(remainingUnits).toDecimalPlaces(3).toFixed(3);
        line.lineSubtotalMinor = (BigInt(line.unitPriceMinor) * BigInt(remainingUnits)).toString();
        line.modifierTotalMinor = (BigInt(line.modifierTotalMinor || 0) - splitModifier).toString();
        line.costAmountMinor = (BigInt(line.costAmountMinor || 0) - splitCost).toString();
        await line.save({ transaction });
      }
      splitSubtotal += splitSubtotalLine;
      splitCogs += splitCost;
    }
    splitOrder.subtotalMinor = splitSubtotal.toString();
    splitOrder.totalMinor = splitSubtotal.toString();
    splitOrder.cogsMinor = splitCogs.toString();
    splitOrder.grossProfitMinor = (splitSubtotal - splitCogs).toString();
    source.subtotalMinor = (BigInt(source.subtotalMinor) - splitSubtotal).toString();
    source.totalMinor = source.subtotalMinor;
    source.cogsMinor = (BigInt(source.cogsMinor) - splitCogs).toString();
    source.grossProfitMinor = (BigInt(source.subtotalMinor) - BigInt(source.cogsMinor)).toString();
    await splitOrder.save({ transaction });
    await source.save({ transaction });
    return { order: await Order.findByPk(splitOrder.id, { include: [{ model: OrderLine, as: 'lines' }, { model: Payment, as: 'payments' }], transaction }), replayed: false };
  });
}

module.exports = {
  createRestaurantOrder,
  addRestaurantLines,
  setRestaurantStatus,
  payRestaurantOrder,
  cancelRestaurantOrder,
  moveRestaurantOrder,
  mergeRestaurantOrders,
  splitRestaurantOrder
};
