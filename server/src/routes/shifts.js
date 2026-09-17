const express = require('express');
const { AuditLog, BranchMembership, User } = require('../models');
const { authenticate, requireApproved, requireBranchRoles } = require('../middleware/auth');
const { hasBranchRole } = require('../services/accessService');
const { SHIFT_ROLES, getCurrentShift, listShifts, openShift, submitShift, approveShift } = require('../services/shiftService');

const router = express.Router();
router.use(authenticate, requireApproved);

function scope(req, res, next) {
  return requireBranchRoles('BRANCH_MANAGER', 'CASHIER', 'WAITER')(req, res, (error) => {
    if (error) return next(error);
    if (String(req.branch.tenantId) !== String(req.params.tenantId)) return res.status(404).json({ message: 'Branch not found in this business.' });
    next();
  });
}

async function audit(req, action, entityId, metadata = null) {
  await AuditLog.create({ tenantId: req.params.tenantId, branchId: req.params.branchId, actorUserId: req.auditActorUserId || req.userId, action, entityType: 'OperationalShift', entityId: String(entityId), metadata, ipAddress: req.ip || null });
}

function activeRole(req, requested) {
  const role = String(requested || '').toUpperCase();
  if (!SHIFT_ROLES.includes(role)) return null;
  return (req.access?.branches || []).some((row) => String(row.branchId) === String(req.params.branchId) && row.role === role) ? role : null;
}

router.get('/tenants/:tenantId/branches/:branchId/current', scope, async (req, res, next) => {
  try {
    const role = String(req.query.role || '').toUpperCase() || null;
    if (role && !activeRole(req, role) && !(await hasBranchRole(req.user, req.branch, ['BRANCH_MANAGER']))) return res.status(403).json({ message: 'That shift role is not assigned to this account.' });
    const shift = await getCurrentShift({ tenantId: req.params.tenantId, branchId: req.params.branchId, userId: req.userId, role });
    const memberships = role ? await BranchMembership.findAll({
      where: { tenantId: req.params.tenantId, branchId: req.params.branchId, role, status: 'ACTIVE' },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
    }) : [];
    res.json({
      shift,
      handoverOptions: memberships
        .filter((row) => row.userId && String(row.userId) !== String(req.userId))
        .map((row) => ({ userId: row.userId, name: row.user?.name || row.user?.email || 'Staff member' }))
    });
  } catch (error) { next(error); }
});

router.get('/tenants/:tenantId/branches/:branchId', scope, async (req, res, next) => {
  try {
    if (!(await hasBranchRole(req.user, req.branch, ['BRANCH_MANAGER']))) return res.status(403).json({ message: 'Branch Manager access required.' });
    const shifts = await listShifts({ tenantId: req.params.tenantId, branchId: req.params.branchId, status: req.query.status, limit: req.query.limit });
    const staff = await BranchMembership.findAll({
      where: { tenantId: req.params.tenantId, branchId: req.params.branchId, status: 'ACTIVE' },
      include: [{ model: User, as: 'user', attributes: ['id', 'name', 'email'] }]
    });
    res.json({ shifts, staff: staff.map((row) => ({ userId: row.userId, role: row.role, user: row.user })) });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/open', scope, async (req, res, next) => {
  try {
    const role = activeRole(req, req.body?.role);
    if (!role) return res.status(403).json({ message: 'You can only open a shift for your assigned cashier or waiter role.', code: 'SHIFT_ROLE_DENIED' });
    const result = await openShift({ tenantId: req.params.tenantId, branchId: req.params.branchId, userId: req.userId, role, openingFloatMinor: req.body?.openingFloatMinor, idempotencyKey: req.body?.idempotencyKey });
    if (!result.replayed) await audit(req, 'SHIFT_OPENED', result.shift.id, { role, openingFloatMinor: result.shift.openingFloatMinor });
    res.status(result.replayed ? 200 : 201).json(result);
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'You already have an open shift in this branch.', code: 'SHIFT_ALREADY_OPEN' });
    next(error);
  }
});

router.post('/tenants/:tenantId/branches/:branchId/:shiftId/submit', scope, async (req, res, next) => {
  try {
    const shift = await submitShift({ tenantId: req.params.tenantId, branchId: req.params.branchId, shiftId: req.params.shiftId, userId: req.userId, declaredCashMinor: req.body?.declaredCashMinor, closeNote: req.body?.closeNote, handedOverToUserId: req.body?.handedOverToUserId });
    await audit(req, 'SHIFT_SUBMITTED', shift.id, { role: shift.role, expectedCashMinor: shift.expectedCashMinor, declaredCashMinor: shift.declaredCashMinor, varianceMinor: shift.varianceMinor });
    res.json({ shift });
  } catch (error) { next(error); }
});

router.post('/tenants/:tenantId/branches/:branchId/:shiftId/approve', scope, async (req, res, next) => {
  try {
    if (!(await hasBranchRole(req.user, req.branch, ['BRANCH_MANAGER']))) return res.status(403).json({ message: 'Branch Manager or Tenant Admin approval required.', code: 'SHIFT_APPROVAL_REQUIRED' });
    const result = await approveShift({ tenantId: req.params.tenantId, branchId: req.params.branchId, shiftId: req.params.shiftId, approvedByUserId: req.userId, approvalNote: req.body?.approvalNote });
    if (!result.replayed) await audit(req, 'SHIFT_CLOSED', result.shift.id, { role: result.shift.role, varianceMinor: result.shift.varianceMinor, approvalNote: result.shift.approvalNote });
    res.json(result);
  } catch (error) { next(error); }
});

module.exports = router;
