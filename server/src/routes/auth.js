const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, UserCredential, BranchMembership, TenantMembership, AuditLog } = require('../models');
const { jwtSecret, authenticate, requireApproved } = require('../middleware/auth');
const {
  normalizeEmail,
  activateMatchingInvitations,
  accessSnapshot,
  scopeAccessToTenant,
  canManageTenant,
  isSuperAdmin
} = require('../services/accessService');
const {
  normalizeUsername,
  publicEmail,
  verifyPassword,
  verifyRecoveryCode,
  resetPassword
} = require('../services/credentialService');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Try again shortly.', code: 'AUTH_RATE_LIMITED' }
});

function issueToken(user, claims = {}, expiresIn = null) {
  return jwt.sign(
    { userId: user.id, scope: 'deva-platform', ...claims },
    jwtSecret(),
    { expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '30d' }
  );
}

function publicUser(user, credential = null) {
  return {
    id: user.id,
    email: publicEmail(user.email),
    username: credential?.username || null,
    name: user.name || null,
    avatarUrl: user.avatarUrl || null,
    status: user.status
  };
}

function credentialState(credential) {
  if (!credential) return null;
  return {
    username: credential.username,
    mustChangePassword: credential.mustChangePassword === true,
    lastUsedAt: credential.lastUsedAt || null
  };
}

function impersonationPayload(req) {
  if (!req.impersonation || !req.impersonator) return null;
  return {
    active: true,
    tenantId: req.impersonation.tenantId,
    membershipId: req.impersonation.membershipId,
    role: req.impersonation.role,
    startedAt: req.impersonation.startedAt,
    admin: publicUser(req.impersonator),
    staff: publicUser(req.user)
  };
}

router.post('/password', authLimiter, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || '');
    const credential = username
      ? await UserCredential.findOne({ where: { username } })
      : null;
    const invalid = () => res.status(401).json({
      message: 'Invalid username or password.',
      code: 'CREDENTIALS_INVALID'
    });

    if (!credential) return invalid();
    if (credential.lockedUntil && new Date(credential.lockedUntil).getTime() > Date.now()) {
      return res.status(429).json({
        message: 'This account is temporarily locked after repeated failed attempts. Try again later.',
        code: 'ACCOUNT_TEMPORARILY_LOCKED'
      });
    }

    if (!(await verifyPassword(password, credential.passwordHash))) {
      credential.failedAttempts = Number(credential.failedAttempts || 0) + 1;
      if (credential.failedAttempts >= 5) {
        credential.lockedUntil = new Date(Date.now() + 15 * 60 * 1000);
        credential.failedAttempts = 0;
      }
      await credential.save();
      return invalid();
    }

    const user = await User.findByPk(credential.userId);
    if (!user || user.status !== 'ACTIVE') {
      return res.status(401).json({ message: 'Account is unavailable.', code: 'ACCOUNT_UNAVAILABLE' });
    }

    credential.failedAttempts = 0;
    credential.lockedUntil = null;
    credential.lastUsedAt = new Date();
    await credential.save();
    user.lastLoginAt = new Date();
    await user.save();

    await activateMatchingInvitations(user);
    const access = await accessSnapshot(user);
    return res.json({
      token: issueToken(user),
      user: publicUser(user, credential),
      access,
      credential: credentialState(credential),
      pendingApproval: !access.approved,
      impersonation: null,
      message: credential.mustChangePassword
        ? 'Signed in. Create a new private password before continuing.'
        : 'Signed in successfully.'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/change-password', authenticate, async (req, res, next) => {
  try {
    const credential = req.credential || await UserCredential.findOne({ where: { userId: req.userId } });
    if (!credential) return res.status(404).json({ message: 'Password login is not enabled for this account.', code: 'PASSWORD_LOGIN_UNAVAILABLE' });
    const currentPassword = String(req.body?.currentPassword || '');
    if (!(await verifyPassword(currentPassword, credential.passwordHash))) {
      return res.status(401).json({ message: 'Current password is incorrect.', code: 'CURRENT_PASSWORD_INVALID' });
    }
    await resetPassword(credential, req.body?.newPassword, { mustChangePassword: false });
    const access = req.access || await accessSnapshot(req.user);
    await AuditLog.create({
      actorUserId: req.userId,
      action: 'PASSWORD_CHANGED',
      entityType: 'User',
      entityId: req.userId,
      metadata: { username: credential.username },
      ipAddress: req.ip || null
    });
    return res.json({
      token: issueToken(req.user),
      user: publicUser(req.user, credential),
      access,
      credential: credentialState(credential),
      pendingApproval: !access.approved,
      impersonation: null,
      message: 'Password changed successfully.'
    });
  } catch (error) {
    next(error);
  }
});

