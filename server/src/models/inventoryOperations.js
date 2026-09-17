const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const InventoryBatch = sequelize.models.InventoryBatch || sequelize.define('InventoryBatch', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, tenantId: { type: DataTypes.UUID, allowNull: false }, branchId: { type: DataTypes.UUID, allowNull: false }, productId: { type: DataTypes.UUID, allowNull: false }, supplierId: { type: DataTypes.UUID, allowNull: true }, purchaseId: { type: DataTypes.UUID, allowNull: true }, purchaseLineId: { type: DataTypes.UUID, allowNull: true }, batchNumber: { type: DataTypes.STRING(120), allowNull: false }, manufacturedAt: { type: DataTypes.DATEONLY, allowNull: true }, expiresAt: { type: DataTypes.DATEONLY, allowNull: true }, mrpMinor: { type: DataTypes.BIGINT, allowNull: true }, packageLabel: { type: DataTypes.STRING(80), allowNull: true }, packageSizeBaseUnits: { type: DataTypes.DECIMAL(18, 3), allowNull: false }, quantityReceivedBase: { type: DataTypes.DECIMAL(18, 3), allowNull: false }, quantityCurrentBase: { type: DataTypes.DECIMAL(18, 3), allowNull: false }, status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'ACTIVE' }
}, { tableName: 'inventory_batches' });

const StockTransfer = sequelize.models.StockTransfer || sequelize.define('StockTransfer', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, tenantId: { type: DataTypes.UUID, allowNull: false }, sourceBranchId: { type: DataTypes.UUID, allowNull: false }, destinationBranchId: { type: DataTypes.UUID, allowNull: false }, transferNumber: { type: DataTypes.STRING(80), allowNull: false }, status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'IN_TRANSIT' }, reason: { type: DataTypes.TEXT, allowNull: false }, idempotencyKey: { type: DataTypes.STRING(180), allowNull: true }, dispatchedByUserId: { type: DataTypes.UUID, allowNull: false }, receivedByUserId: { type: DataTypes.UUID, allowNull: true }, dispatchedAt: { type: DataTypes.DATE, allowNull: false }, receivedAt: { type: DataTypes.DATE, allowNull: true }, cancelledAt: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'stock_transfers' });

const StockTransferLine = sequelize.models.StockTransferLine || sequelize.define('StockTransferLine', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, tenantId: { type: DataTypes.UUID, allowNull: false }, transferId: { type: DataTypes.UUID, allowNull: false }, productId: { type: DataTypes.UUID, allowNull: false }, quantityBase: { type: DataTypes.DECIMAL(18, 3), allowNull: false }, costAmountMinor: { type: DataTypes.BIGINT, allowNull: false }
}, { tableName: 'stock_transfer_lines' });

const SupplierReturn = sequelize.models.SupplierReturn || sequelize.define('SupplierReturn', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, tenantId: { type: DataTypes.UUID, allowNull: false }, branchId: { type: DataTypes.UUID, allowNull: false }, supplierId: { type: DataTypes.UUID, allowNull: false }, productId: { type: DataTypes.UUID, allowNull: false }, batchId: { type: DataTypes.UUID, allowNull: true }, returnNumber: { type: DataTypes.STRING(80), allowNull: false }, quantityBase: { type: DataTypes.DECIMAL(18, 3), allowNull: false }, creditMinor: { type: DataTypes.BIGINT, allowNull: false }, reason: { type: DataTypes.TEXT, allowNull: false }, idempotencyKey: { type: DataTypes.STRING(180), allowNull: true }, createdByUserId: { type: DataTypes.UUID, allowNull: false }
}, { tableName: 'supplier_returns' });

StockTransfer.hasMany(StockTransferLine, { foreignKey: 'transferId', as: 'lines' });
StockTransferLine.belongsTo(StockTransfer, { foreignKey: 'transferId', as: 'transfer' });

module.exports = { InventoryBatch, StockTransfer, StockTransferLine, SupplierReturn };
