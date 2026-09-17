const crypto = require('crypto');
const Decimal = require('decimal.js');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  Product,
  Purchase,
  PurchaseLine,
  InventoryBalance,
  InventoryMovement
} = require('../models');
const { InventoryBatch } = require('../models/inventoryOperations');

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

  if (delta.lt(0) && ['SALE', 'WASTAGE', 'ADJUSTMENT_OUT', 'TRANSFER_OUT'].includes(movementType)) {
    let remaining = delta.abs();
    const batches = await InventoryBatch.findAll({
      where: { tenantId, branchId, productId, status: 'ACTIVE', quantityCurrentBase: { [Op.gt]: 0 } },
      order: [sequelize.literal('"expiresAt" ASC NULLS LAST'), ['createdAt', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    for (const batch of batches) {
      if (remaining.lte(0)) break;
      const available = decimal(batch.quantityCurrentBase);
      const used = Decimal.min(available, remaining);
      batch.quantityCurrentBase = quantityString(available.minus(used));
      if (decimal(batch.quantityCurrentBase).lte(0)) batch.status = 'DEPLETED';
      await batch.save({ transaction });
      remaining = remaining.minus(used);
    }
  } else if (delta.gt(0) && ['RETURN_IN', 'ADJUSTMENT_IN'].includes(movementType)) {
    const batchNumber = movementType === 'RETURN_IN' ? 'CUSTOMER-RETURNS' : 'UNBATCHED-ADJUSTMENTS';
    const [batch] = await InventoryBatch.findOrCreate({
      where: { branchId, productId, batchNumber },
      defaults: { tenantId, branchId, productId, batchNumber, packageSizeBaseUnits: '1.000', quantityReceivedBase: '0.000', quantityCurrentBase: '0.000', status: 'ACTIVE' },
      transaction
    });
    batch.quantityReceivedBase = quantityString(decimal(batch.quantityReceivedBase).plus(delta));
    batch.quantityCurrentBase = quantityString(decimal(batch.quantityCurrentBase).plus(delta));
    batch.status = 'ACTIVE';
    await batch.save({ transaction });
  }

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
        lineTotalMinor,
        batchNumber: line.batchNumber ? String(line.batchNumber).trim().slice(0, 120) : null,
        manufacturedAt: line.manufacturedAt || null,
        expiresAt: line.expiresAt || null,
        mrpMinor: line.mrpMinor == null || line.mrpMinor === '' ? null : minorInteger(line.mrpMinor, `line ${index + 1} mrpMinor`).toString(),
        packageLabel: line.packageLabel ? String(line.packageLabel).trim().slice(0, 80) : null
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
      const purchaseLine = await PurchaseLine.create({
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

      await InventoryBatch.create({
        tenantId,
        branchId,
        productId: row.product.id,
        supplierId: supplierId || null,
        purchaseId: purchase.id,
        purchaseLineId: purchaseLine.id,
        batchNumber: row.batchNumber || `${purchase.id.slice(0, 8).toUpperCase()}-${index + 1}`,
        manufacturedAt: row.manufacturedAt,
        expiresAt: row.expiresAt,
        mrpMinor: row.mrpMinor,
        packageLabel: row.packageLabel,
        packageSizeBaseUnits: quantityString(row.packageSize),
        quantityReceivedBase: quantityString(row.totalBaseUnits),
        quantityCurrentBase: quantityString(row.totalBaseUnits),
        status: 'ACTIVE'
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

async function postTransfer({
  tenantId,
  sourceBranchId,
  destinationBranchId,
  productId,
  quantityBase,
  reason = null,
  idempotencyKey = null,
  actorUserId
}) {
  const quantity = positiveDecimal(quantityBase, 'quantityBase');
  if (String(sourceBranchId) === String(destinationBranchId)) {
    const error = new Error('Source and destination branches must be different.');
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

  const safeKey = idempotencyKey ? String(idempotencyKey).trim().slice(0, 145) : null;
  const outgoingKey = safeKey ? `transfer:${safeKey}:out` : null;
  const incomingKey = safeKey ? `transfer:${safeKey}:in` : null;

  return sequelize.transaction(async (transaction) => {
    if (outgoingKey) {
      const existingOutgoing = await InventoryMovement.findOne({
        where: { tenantId, idempotencyKey: outgoingKey },
        transaction
      });
      if (existingOutgoing) {
        const existingIncoming = await InventoryMovement.findOne({
          where: {
            tenantId,
            branchId: destinationBranchId,
            referenceType: 'STOCK_TRANSFER',
            referenceId: existingOutgoing.referenceId,
            movementType: 'TRANSFER_IN'
          },
          transaction
        });
        return {
          transferId: existingOutgoing.referenceId,
          outgoingMovement: existingOutgoing,
          incomingMovement: existingIncoming,
          replayed: true
        };
      }
    }

    const transferId = crypto.randomUUID();
    const transferReason = reason ? String(reason).trim().slice(0, 2000) : 'Inter-branch stock transfer';
    const outgoing = await applyInventoryMovement({
      tenantId,
      branchId: sourceBranchId,
      productId,
      movementType: 'TRANSFER_OUT',
      quantityDeltaBase: quantity.negated(),
      referenceType: 'STOCK_TRANSFER',
      referenceId: transferId,
      reason: transferReason,
      idempotencyKey: outgoingKey,
      actorUserId,
      transaction
    });
    const incoming = await applyInventoryMovement({
      tenantId,
      branchId: destinationBranchId,
      productId,
      movementType: 'TRANSFER_IN',
      quantityDeltaBase: quantity,
      costAmountMinor: outgoing.movement.costAmountMinor,
      referenceType: 'STOCK_TRANSFER',
      referenceId: transferId,
      reason: transferReason,
      idempotencyKey: incomingKey,
      actorUserId,
      transaction
    });

    return {
      transferId,
      outgoingMovement: outgoing.movement,
      incomingMovement: incoming.movement,
      replayed: false
    };
  });
}

module.exports = {
  decimal,
  positiveDecimal,
  minorInteger,
  quantityString,
  moneyString,
  applyInventoryMovement,
  postPurchase,
  postAdjustment,
  postTransfer
};