router.post('/recover-password', authLimiter, async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const credential = username ? await UserCredential.findOne({ where: { username } }) : null;
    const invalid = () => res.status(401).json({ message: 'Username or recovery code is incorrect.', code: 'RECOVERY_INVALID' });
    if (!credential?.recoveryCodeHash || !(await verifyRecoveryCode(req.body?.recoveryCode, credential.recoveryCodeHash))) return invalid();
    const user = await User.findByPk(credential.userId);
    if (!user || user.status !== 'ACTIVE') return invalid();
    const access = await accessSnapshot(user);
    const isOwner = access.isSuperAdmin || (access.tenants || []).some((row) => row.role === 'TENANT_ADMIN' && row.status === 'ACTIVE');
    if (!isOwner) return res.status(403).json({ message: 'Self-service recovery is available to Super Admin and Business Owners.', code: 'RECOVERY_NOT_ALLOWED' });
    await resetPassword(credential, req.body?.newPassword, { mustChangePassword: false });
    await AuditLog.create({ actorUserId: user.id, action: 'PASSWORD_RECOVERED', entityType: 'User', entityId: user.id, metadata: { username }, ipAddress: req.ip || null });
    return res.json({ message: 'Password reset successfully. You can now sign in.' });
  } catch (error) { next(error); }
});

