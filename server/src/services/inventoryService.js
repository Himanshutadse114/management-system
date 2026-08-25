const Decimal = require('decimal.js');
const { sequelize } = require('../config/database');
const {
  Product,
  Purchase,
  PurchaseLine,
  InventoryBalance,
  InventoryMovement
} = require('../models');

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

function decimal(value, label = 'value') {
  try {
    const result = new Decimal(value == null || value === '' ? 0 : value);
    if (!result.isFinite()) throw new Error();
    return result;
  } catch (_) {
    const error = new Error(`${label} must be a valid number.`);
    error.status = 400;
    throw error;
  }
}

function positiveDecimal(value, label) {
  const result = decimal(value, label);
  if (result.lte(0)) {
    const error = new Error(`${label} must be greater than zero.`);
    error.status = 400;
    throw error;
  }
  return result;
}

function minorInteger(value, label = 'amount') {
  const raw = String(value ?? '').trim();
  if (!/^\d+$/.test(raw)) {
    const error = new Error(`${label} must be a non-negative integer in minor currency units.`);
    error.status = 400;
    throw error;
  }
  return BigInt(raw);
}

function roundMinor(value) {
  return BigInt(decimal(value).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toFixed(0));
}

function moneyString(value) {
  return BigInt(value || 0).toString();
}

function quantityString(value) {
  return decimal(value).toDecimalPlaces(3, Decimal.ROUND_HALF_UP).toFixed(3);
}

function costPerUnitString(value) {
  return decimal(value).toDecimalPlaces(8, Decimal.ROUND_HALF_UP).toFixed(8);
}

async function lockBalance({ tenantId, branchId, productId, transaction }) {
  await InventoryBalance.findOrCreate({
    where: { tenantId, branchId, productId },
    defaults: {
      tenantId,
      branchId,
      productId,
      quantityBase: '0.000',
      inventoryValueMinor: '0',
      weightedAverageCostMinorPerUnit: '0.00000000',
      version: 0
    },
    transaction
  });

  return InventoryBalance.findOne({
    where: { tenantId, branchId, productId },
    transaction,
    lock: transaction.LOCK.UPDATE
  });
}

async function applyInventoryMovement({
  tenantId,
  branchId,
  productId,
  movementType,
  quantityDeltaBase,
  costAmountMinor = null,
  referenceType = null,
  referenceId = null,
  reason = null,
  idempotencyKey = null,
  actorUserId,
  transaction
}) {
  if (!transaction) throw new Error('Inventory movements require an active database transaction.');

  if (idempotencyKey) {
    const existing = await InventoryMovement.findOne({
      where: { tenantId, idempotencyKey },
      transaction
    });
    if (existing) {
      const balance = await InventoryBalance.findOne({
        where: { tenantId, branchId, productId },
        transaction
      });
      return { movement: existing, balance, replayed: true };
    }
  }

  const delta = decimal(quantityDeltaBase, 'quantityDeltaBase');
  if (delta.eq(0)) {
    const error = new Error('Inventory movement quantity cannot be zero.');
    error.status = 400;
    throw error;
  }

  const balance = await lockBalance({ tenantId, branchId, productId, transaction });
  const oldQuantity = decimal(balance.quantityBase);
  const oldValue = BigInt(balance.inventoryValueMinor || 0);
  const oldAverage = decimal(balance.weightedAverageCostMinorPerUnit || 0);

  const newQuantity = oldQuantity.plus(delta);
  if (newQuantity.lt(0)) {
    const error = new Error(`Insufficient stock. Available ${quantityString(oldQuantity)}, requested ${quantityString(delta.abs())}.`);
    error.status = 409;
    error.code = 'INSUFFICIENT_STOCK';
    throw error;
  }

  let movementCost;
  let newValue;
  let unitCost;

  if (delta.gt(0)) {
    if (costAmountMinor != null) {
      movementCost = minorInteger(costAmountMinor, 'costAmountMinor');
    } else if (oldQuantity.gt(0)) {
      movementCost = roundMinor(oldAverage.times(delta));
    } else {
      movementCost = 0n;
    }
    newValue = oldValue + movementCost;
    unitCost = delta.gt(0) ? new Decimal(movementCost.toString()).div(delta) : new Decimal(0);
  } else {
    const outgoingQuantity = delta.abs();
    movementCost = roundMinor(oldAverage.times(outgoingQuantity));
    newValue = oldValue - movementCost;
    if (newValue < 0n || newQuantity.eq(0)) newValue = 0n;
    unitCost = oldAverage;
  }

  const newAverage = newQuantity.gt(0)
    ? new Decimal(newValue.toString()).div(newQuantity)
    : new Decimal(0);

  balance.quantityBase = quantityString(newQuantity);
  balance.inventoryValueMinor = newValue.toString();
  balance.weightedAverageCostMinorPerUnit = costPerUnitString(newAverage);
  balance.version = Number(balance.version || 0) + 1;
  await balance.save({ transaction });

  const movement = await InventoryMovement.create({
    tenantId,
    branchId,
    productId,
    movementType,
    quantityDeltaBase: quantityString(delta),
    unitCostMinorPerUnit: costPerUnitString(unitCost),
    costAmountMinor: movementCost.toString(),
    stockAfterBase: quantityString(newQuantity),
    inventoryValueAfterMinor: newValue.toString(),
    referenceType,
    referenceId: referenceId == null ? null : String(referenceId),
    reason: reason ? String(reason).trim().slice(0, 2000) : null,
    idempotencyKey: idempotencyKey ? String(idempotencyKey).slice(0, 180) : null,
    actorUserId
  }, { transaction });

  return { movement, balance, replayed: false };
}

