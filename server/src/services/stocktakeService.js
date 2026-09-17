const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const {
  Product,
  InventoryBalance,
  Stocktake,
  StocktakeLine,
  InventoryMovement
} = require('../models');
const { decimal, quantityString, applyInventoryMovement } = require('./inventoryService');

const OPEN_STATUSES = ['COUNTING', 'SUBMITTED'];

function serviceError(message, status = 400, code = null) {
  const error = new Error(message);
  error.status = status;
  if (code) error.code = code;
  return error;
}

function lineIncludes() {
  return [{
    model: Product,
    as: 'product',
    attributes: ['id', 'name', 'sku', 'brand', 'inventoryUnit', 'bottleVolumeMl']
  }, {
    model: InventoryMovement,
    as: 'movement',
    required: false
  }];
}

async function loadStocktake({ tenantId, branchId, stocktakeId, transaction = null, lock = false }) {
  const options = {
    where: { id: stocktakeId, tenantId, branchId },
    include: [{ model: StocktakeLine, as: 'lines', include: lineIncludes() }],
    order: [[{ model: StocktakeLine, as: 'lines' }, { model: Product, as: 'product' }, 'name', 'ASC']],
    transaction
  };
  if (lock && transaction) options.lock = transaction.LOCK.UPDATE;
  return Stocktake.findOne(options);
}

async function listStocktakes({ tenantId, branchId, limit = 30 }) {
  return Stocktake.findAll({
    where: { tenantId, branchId },
    include: [{ model: StocktakeLine, as: 'lines', include: lineIncludes() }],
    order: [['createdAt', 'DESC']],
    limit: Math.min(Math.max(Number(limit || 30), 1), 100)
  });
}

