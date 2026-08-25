const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const EXPENSE_STATUSES = ['POSTED', 'VOIDED'];

const BranchExpense = sequelize.models.BranchExpense || sequelize.define('BranchExpense', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  expenseDate: { type: DataTypes.DATEONLY, allowNull: false },
  category: { type: DataTypes.STRING(100), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  amountMinor: { type: DataTypes.BIGINT, allowNull: false },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'POSTED' },
  createdByUserId: { type: DataTypes.UUID, allowNull: false }
}, {
  tableName: 'branch_expenses',
  indexes: [
    { fields: ['tenantId', 'branchId', 'expenseDate'] },
    { fields: ['tenantId', 'expenseDate'] }
  ]
});

BranchExpense.beforeValidate((expense) => {
  if (!EXPENSE_STATUSES.includes(expense.status)) throw new Error(`Expense status must be one of: ${EXPENSE_STATUSES.join(', ')}`);
  if (!String(expense.category || '').trim()) throw new Error('Expense category is required.');
  if (BigInt(expense.amountMinor || 0) <= 0n) throw new Error('Expense amount must be greater than zero.');
});

module.exports = { BranchExpense, EXPENSE_STATUSES };
