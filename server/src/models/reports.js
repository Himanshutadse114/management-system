const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const REPORT_STATUSES = ['GENERATING', 'READY', 'FAILED'];
const REPORT_FORMATS = ['PDF', 'XLSX'];
const REPORT_LOCALES = ['en', 'hi', 'mr'];

const GeneratedReport = sequelize.models.GeneratedReport || sequelize.define('GeneratedReport', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: true },
  reportType: { type: DataTypes.STRING(60), allowNull: false },
  format: { type: DataTypes.STRING(12), allowNull: false },
  locale: { type: DataTypes.STRING(8), allowNull: false, defaultValue: 'en' },
  rangeFrom: { type: DataTypes.DATEONLY, allowNull: true },
  rangeTo: { type: DataTypes.DATEONLY, allowNull: true },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'GENERATING' },
  objectKey: { type: DataTypes.TEXT, allowNull: true },
  storageMode: { type: DataTypes.STRING(24), allowNull: true },
  fileData: { type: DataTypes.BLOB, allowNull: true },
  fileName: { type: DataTypes.STRING(240), allowNull: true },
  contentType: { type: DataTypes.STRING(120), allowNull: true },
  sizeBytes: { type: DataTypes.BIGINT, allowNull: true },
  errorMessage: { type: DataTypes.TEXT, allowNull: true },
  createdByUserId: { type: DataTypes.UUID, allowNull: false },
  completedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'generated_reports',
  indexes: [
    { fields: ['tenantId', 'createdAt'] },
    { fields: ['tenantId', 'branchId', 'createdAt'] },
    { fields: ['status', 'createdAt'] }
  ]
});

GeneratedReport.beforeValidate((report) => {
  if (!REPORT_STATUSES.includes(report.status)) throw new Error(`Report status must be one of: ${REPORT_STATUSES.join(', ')}`);
  if (!REPORT_FORMATS.includes(report.format)) throw new Error(`Report format must be one of: ${REPORT_FORMATS.join(', ')}`);
  if (!REPORT_LOCALES.includes(report.locale)) throw new Error(`Report locale must be one of: ${REPORT_LOCALES.join(', ')}`);
});

module.exports = { GeneratedReport, REPORT_STATUSES, REPORT_FORMATS, REPORT_LOCALES };
