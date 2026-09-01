const { Op } = require('sequelize');
const {
  User,
  AccessRequest,
  TenantMembership,
  BranchMembership,
  Tenant,
  Branch
} = require('../models');

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function superAdminEmail() {
  return normalizeEmail(process.env.SUPER_ADMIN_EMAIL);
}

function isSuperAdmin(email) {
  const configured = superAdminEmail();
  return Boolean(configured && normalizeEmail(email) === configured);
}

async function activateMatchingInvitations(user) {
  const email = normalizeEmail(user.email);
  const now = new Date();

  const tenantMemberships = await TenantMembership.findAll({
    where: { email, status: 'INVITED' }
  });
  for (const membership of tenantMemberships) {
    membership.userId = user.id;
    membership.status = 'ACTIVE';
    membership.activatedAt = now;
    await membership.save();
  }

  const branchMemberships = await BranchMembership.findAll({
    where: { email, status: 'INVITED' }
  });
  for (const membership of branchMemberships) {
    membership.userId = user.id;
    membership.status = 'ACTIVE';
    membership.activatedAt = now;
    await membership.save();
  }

  if (tenantMemberships.length || branchMemberships.length || isSuperAdmin(email)) {
    if (user.status !== 'ACTIVE') {
      user.status = 'ACTIVE';
      await user.save();
    }
    await AccessRequest.update(
      { status: 'APPROVED', reviewedAt: now },
      { where: { email, status: 'PENDING' } }
    );
  }

  return {
    activatedTenantMemberships: tenantMemberships.length,
    activatedBranchMemberships: branchMemberships.length
  };
}

async function capturePendingRequest(user) {
  if (isSuperAdmin(user.email)) return null;
  const email = normalizeEmail(user.email);

  const activeTenantCount = await TenantMembership.count({
    where: { email, status: 'ACTIVE' }
  });
  const activeBranchCount = await BranchMembership.count({
    where: { email, status: 'ACTIVE' }
  });
  if (activeTenantCount || activeBranchCount) return null;

  const [request] = await AccessRequest.findOrCreate({
    where: { email },
    defaults: {
      userId: user.id,
      email,
      status: 'PENDING',
      requestedAt: new Date()
    }
  });

  request.userId = user.id;
  request.status = 'PENDING';
  request.requestedAt = new Date();
  request.reviewedAt = null;
  request.reviewedByUserId = null;
  await request.save();
  return request;
}

async function accessSnapshot(user) {
  const email = normalizeEmail(user.email);
  if (isSuperAdmin(email)) {
    return {
      platformRole: 'SUPER_ADMIN',
      isSuperAdmin: true,
      approved: true,
      tenants: [],
      branches: []
    };
  }

  const tenantMemberships = await TenantMembership.findAll({
    where: {
      status: 'ACTIVE',
      [Op.or]: [{ userId: user.id }, { email }]
    },
    include: [{ model: Tenant, as: 'tenant', attributes: ['id', 'name', 'slug', 'status'] }],
    order: [['createdAt', 'ASC']]
  });

  const branchMemberships = await BranchMembership.findAll({
    where: {
      status: 'ACTIVE',
      [Op.or]: [{ userId: user.id }, { email }]
    },
    include: [{ model: Branch, as: 'branch', attributes: ['id', 'tenantId', 'name', 'code', 'type', 'status'] }],
    order: [['createdAt', 'ASC']]
  });

  return {
    platformRole: 'USER',
    isSuperAdmin: false,
    approved: tenantMemberships.length > 0 || branchMemberships.length > 0,
    tenants: tenantMemberships.map((m) => ({
      membershipId: m.id,
      tenantId: m.tenantId,
      role: m.role,
      status: m.status,
      tenant: m.tenant
    })),
    branches: branchMemberships.map((m) => ({
      membershipId: m.id,
      tenantId: m.tenantId,
      branchId: m.branchId,
      role: m.role,
      status: m.status,
      branch: m.branch
    }))
  };
}

function scopeAccessToTenant(access, tenantId) {
  const id = String(tenantId || '');
  const tenants = (access?.tenants || []).filter((row) => String(row.tenantId) === id);
  const branches = (access?.branches || []).filter((row) => String(row.tenantId) === id);
  return {
    platformRole: 'USER',
    isSuperAdmin: false,
    approved: tenants.length > 0 || branches.length > 0,
    tenants,
    branches
  };
}

async function canManageTenant(user, tenantId) {
  // Platform-level access is deliberately isolated from tenant operations.
  // A platform account manages businesses through /api/platform and must not
  // inherit TENANT_ADMIN privileges inside an individual business.
  if (isSuperAdmin(user.email)) return false;
  return Boolean(await TenantMembership.findOne({
    where: {
      tenantId,
      status: 'ACTIVE',
      role: 'TENANT_ADMIN',
      [Op.or]: [{ userId: user.id }, { email: normalizeEmail(user.email) }]
    }
  }));
}

async function hasBranchRole(user, branch, allowedRoles = []) {
  // Tenant Admin may manage its own branches, but a platform-level account
  // cannot inherit branch roles merely because it manages the platform.
  if (await canManageTenant(user, branch.tenantId)) return true;
  return Boolean(await BranchMembership.findOne({
    where: {
      branchId: branch.id,
      tenantId: branch.tenantId,
      status: 'ACTIVE',
      role: { [Op.in]: allowedRoles },
      [Op.or]: [{ userId: user.id }, { email: normalizeEmail(user.email) }]
    }
  }));
}

module.exports = {
  normalizeEmail,
  superAdminEmail,
  isSuperAdmin,
  activateMatchingInvitations,
  capturePendingRequest,
  accessSnapshot,
  scopeAccessToTenant,
  canManageTenant,
  hasBranchRole
};