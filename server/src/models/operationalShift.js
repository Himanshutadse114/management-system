const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const OperationalShift = sequelize.models.OperationalShift || sequelize.define('OperationalShift', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  userId: { type: DataTypes.UUID, allowNull: false },
  role: { type: DataTypes.STRING(32), allowNull: false },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'OPEN' },
  openingFloatMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  expectedCashMinor: { type: DataTypes.BIGINT, allowNull: true },
  declaredCashMinor: { type: DataTypes.BIGINT, allowNull: true },
  varianceMinor: { type: DataTypes.BIGINT, allowNull: true },
  openedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  submittedAt: { type: DataTypes.DATE, allowNull: true },
  closedAt: { type: DataTypes.DATE, allowNull: true },
  handedOverToUserId: { type: DataTypes.UUID, allowNull: true },
  approvedByUserId: { type: DataTypes.UUID, allowNull: true },
  closeNote: { type: DataTypes.TEXT, allowNull: true },
  approvalNote: { type: DataTypes.TEXT, allowNull: true },
  idempotencyKey: { type: DataTypes.STRING(180), allowNull: true }
}, {
  tableName: 'operational_shifts',
  indexes: [
    { fields: ['tenantId', 'branchId', 'status', 'openedAt'] },
    { fields: ['tenantId', 'branchId', 'userId', 'openedAt'] }
  ]
});

module.exports = { OperationalShift };
