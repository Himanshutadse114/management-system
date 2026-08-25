const express = require('express');
const {
  User,
  Tenant,
  TenantMembership,
  Branch,
  BranchMembership,
  AuditLog,
  BRANCH_ROLES,
  BRANCH_TYPES
} = require('../models');
const { authenticate, requireApproved, requireTenantAdmin } = require('../middleware/auth');
const { normalizeEmail } = require('../services/accessService');

const router = express.Router();
router.use(authenticate, requireApproved);

async function loadTenant(req, res, next) {
  try {
    const tenant = await Tenant.findByPk(req.params.tenantId);
    if (!tenant || tenant.status !== 'ACTIVE') return res.status(404).json({ message: 'Active tenant not found.' });
    req.tenant = tenant;
    next();
  } catch (error) { next(error); }
}

function requireTenantReader(req, res, next) {
  if (req.access?.isSuperAdmin) return next();
  const membership = (req.access?.tenants || []).find((row) =>
    String(row.tenantId) === String(req.params.tenantId) && ['TENANT_ADMIN', 'AUDITOR'].includes(row.role)
  );
  if (!membership) return res.status(403).json({ message: 'Tenant read access required.', code: 'TENANT_READ_DENIED' });
  next();
}

async function audit(req, action, entityType, entityId, metadata = null, branchId = null) {
  await AuditLog.create({
    tenantId: req.tenant.id,
    branchId,
    actorUserId: req.userId,
    action,
    entityType,
    entityId: entityId ? String(entityId) : null,
    metadata,
    ipAddress: req.ip || null
  });
}

router.get('/:tenantId', loadTenant, requireTenantReader, async (req, res) => {
  res.json({ tenant: req.tenant });
});

router.get('/:tenantId/members', loadTenant, requireTenantAdmin, async (req, res) => {
  const memberships = await TenantMembership.findAll({ where: { tenantId: req.tenant.id }, order: [['createdAt', 'ASC']] });
  res.json({ memberships });
});

// Auditors may list branches for filtering/reporting, but all write routes below
// remain protected by requireTenantAdmin.
router.get('/:tenantId/branches', loadTenant, requireTenantReader, async (req, res) => {
  const branches = await Branch.findAll({ where: { tenantId: req.tenant.id }, order: [['name', 'ASC']] });
  res.json({ branches });
});

router.post('/:tenantId/branches', loadTenant, requireTenantAdmin, async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const code = String(req.body?.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 50);
    const type = String(req.body?.type || '').toUpperCase();
    if (name.length < 2 || !code) return res.status(400).json({ message: 'Branch name and code are required.' });
    if (!BRANCH_TYPES.includes(type)) return res.status(400).json({ message: `Branch type must be one of: ${BRANCH_TYPES.join(', ')}` });

    const branch = await Branch.create({
      tenantId: req.tenant.id,
      name,
      code,
      type,
      address: req.body?.address ? String(req.body.address).trim() : null,
      phone: req.body?.phone ? String(req.body.phone).trim() : null,
      timezone: req.body?.timezone || 'Asia/Kolkata',
      currency: req.body?.currency || 'INR',
      status: 'ACTIVE'
    });
    await audit(req, 'BRANCH_CREATED', 'Branch', branch.id, { name, code, type }, branch.id);
    res.status(201).json({ branch });
  } catch (error) {
    if (error?.name === 'SequelizeUniqueConstraintError') return res.status(409).json({ message: 'This branch code already exists for the tenant.' });
    next(error);
  }
});

router.get('/:tenantId/branches/:branchId/members', loadTenant, requireTenantAdmin, async (req, res) => {
  const branch = await Branch.findOne({ where: { id: req.params.branchId, tenantId: req.tenant.id } });
  if (!branch) return res.status(404).json({ message: 'Branch not found.' });
  const memberships = await BranchMembership.findAll({ where: { tenantId: req.tenant.id, branchId: branch.id }, order: [['createdAt', 'ASC']] });
  res.json({ branch, memberships });
});

router.post('/:tenantId/branches/:branchId/members', loadTenant, requireTenantAdmin, async (req, res, next) => {
  try {
    const branch = await Branch.findOne({ where: { id: req.params.branchId, tenantId: req.tenant.id } });
    if (!branch) return res.status(404).json({ message: 'Branch not found.' });
    const email = normalizeEmail(req.body?.email);
    const role = String(req.body?.role || '').toUpperCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Valid staff email is required.' });
    if (!BRANCH_ROLES.includes(role)) return res.status(400).json({ message: `Role must be one of: ${BRANCH_ROLES.join(', ')}` });

    const user = await User.findOne({ where: { email } });
    const [membership, created] = await BranchMembership.findOrCreate({
      where: { branchId: branch.id, email, role },
      defaults: { tenantId: req.tenant.id, branchId: branch.id, userId: user?.id || null, email, role, status: user ? 'ACTIVE' : 'INVITED', invitedByUserId: req.userId, activatedAt: user ? new Date() : null }
    });
    if (!created) {
      membership.userId = user?.id || membership.userId;
      membership.status = user ? 'ACTIVE' : 'INVITED';
      membership.invitedByUserId = req.userId;
      membership.activatedAt = user ? (membership.activatedAt || new Date()) : null;
      await membership.save();
    }
    if (user && user.status !== 'ACTIVE') { user.status = 'ACTIVE'; await user.save(); }
    await audit(req, 'BRANCH_MEMBER_ASSIGNED', 'BranchMembership', membership.id, { email, role }, branch.id);
    res.status(created ? 201 : 200).json({ branch, membership });
  } catch (error) { next(error); }
});

router.patch('/:tenantId/branches/:branchId/members/:membershipId/status', loadTenant, requireTenantAdmin, async (req, res, next) => {
  try {
    const membership = await BranchMembership.findOne({ where: { id: req.params.membershipId, tenantId: req.tenant.id, branchId: req.params.branchId } });
    if (!membership) return res.status(404).json({ message: 'Branch membership not found.' });
    const status = String(req.body?.status || '').toUpperCase();
    if (!['ACTIVE', 'SUSPENDED'].includes(status)) return res.status(400).json({ message: 'Status must be ACTIVE or SUSPENDED.' });
    const previous = membership.status;
    membership.status = status;
    await membership.save();
    await audit(req, 'BRANCH_MEMBER_STATUS_CHANGED', 'BranchMembership', membership.id, { previous, status }, membership.branchId);
    res.json({ membership });
  } catch (error) { next(error); }
});

module.exports = router;
