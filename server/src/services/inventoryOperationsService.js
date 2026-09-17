const crypto = require('crypto');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const { Product, Supplier } = require('../models');
const { InventoryBatch, StockTransfer, StockTransferLine, SupplierReturn } = require('../models/inventoryOperations');
const { applyInventoryMovement, positiveDecimal, minorInteger } = require('./inventoryService');

function transferNumber() { return `TRF-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }
function returnNumber() { return `RTV-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`; }

async function dispatchTransfer({ tenantId, sourceBranchId, destinationBranchId, lines, reason, idempotencyKey, actorUserId }) {
  if (!Array.isArray(lines) || !lines.length) { const error = new Error('At least one transfer line is required.'); error.status = 400; throw error; }
  if (idempotencyKey) {
    const replay = await StockTransfer.findOne({ where: { tenantId, idempotencyKey }, include: [{ model: StockTransferLine, as: 'lines' }] });
    if (replay) return { transfer: replay, replayed: true };
  }
  return sequelize.transaction(async (transaction) => {
    const transfer = await StockTransfer.create({ tenantId, sourceBranchId, destinationBranchId, transferNumber: transferNumber(), status: 'IN_TRANSIT', reason: String(reason).trim().slice(0, 2000), idempotencyKey: idempotencyKey || null, dispatchedByUserId: actorUserId, dispatchedAt: new Date() }, { transaction });
    for (const [index, requested] of lines.entries()) {
      const product = await Product.findOne({ where: { id: requested.productId, tenantId, status: 'ACTIVE', trackInventory: true }, transaction });
      if (!product) { const error = new Error(`Transfer line ${index + 1}: product not found.`); error.status = 404; throw error; }
      const quantity = positiveDecimal(requested.quantityBase, `transfer line ${index + 1} quantityBase`);
      const outgoing = await applyInventoryMovement({ tenantId, branchId: sourceBranchId, productId: product.id, movementType: 'TRANSFER_OUT', quantityDeltaBase: quantity.negated(), referenceType: 'STOCK_TRANSFER', referenceId: transfer.id, reason: transfer.reason, idempotencyKey: `transfer-dispatch:${transfer.id}:${index}`, actorUserId, transaction });
      await StockTransferLine.create({ tenantId, transferId: transfer.id, productId: product.id, quantityBase: quantity.toDecimalPlaces(3).toFixed(3), costAmountMinor: outgoing.movement.costAmountMinor }, { transaction });
    }
    return { transfer: await StockTransfer.findByPk(transfer.id, { include: [{ model: StockTransferLine, as: 'lines' }], transaction }), replayed: false };
  });
}

async function receiveTransfer({ tenantId, destinationBranchId, transferId, actorUserId }) {
  return sequelize.transaction(async (transaction) => {
    const transfer = await StockTransfer.findOne({ where: { id: transferId, tenantId, destinationBranchId }, include: [{ model: StockTransferLine, as: 'lines' }], transaction, lock: transaction.LOCK.UPDATE });
    if (!transfer) { const error = new Error('Incoming transfer not found.'); error.status = 404; throw error; }
    if (transfer.status === 'RECEIVED') return { transfer, replayed: true };
    if (transfer.status !== 'IN_TRANSIT') { const error = new Error(`Transfer cannot be received from ${transfer.status}.`); error.status = 409; throw error; }
    for (const [index, line] of transfer.lines.entries()) {
      await applyInventoryMovement({ tenantId, branchId: destinationBranchId, productId: line.productId, movementType: 'TRANSFER_IN', quantityDeltaBase: line.quantityBase, costAmountMinor: line.costAmountMinor, referenceType: 'STOCK_TRANSFER', referenceId: transfer.id, reason: `Received ${transfer.transferNumber}: ${transfer.reason}`, idempotencyKey: `transfer-receive:${transfer.id}:${index}`, actorUserId, transaction });
      await InventoryBatch.create({ tenantId, branchId: destinationBranchId, productId: line.productId, batchNumber: `${transfer.transferNumber}-${index + 1}`.slice(0, 120), packageLabel: 'Inter-branch transfer', packageSizeBaseUnits: '1.000', quantityReceivedBase: line.quantityBase, quantityCurrentBase: line.quantityBase, status: 'ACTIVE' }, { transaction });
    }
    transfer.status = 'RECEIVED'; transfer.receivedByUserId = actorUserId; transfer.receivedAt = new Date(); await transfer.save({ transaction });
    return { transfer, replayed: false };
  });
}

async function postSupplierReturn({ tenantId, branchId, supplierId, productId, batchId = null, quantityBase, creditMinor, reason, idempotencyKey, actorUserId }) {
  if (idempotencyKey) { const replay = await SupplierReturn.findOne({ where: { tenantId, idempotencyKey } }); if (replay) return { supplierReturn: replay, replayed: true }; }
  return sequelize.transaction(async (transaction) => {
    const [supplier, product] = await Promise.all([
      Supplier.findOne({ where: { id: supplierId, tenantId, status: 'ACTIVE' }, transaction }),
      Product.findOne({ where: { id: productId, tenantId, status: 'ACTIVE', trackInventory: true }, transaction })
    ]);
    if (!supplier || !product) { const error = new Error('Active supplier and inventory item are required.'); error.status = 400; throw error; }
    const quantity = positiveDecimal(quantityBase, 'quantityBase');
    let batch = null;
    if (batchId) {
      batch = await InventoryBatch.findOne({ where: { id: batchId, tenantId, branchId, productId, supplierId, status: 'ACTIVE' }, transaction, lock: transaction.LOCK.UPDATE });
      if (!batch || quantity.gt(batch.quantityCurrentBase)) { const error = new Error('The selected batch does not have enough returnable stock.'); error.status = 409; throw error; }
    }
    const supplierReturn = await SupplierReturn.create({ tenantId, branchId, supplierId, productId, batchId: batch?.id || null, returnNumber: returnNumber(), quantityBase: quantity.toDecimalPlaces(3).toFixed(3), creditMinor: minorInteger(creditMinor, 'creditMinor').toString(), reason: String(reason).trim().slice(0, 2000), idempotencyKey: idempotencyKey || null, createdByUserId: actorUserId }, { transaction });
    await applyInventoryMovement({ tenantId, branchId, productId, movementType: 'RETURN_OUT', quantityDeltaBase: quantity.negated(), referenceType: 'SUPPLIER_RETURN', referenceId: supplierReturn.id, reason: supplierReturn.reason, idempotencyKey: `supplier-return:${supplierReturn.id}`, actorUserId, transaction });
    let remaining = quantity;
    const returnBatches = batch ? [batch] : await InventoryBatch.findAll({ where: { tenantId, branchId, productId, status: 'ACTIVE', quantityCurrentBase: { [Op.gt]: 0 } }, order: [sequelize.literal('"expiresAt" ASC NULLS LAST'), ['createdAt', 'ASC']], transaction, lock: transaction.LOCK.UPDATE });
    for (const row of returnBatches) {
      if (remaining.lte(0)) break;
      const available = positiveDecimal(row.quantityCurrentBase, 'batch quantity');
      const used = available.lt(remaining) ? available : remaining;
      row.quantityCurrentBase = available.minus(used).toDecimalPlaces(3).toFixed(3);
      if (Number(row.quantityCurrentBase) <= 0) row.status = 'DEPLETED';
      await row.save({ transaction });
      remaining = remaining.minus(used);
    }
    return { supplierReturn, replayed: false };
  });
}

async function listTransfers({ tenantId, branchId }) {
  return StockTransfer.findAll({ where: { tenantId, [Op.or]: [{ sourceBranchId: branchId }, { destinationBranchId: branchId }] }, include: [{ model: StockTransferLine, as: 'lines' }], order: [['createdAt', 'DESC']], limit: 100 });
}

module.exports = { dispatchTransfer, receiveTransfer, postSupplierReturn, listTransfers };