router.post('/impersonate', authenticate, requireApproved, async (req, res, next) => {
  try {
    if (req.impersonation) {
      return res.status(409).json({ message: 'Return to your Business Admin account before starting another staff session.', code: 'IMPERSONATION_NESTED_DENIED' });
    }

    const tenantId = String(req.body?.tenantId || '');
    const membershipId = String(req.body?.membershipId || '');
    if (!tenantId || !membershipId) {
      return res.status(400).json({ message: 'Business and staff assignment are required.', code: 'IMPERSONATION_TARGET_REQUIRED' });
    }
    if (!(await canManageTenant(req.user, tenantId))) {
      return res.status(403).json({ message: 'Business Admin access required.', code: 'IMPERSONATION_ADMIN_REQUIRED' });
    }

    const membership = await BranchMembership.findByPk(membershipId);
    if (!membership || String(membership.tenantId) !== tenantId) {
      return res.status(404).json({ message: 'Staff assignment not found in this business.', code: 'IMPERSONATION_STAFF_NOT_FOUND' });
    }
    if (membership.status === 'SUSPENDED') {
      return res.status(409).json({ message: 'Suspended staff cannot be used for an impersonation session.', code: 'IMPERSONATION_STAFF_SUSPENDED' });
    }

    const email = normalizeEmail(membership.email);
    let staff = membership.userId ? await User.findByPk(membership.userId) : null;
    if (!staff) staff = await User.findOne({ where: { email } });
    if (!staff) {
      staff = await User.create({
        email,
        name: email.split('@')[0],
        status: 'ACTIVE'
      });
    }
    if (staff.status === 'SUSPENDED') {
      return res.status(409).json({ message: 'Suspended staff cannot be used for an impersonation session.', code: 'IMPERSONATION_STAFF_SUSPENDED' });
    }
    if (isSuperAdmin(staff.email)) {
      return res.status(403).json({ message: 'Platform accounts cannot be impersonated.', code: 'IMPERSONATION_PLATFORM_DENIED' });
    }

    const staffIsTenantAdmin = await TenantMembership.findOne({
      where: {
        tenantId,
        role: 'TENANT_ADMIN',
        status: 'ACTIVE',
        [Op.or]: [{ userId: staff.id }, { email }]
      }
    });
    if (staffIsTenantAdmin) {
      return res.status(403).json({ message: 'Business Admin accounts cannot be impersonated as staff.', code: 'IMPERSONATION_ADMIN_TARGET_DENIED' });
    }

    if (membership.userId !== staff.id || membership.status !== 'ACTIVE') {
      membership.userId = staff.id;
      membership.status = 'ACTIVE';
      membership.activatedAt = membership.activatedAt || new Date();
      await membership.save();
    }
    if (staff.status !== 'ACTIVE') {
      staff.status = 'ACTIVE';
      await staff.save();
    }

    const scopedAccess = scopeAccessToTenant(await accessSnapshot(staff), tenantId);
    if (!scopedAccess.approved) {
      return res.status(409).json({ message: 'This staff account has no active work access in the selected business.', code: 'IMPERSONATION_NO_STAFF_ACCESS' });
    }

    const startedAt = new Date().toISOString();
    await AuditLog.create({
      tenantId,
      branchId: membership.branchId,
      actorUserId: req.user.id,
      action: 'STAFF_IMPERSONATION_STARTED',
      entityType: 'User',
      entityId: staff.id,
      metadata: {
        staffEmail: staff.email,
        role: membership.role,
        membershipId: membership.id,
        startedAt
      },
      ipAddress: req.ip || null
    });

    const token = issueToken(staff, {
      impersonatorUserId: req.user.id,
      impersonationTenantId: tenantId,
      impersonationMembershipId: membership.id,
      impersonationStartedAt: startedAt
    }, '4h');

    return res.json({
      token,
      user: publicUser(staff),
      access: scopedAccess,
      pendingApproval: false,
      impersonation: {
        active: true,
        tenantId,
        membershipId: membership.id,
        role: membership.role,
        startedAt,
        admin: publicUser(req.user),
        staff: publicUser(staff)
      },
      message: `Working as ${staff.email}.`
    });
  } catch (error) {
    next(error);
  }
});

router.post('/impersonation/stop', authenticate, async (req, res, next) => {
  try {
    if (!req.impersonator || !req.impersonation) {
      return res.status(409).json({ message: 'No staff impersonation session is active.', code: 'IMPERSONATION_NOT_ACTIVE' });
    }

    const admin = req.impersonator;
    const access = await accessSnapshot(admin);
    await AuditLog.create({
      tenantId: req.impersonation.tenantId,
      branchId: null,
      actorUserId: admin.id,
      action: 'STAFF_IMPERSONATION_ENDED',
      entityType: 'User',
      entityId: req.user.id,
      metadata: {
        staffEmail: req.user.email,
        role: req.impersonation.role,
        membershipId: req.impersonation.membershipId,
        startedAt: req.impersonation.startedAt,
        endedAt: new Date().toISOString()
      },
      ipAddress: req.ip || null
    });

    return res.json({
      token: issueToken(admin),
      user: publicUser(admin),
      access,
      pendingApproval: !access.approved,
      impersonation: null,
      message: 'Returned to your Business Admin account.'
    });
  } catch (error) {
    next(error);
  }
});

router.get('/status', authenticate, async (req, res) => {
  const access = req.access || await accessSnapshot(req.user);
  res.json({
    user: publicUser(req.user, req.credential),
    access,
    credential: credentialState(req.credential),
    pendingApproval: !access.approved,
    impersonation: impersonationPayload(req)
  });
});

module.exports = router;
