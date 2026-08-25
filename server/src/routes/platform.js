const express = require('express');
const {
  User,
  AccessRequest,
  Tenant,
  TenantMembership,
  AuditLog,
  TENANT_ROLES
} = require('../models');
const { authenticate, requireSuperAdmin } = require('../middleware/auth');
const { normalizeEmail } = require('../services/accessService');

const router = express.Router();
router.use(authenticate, requireSuperAdmin);

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

async function audit(req, action, entityType, entityId, metadata = null, tenantId = null) {
  await AuditLog.create({
    tenantId,
    actorUserId: req.userId,
    action,
    entityType,
    entityId: entityId ? String(entityId) : null,
    metadata,
    ipAddress: req.ip || null
  });
}

router.get('/tenants', async (_req, res) => {
  const tenants = await Tenant.findAll({ order: [['createdAt', 'DESC']] });
  res.json({ tenants });
});

router.post('/tenants', async (req, res, next) => {
  try {
    const name = String(req.body?.name || '').trim();
    const slug = slugify(req.body?.slug || name);
    const tenantAdminEmail = normalizeEmail(req.body?.tenantAdminEmail);

    if (name.length < 2 || !slug) {
      return res.status(400).json({ message: 'Tenant name is required.' });
    }

    const existing = await Tenant.findOne({ where: { slug } });
    if (existing) return res.status(409).json({ message: 'Tenant slug already exists.' });

    const tenant = await Tenant.create({
      name,
      slug,
      status: 'ACTIVE',
      createdByUserId: req.userId
    });

    let membership = null;
    if (tenantAdminEmail) {
      const user = await User.findOne({ where: { email: tenantAdminEmail } });
      membership = await TenantMembership.create({
        tenantId: tenant.id,
        userId: user?.id || null,
        email: tenantAdminEmail,
        role: 'TENANT_ADMIN',
        status: user ? 'ACTIVE' : 'INVITED',
        invitedByUserId: req.userId,
        activatedAt: user ? new Date() : null
      });
      if (user && user.status !== 'ACTIVE') {
        user.status = 'ACTIVE';
        await user.save();
      }
    }

    await audit(req, 'TENANT_CREATED', 'Tenant', tenant.id, { name, slug, tenantAdminEmail: tenantAdminEmail || null }, tenant.id);
    res.status(201).json({ tenant, tenantAdminMembership: membership });
  } catch (error) {
    next(error);
  }
});

router.patch('/tenants/:tenantId/status', async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });
    const status = String(req.body?.status || '').toUpperCase();
    if (!['ACTIVE', 'SUSPENDED'].includes(status)) {
      return res.status(400).json({ message: 'Status must be ACTIVE or SUSPENDED.' });
    }
    const previous = tenant.status;
    tenant.status = status;
    await tenant.save();
    await audit(req, 'TENANT_STATUS_CHANGED', 'Tenant', tenant.id, { previous, status }, tenant.id);
    res.json({ tenant });
  } catch (error) {
    next(error);
  }
});

router.post('/tenants/:tenantId/admins', async (req, res, next) => {
  try {
    const tenant = await Tenant.findByPk(req.params.tenantId);
    if (!tenant) return res.status(404).json({ message: 'Tenant not found.' });
    const email = normalizeEmail(req.body?.email);
    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ message: 'Valid email is required.' });

    const user = await User.findOne({ where: { email } });
    const [membership, created] = await TenantMembership.findOrCreate({
      where: { tenantId: tenant.id, email },
      defaults: {
        tenantId: tenant.id,
        userId: user?.id || null,
        email,
        role: 'TENANT_ADMIN',
        status: user ? 'ACTIVE' : 'INVITED',
        invitedByUserId: req.userId,
        activatedAt: user ? new Date() : null
      }
    });

    if (!created) {
      membership.userId = user?.id || membership.userId;
      membership.role = 'TENANT_ADMIN';
      membership.status = user ? 'ACTIVE' : 'INVITED';
      membership.invitedByUserId = req.userId;
      membership.activatedAt = user ? (membership.activatedAt || new Date()) : null;
      await membership.save();
    }

    if (user && user.status !== 'ACTIVE') {
      user.status = 'ACTIVE';
      await user.save();
    }

    await audit(req, 'TENANT_ADMIN_ASSIGNED', 'TenantMembership', membership.id, { email }, tenant.id);
    res.status(created ? 201 : 200).json({ membership });
  } catch (error) {
    next(error);
  }
});

router.get('/access-requests', async (_req, res) => {
  const requests = await AccessRequest.findAll({
    order: [['requestedAt', 'ASC']]
  });
  res.json({
    requests,
    pending: requests.filter((request) => request.status === 'PENDING')
  });
});

router.post('/access-requests/:requestId/approve', async (req, res, next) => {
  try {
    const request = await AccessRequest.findByPk(req.params.requestId);
    if (!request) return res.status(404).json({ message: 'Access request not found.' });

    const tenant = await Tenant.findByPk(req.body?.tenantId);
    if (!tenant) return res.status(400).json({ message: 'A valid tenantId is required.' });

    const role = String(req.body?.role || 'TENANT_ADMIN').toUpperCase();
    if (!TENANT_ROLES.includes(role)) {
      return res.status(400).json({ message: `Role must be one of: ${TENANT_ROLES.join(', ')}` });
    }

    const user = await User.findByPk(request.userId);
    const email = normalizeEmail(request.email);
    const [membership] = await TenantMembership.findOrCreate({
      where: { tenantId: tenant.id, email },
      defaults: {
        tenantId: tenant.id,
        userId: user?.id || request.userId,
        email,
        role,
        status: 'ACTIVE',
        invitedByUserId: req.userId,
        activatedAt: new Date()
      }
    });
    membership.userId = user?.id || request.userId;
    membership.role = role;
    membership.status = 'ACTIVE';
    membership.activatedAt = membership.activatedAt || new Date();
    await membership.save();

    if (user) {
      user.status = 'ACTIVE';
      await user.save();
    }

    request.status = 'APPROVED';
    request.reviewedAt = new Date();
    request.reviewedByUserId = req.userId;
    await request.save();

    await audit(req, 'ACCESS_REQUEST_APPROVED', 'AccessRequest', request.id, { email, role }, tenant.id);
    res.json({ request, membership });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
