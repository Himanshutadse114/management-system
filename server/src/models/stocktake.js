const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Stocktake = sequelize.models.Stocktake || sequelize.define('Stocktake', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(180), allowNull: false },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'COUNTING' },
  notes: { type: DataTypes.TEXT, allowNull: true },
  createdByUserId: { type: DataTypes.UUID, allowNull: false },
  submittedByUserId: { type: DataTypes.UUID, allowNull: true },
  approvedByUserId: { type: DataTypes.UUID, allowNull: true },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
  postedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'stocktakes',
  indexes: [
    { fields: ['tenantId', 'branchId', 'createdAt'] },
    { fields: ['tenantId', 'branchId', 'status'] }
  ]
});

const StocktakeLine = sequelize.models.StocktakeLine || sequelize.define('StocktakeLine', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  stocktakeId: { type: DataTypes.UUID, allowNull: false },
  productId: { type: DataTypes.UUID, allowNull: false },
  expectedQuantityBase: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
  expectedBalanceVersion: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  countedQuantityBase: { type: DataTypes.DECIMAL(18, 3), allowNull: true },
  varianceQuantityBase: { type: DataTypes.DECIMAL(18, 3), allowNull: true },
  varianceCostMinor: { type: DataTypes.BIGINT, allowNull: true },
  note: { type: DataTypes.TEXT, allowNull: true },
  movementId: { type: DataTypes.UUID, allowNull: true }
}, {
  tableName: 'stocktake_lines',
  indexes: [
    { unique: true, fields: ['stocktakeId', 'productId'], name: 'stocktake_line_product_unique' },
    { fields: ['tenantId', 'branchId', 'stocktakeId'] }
  ]
});

module.exports = { Stocktake, StocktakeLine };
