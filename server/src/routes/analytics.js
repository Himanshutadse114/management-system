const express = require('express');
const { Op } = require('sequelize');
const { AuditLog, Branch } = require('../models');
const { BranchExpense } = require('../models/finance');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');
const { getAnalytics, rangeFromQuery } = require('../services/analyticsService');

const router = express.Router();
router.use(authenticate, requireApproved);

function canViewTenant(req, tenantId) {
  if (req.access?.isSuperAdmin) return true;
  return (req.access?.tenants || []).some((row) => String(row.tenantId) === String(tenantId) && ['TENANT_ADMIN', 'AUDITOR'].includes(row.role));
}

function tenantViewAccess(req, res, next) {
  if (!canViewTenant(req, req.params.tenantId)) {
    return res.status(403).json({ message: 'Tenant analytics access required.', code: 'ANALYTICS_ACCESS_DENIED' });
  }
  next();
}

function scopedBranchAccess(...roles) {
  return (req, res, next) => requireBranchRoles(...roles)(req, res, (error) => {
    if (error) return next(error);
    if (!req.branch || String(req.branch.tenantId) !== String(req.params.tenantId)) {
      return res.status(404).json({ message: 'Branch not found in this tenant.' });
    }
    next();
  });
}

async function audit(req, action, entityId, metadata = null) {
  await AuditLog.create({
    tenantId: req.params.tenantId,
    branchId: req.params.branchId || null,
    actorUserId: req.userId,
    action,
    entityType: 'BranchExpense',
    entityId: entityId ? String(entityId) : null,
    metadata,
    ipAddress: req.ip || null
  });
}

function cleanText(value, max = 255) {
  const text = String(value || '').trim();
  return text ? text.slice(0, max) : null;
}

function positiveMinor(value) {
  try {
    const amount = BigInt(String(value));
    if (amount <= 0n) throw new Error();
    return amount;
  } catch (_) {
    const error = new Error('amountMinor must be a positive integer in minor currency units.');
    error.status = 400;
    throw error;
  }
}

router.get('/tenants/:tenantId/overview', tenantViewAccess, async (req, res, next) => {
  try {
    const analytics = await getAnalytics({
      tenantId: req.params.tenantId,
      from: req.query.from,
      to: req.query.to
    });
    res.json({ analytics });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId/overview', scopedBranchAccess('BRANCH_MANAGER', 'AUDITOR'), async (req, res, next) => {
  try {
    const analytics = await getAnalytics({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      from: req.query.from,
      to: req.query.to
    });
    res.json({ analytics, branch: req.branch });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/expenses', tenantViewAccess, async (req, res, next) => {
  try {
    const range = rangeFromQuery(req.query.from, req.query.to);
    const where = {
      tenantId: req.params.tenantId,
      expenseDate: { [Op.between]: [range.from, range.to] }
    };
    if (req.query.branchId) {
      const branch = await Branch.findOne({ where: { id: req.query.branchId, tenantId: req.params.tenantId } });
      if (!branch) return res.status(404).json({ message: 'Branch not found.' });
      where.branchId = branch.id;
    }
    if (String(req.query.status || 'POSTED').toUpperCase() !== 'ALL') where.status = String(req.query.status || 'POSTED').toUpperCase();
    const expenses = await BranchExpense.findAll({ where, order: [['expenseDate', 'DESC'], ['createdAt', 'DESC']], limit: 500 });
    res.json({ range, expenses });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/expenses', scopedBranchAccess('BRANCH_MANAGER'), async (req, res, next) => {
  try {
    const category = cleanText(req.body?.category, 100);
    const description = cleanText(req.body?.description, 2000);
    const expenseDate = String(req.body?.expenseDate || '').trim();
    if (!category) return res.status(400).json({ message: 'Expense category is required.' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(expenseDate)) return res.status(400).json({ message: 'expenseDate must be YYYY-MM-DD.' });
    const amountMinor = positiveMinor(req.body?.amountMinor);

    const expense = await BranchExpense.create({
      tenantId: req.params.tenantId,
      branchId: req.params.branchId,
      expenseDate,
      category,
      description,
      amountMinor: amountMinor.toString(),
      status: 'POSTED',
      createdByUserId: req.userId
    });
    await audit(req, 'BRANCH_EXPENSE_POSTED', expense.id, { category, amountMinor: amountMinor.toString(), expenseDate });
    res.status(201).json({ expense });
  } catch (error) { next(error); }
});

router.patch('/tenants/:tenantId/branches/:branchId/expenses/:expenseId/void', scopedBranchAccess('BRANCH_MANAGER'), async (req, res, next) => {
  try {
    const expense = await BranchExpense.findOne({ where: { id: req.params.expenseId, tenantId: req.params.tenantId, branchId: req.params.branchId } });
    if (!expense) return res.status(404).json({ message: 'Expense not found.' });
    if (expense.status === 'VOIDED') return res.json({ expense });
    expense.status = 'VOIDED';
    await expense.save();
    await audit(req, 'BRANCH_EXPENSE_VOIDED', expense.id, { amountMinor: String(expense.amountMinor), category: expense.category });
    res.json({ expense });
  } catch (error) { next(error); }
});

module.exports = router;
