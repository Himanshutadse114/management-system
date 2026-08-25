const jwt = require('jsonwebtoken');
const { User, Branch } = require('../models');
const { accessSnapshot, isSuperAdmin, canManageTenant, hasBranchRole } = require('../services/accessService');

function jwtSecret() {
  const value = String(process.env.JWT_SECRET || '');
  if (String(process.env.NODE_ENV || '').toLowerCase() === 'production' && value.length < 32) {
    throw new Error('Production JWT_SECRET must be at least 32 characters.');
  }
  return value || 'development-only-secret-change-me';
}

async function authenticate(req, res, next) {
  const raw = req.header('Authorization') || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
  if (!token) return res.status(401).json({ message: 'Authentication required.', code: 'AUTH_REQUIRED' });

  try {
    const decoded = jwt.verify(token, jwtSecret());
    const user = await User.findByPk(decoded.userId);
    if (!user || user.status === 'SUSPENDED') {
      return res.status(401).json({ message: 'Account is unavailable.', code: 'ACCOUNT_UNAVAILABLE' });
    }

    // Critical Quizmoto-derived pattern: authorisation is live. The token proves
    // identity; PostgreSQL memberships determine current access on each request.
    req.user = user;
    req.userId = user.id;
    req.access = await accessSnapshot(user);
    next();
  } catch (error) {
    console.error('[auth] token rejected:', error.message);
    return res.status(401).json({ message: 'Invalid or expired session.', code: 'AUTH_INVALID' });
  }
}

function requireApproved(req, res, next) {
  if (!req.access?.approved) {
    return res.status(403).json({
      message: 'Your account is waiting for administrator assignment/approval.',
      code: 'ACCESS_PENDING'
    });
  }
  next();
}

function requireSuperAdmin(req, res, next) {
  if (!req.user || !isSuperAdmin(req.user.email)) {
    return res.status(403).json({ message: 'Super Admin access required.', code: 'SUPER_ADMIN_REQUIRED' });
  }
  next();
}

async function requireTenantAdmin(req, res, next) {
  try {
    const tenantId = req.params.tenantId;
    if (!tenantId || !(await canManageTenant(req.user, tenantId))) {
      return res.status(403).json({ message: 'Tenant Admin access required.', code: 'TENANT_ACCESS_DENIED' });
    }
    next();
  } catch (error) {
    next(error);
  }
}

function requireBranchRoles(...roles) {
  return async (req, res, next) => {
    try {
      const branchId = req.params.branchId;
      const branch = await Branch.findByPk(branchId);
      if (!branch || branch.status !== 'ACTIVE') {
        return res.status(404).json({ message: 'Branch not found.', code: 'BRANCH_NOT_FOUND' });
      }
      if (!(await hasBranchRole(req.user, branch, roles))) {
        return res.status(403).json({ message: 'Branch access denied.', code: 'BRANCH_ACCESS_DENIED' });
      }
      req.branch = branch;
      next();
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  jwtSecret,
  authenticate,
  requireApproved,
  requireSuperAdmin,
  requireTenantAdmin,
  requireBranchRoles
};
