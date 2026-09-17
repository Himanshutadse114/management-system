const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const Device = sequelize.models.Device || sequelize.define('Device', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, tenantId: { type: DataTypes.UUID, allowNull: false }, branchId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(160), allowNull: false }, deviceType: { type: DataTypes.STRING(32), allowNull: false }, connectionType: { type: DataTypes.STRING(24), allowNull: false }, endpoint: { type: DataTypes.STRING(500), allowNull: true }, station: { type: DataTypes.STRING(120), allowNull: true }, status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'ACTIVE' }, lastSeenAt: { type: DataTypes.DATE, allowNull: true }, capabilities: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} }
}, { tableName: 'devices' });

const PrintJob = sequelize.models.PrintJob || sequelize.define('PrintJob', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, tenantId: { type: DataTypes.UUID, allowNull: false }, branchId: { type: DataTypes.UUID, allowNull: false }, deviceId: { type: DataTypes.UUID, allowNull: false }, jobType: { type: DataTypes.STRING(32), allowNull: false }, status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'PENDING' }, payload: { type: DataTypes.JSONB, allowNull: false }, attempts: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }, errorMessage: { type: DataTypes.TEXT, allowNull: true }, idempotencyKey: { type: DataTypes.STRING(180), allowNull: true }, createdByUserId: { type: DataTypes.UUID, allowNull: false }, acknowledgedAt: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'print_jobs' });

module.exports = { Device, PrintJob };