async function createStocktake({ tenantId, branchId, name, notes = null, actorUserId }) {
  const safeName = String(name || '').trim().slice(0, 180);
  if (!safeName) throw serviceError('Stocktake name is required.');

  return sequelize.transaction(async (transaction) => {
    const existing = await Stocktake.findOne({
      where: { tenantId, branchId, status: { [Op.in]: OPEN_STATUSES } },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (existing) {
      throw serviceError('Finish or post the current stocktake before starting another.', 409, 'STOCKTAKE_ALREADY_OPEN');
    }

    const products = await Product.findAll({
      where: { tenantId, status: 'ACTIVE', trackInventory: true },
      attributes: ['id'],
      order: [['id', 'ASC']],
      transaction
    });
    if (!products.length) throw serviceError('Add at least one inventory-tracked item before starting a stocktake.');

    const balances = await InventoryBalance.findAll({
      where: { tenantId, branchId, productId: { [Op.in]: products.map((row) => row.id) } },
      transaction
    });
    const balancesByProduct = new Map(balances.map((row) => [String(row.productId), row]));

    const stocktake = await Stocktake.create({
      tenantId,
      branchId,
      name: safeName,
      notes: notes ? String(notes).trim().slice(0, 4000) : null,
      status: 'COUNTING',
      createdByUserId: actorUserId
    }, { transaction });

    await StocktakeLine.bulkCreate(products.map((product) => {
      const balance = balancesByProduct.get(String(product.id));
      return {
        tenantId,
        branchId,
        stocktakeId: stocktake.id,
        productId: product.id,
        expectedQuantityBase: quantityString(balance?.quantityBase || 0),
        expectedBalanceVersion: Number(balance?.version || 0)
      };
    }), { transaction });

    return loadStocktake({ tenantId, branchId, stocktakeId: stocktake.id, transaction });
  });
}

async function updateStocktakeCounts({ tenantId, branchId, stocktakeId, counts }) {
  if (!Array.isArray(counts) || !counts.length) throw serviceError('At least one counted line is required.');

  return sequelize.transaction(async (transaction) => {
    const stocktake = await Stocktake.findOne({
      where: { id: stocktakeId, tenantId, branchId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!stocktake) throw serviceError('Stocktake not found.', 404);
    if (stocktake.status !== 'COUNTING') throw serviceError('Only a counting stocktake can be edited.', 409, 'STOCKTAKE_NOT_EDITABLE');

    const ids = [...new Set(counts.map((row) => String(row.lineId || '')).filter(Boolean))];
    const lines = await StocktakeLine.findAll({
      where: { id: { [Op.in]: ids }, stocktakeId, tenantId, branchId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (lines.length !== ids.length) throw serviceError('One or more stocktake lines were not found.', 404);
    const inputById = new Map(counts.map((row) => [String(row.lineId), row]));

    for (const line of lines) {
      const input = inputById.get(String(line.id));
      const count = decimal(input?.countedQuantityBase, 'countedQuantityBase');
      if (count.lt(0)) throw serviceError('Counted quantity cannot be negative.');
      line.countedQuantityBase = quantityString(count);
      line.varianceQuantityBase = quantityString(count.minus(decimal(line.expectedQuantityBase)));
      line.note = input?.note ? String(input.note).trim().slice(0, 2000) : null;
      await line.save({ transaction });
    }
    return loadStocktake({ tenantId, branchId, stocktakeId, transaction });
  });
}

async function submitStocktake({ tenantId, branchId, stocktakeId, actorUserId }) {
  return sequelize.transaction(async (transaction) => {
    const stocktake = await Stocktake.findOne({
      where: { id: stocktakeId, tenantId, branchId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!stocktake) throw serviceError('Stocktake not found.', 404);
    if (stocktake.status !== 'COUNTING') throw serviceError('Only a counting stocktake can be submitted.', 409, 'STOCKTAKE_NOT_COUNTING');
    const missing = await StocktakeLine.count({
      where: { stocktakeId, countedQuantityBase: null },
      transaction
    });
    if (missing) throw serviceError(`${missing} item${missing === 1 ? '' : 's'} still need a count.`, 409, 'STOCKTAKE_INCOMPLETE');

    stocktake.status = 'SUBMITTED';
    stocktake.submittedByUserId = actorUserId;
    stocktake.submittedAt = new Date();
    await stocktake.save({ transaction });
    return loadStocktake({ tenantId, branchId, stocktakeId, transaction });
  });
}

async function postStocktake({ tenantId, branchId, stocktakeId, actorUserId }) {
  return sequelize.transaction(async (transaction) => {
    const stocktake = await Stocktake.findOne({
      where: { id: stocktakeId, tenantId, branchId },
      transaction,
      lock: transaction.LOCK.UPDATE
    });
    if (!stocktake) throw serviceError('Stocktake not found.', 404);
    if (stocktake.status === 'POSTED') return { stocktake: await loadStocktake({ tenantId, branchId, stocktakeId, transaction }), replayed: true };
    if (stocktake.status !== 'SUBMITTED') throw serviceError('Submit the completed count before posting it.', 409, 'STOCKTAKE_NOT_SUBMITTED');

    const lines = await StocktakeLine.findAll({
      where: { stocktakeId, tenantId, branchId },
      order: [['productId', 'ASC']],
      transaction,
      lock: transaction.LOCK.UPDATE
    });

    for (const line of lines) {
      const balance = await InventoryBalance.findOne({
        where: { tenantId, branchId, productId: line.productId },
        transaction,
        lock: transaction.LOCK.UPDATE
      });
      const currentVersion = Number(balance?.version || 0);
      if (currentVersion !== Number(line.expectedBalanceVersion || 0)) {
        throw serviceError(
          'Stock changed after this count started. Start a fresh stocktake so no sale, purchase, or transfer is overwritten.',
          409,
          'STOCKTAKE_STALE'
        );
      }
    }

    for (const line of lines) {
      const delta = decimal(line.countedQuantityBase).minus(decimal(line.expectedQuantityBase));
      line.varianceQuantityBase = quantityString(delta);
      if (!delta.eq(0)) {
        const result = await applyInventoryMovement({
          tenantId,
          branchId,
          productId: line.productId,
          movementType: delta.gt(0) ? 'ADJUSTMENT_IN' : 'ADJUSTMENT_OUT',
          quantityDeltaBase: delta,
          referenceType: 'STOCKTAKE',
          referenceId: stocktake.id,
          reason: `Stocktake: ${stocktake.name}${line.note ? ` — ${line.note}` : ''}`,
          idempotencyKey: `stocktake:${stocktake.id}:${line.id}`,
          actorUserId,
          transaction
        });
        const signedCost = delta.gt(0)
          ? BigInt(result.movement.costAmountMinor || 0)
          : -BigInt(result.movement.costAmountMinor || 0);
        line.varianceCostMinor = signedCost.toString();
        line.movementId = result.movement.id;
      } else {
        line.varianceCostMinor = '0';
      }
      await line.save({ transaction });
    }

    stocktake.status = 'POSTED';
    stocktake.approvedByUserId = actorUserId;
    stocktake.postedAt = new Date();
    await stocktake.save({ transaction });
    return { stocktake: await loadStocktake({ tenantId, branchId, stocktakeId, transaction }), replayed: false };
  });
}

module.exports = {
  listStocktakes,
  loadStocktake,
  createStocktake,
  updateStocktakeCounts,
  submitStocktake,
  postStocktake
};