async function postPurchase({
  tenantId,
  branchId,
  supplierId = null,
  invoiceNumber = null,
  purchaseDate,
  notes = null,
  idempotencyKey = null,
  lines,
  actorUserId
}) {
  if (!Array.isArray(lines) || !lines.length) {
    const error = new Error('At least one purchase line is required.');
    error.status = 400;
    throw error;
  }

  if (idempotencyKey) {
    const existing = await Purchase.findOne({
      where: { tenantId, idempotencyKey },
      include: [{ model: PurchaseLine, as: 'lines' }]
    });
    if (existing) return { purchase: existing, replayed: true };
  }

  return sequelize.transaction(async (transaction) => {
    const prepared = [];
    let purchaseTotal = 0n;

    for (const [index, line] of lines.entries()) {
      const product = await Product.findOne({
        where: { id: line.productId, tenantId, status: 'ACTIVE' },
        transaction
      });
      if (!product) {
        const error = new Error(`Purchase line ${index + 1}: product not found.`);
        error.status = 404;
        throw error;
      }
      if (!product.trackInventory) {
        const error = new Error(`Purchase line ${index + 1}: product is not inventory-tracked.`);
        error.status = 400;
        throw error;
      }

      const packageCount = positiveDecimal(line.packageCount, `line ${index + 1} packageCount`);
      let packageSize = line.packageSizeBaseUnits == null || line.packageSizeBaseUnits === ''
        ? null
        : positiveDecimal(line.packageSizeBaseUnits, `line ${index + 1} packageSizeBaseUnits`);

      if (!packageSize) {
        if (product.productType === 'ALCOHOL' && product.bottleVolumeMl) {
          packageSize = positiveDecimal(product.bottleVolumeMl, `line ${index + 1} bottleVolumeMl`);
        } else if (product.inventoryUnit === 'PIECE') {
          packageSize = new Decimal(1);
        } else {
          const error = new Error(`Purchase line ${index + 1}: package size is required.`);
          error.status = 400;
          throw error;
        }
      }

      const totalBaseUnits = packageCount.times(packageSize);
      const lineTotalMinor = minorInteger(line.lineTotalMinor, `line ${index + 1} lineTotalMinor`);
      purchaseTotal += lineTotalMinor;

      prepared.push({
        product,
        packageCount,
        packageSize,
        totalBaseUnits,
        lineTotalMinor
      });
    }

    const purchase = await Purchase.create({
      tenantId,
      branchId,
      supplierId: supplierId || null,
      invoiceNumber: invoiceNumber ? String(invoiceNumber).trim().slice(0, 120) : null,
      purchaseDate,
      status: 'POSTED',
      totalMinor: purchaseTotal.toString(),
      notes: notes ? String(notes).trim().slice(0, 4000) : null,
      idempotencyKey: idempotencyKey ? String(idempotencyKey).slice(0, 180) : null,
      createdByUserId: actorUserId
    }, { transaction });

    for (const [index, row] of prepared.entries()) {
      await PurchaseLine.create({
        tenantId,
        branchId,
        purchaseId: purchase.id,
        productId: row.product.id,
        productNameSnapshot: row.product.name,
        skuSnapshot: row.product.sku || null,
        packageCount: quantityString(row.packageCount),
        packageSizeBaseUnits: quantityString(row.packageSize),
        totalBaseUnits: quantityString(row.totalBaseUnits),
        lineTotalMinor: row.lineTotalMinor.toString()
      }, { transaction });

      await applyInventoryMovement({
        tenantId,
        branchId,
        productId: row.product.id,
        movementType: 'PURCHASE',
        quantityDeltaBase: row.totalBaseUnits,
        costAmountMinor: row.lineTotalMinor.toString(),
        referenceType: 'PURCHASE',
        referenceId: purchase.id,
        reason: invoiceNumber ? `Purchase invoice ${String(invoiceNumber).trim()}` : 'Purchase received',
        idempotencyKey: `purchase:${purchase.id}:${index}`,
        actorUserId,
        transaction
      });
    }

    const fullPurchase = await Purchase.findByPk(purchase.id, {
      include: [{ model: PurchaseLine, as: 'lines' }],
      transaction
    });
    return { purchase: fullPurchase, replayed: false };
  });
}

async function postAdjustment({
  tenantId,
  branchId,
  productId,
  quantityDeltaBase,
  costAmountMinor = null,
  reason,
  idempotencyKey = null,
  actorUserId,
  movementType = null
}) {
  const delta = decimal(quantityDeltaBase, 'quantityDeltaBase');
  if (delta.eq(0)) {
    const error = new Error('Adjustment quantity cannot be zero.');
    error.status = 400;
    throw error;
  }

  const product = await Product.findOne({ where: { id: productId, tenantId, status: 'ACTIVE' } });
  if (!product) {
    const error = new Error('Product not found.');
    error.status = 404;
    throw error;
  }
  if (!product.trackInventory) {
    const error = new Error('This product does not track inventory.');
    error.status = 400;
    throw error;
  }

  const resolvedType = movementType || (delta.gt(0) ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT');

  return sequelize.transaction(async (transaction) => applyInventoryMovement({
    tenantId,
    branchId,
    productId,
    movementType: resolvedType,
    quantityDeltaBase: delta,
    costAmountMinor: delta.gt(0) ? costAmountMinor : null,
    referenceType: 'MANUAL_ADJUSTMENT',
    reason,
    idempotencyKey,
    actorUserId,
    transaction
  }));
}

module.exports = {
  decimal,
  positiveDecimal,
  minorInteger,
  quantityString,
  moneyString,
  applyInventoryMovement,
  postPurchase,
  postAdjustment
};
