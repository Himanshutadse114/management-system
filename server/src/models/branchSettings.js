const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const BranchSettings = sequelize.models.BranchSettings || sequelize.define('BranchSettings', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  legalName: { type: DataTypes.STRING(200), allowNull: true },
  gstin: { type: DataTypes.STRING(15), allowNull: true },
  fssaiNumber: { type: DataTypes.STRING(32), allowNull: true },
  stateCode: { type: DataTypes.STRING(2), allowNull: true },
  invoicePrefix: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'INV' },
  receiptFooter: { type: DataTypes.TEXT, allowNull: true },
  defaultTaxRateBps: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  serviceChargeRateBps: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  allowedPaymentMethods: { type: DataTypes.JSONB, allowNull: false, defaultValue: ['CASH', 'CARD', 'UPI'] },
  upiVpa: { type: DataTypes.STRING(120), allowNull: true },
  opensAt: { type: DataTypes.STRING(5), allowNull: true },
  closesAt: { type: DataTypes.STRING(5), allowNull: true },
  businessDayCloseAt: { type: DataTypes.STRING(5), allowNull: false, defaultValue: '04:00' },
  requireShiftForBilling: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'branch_settings', indexes: [{ unique: true, fields: ['branchId'], name: 'branch_settings_branch_unique' }] });

module.exports = { BranchSettings };
