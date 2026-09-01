const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { OAuth2Client } = require('google-auth-library');
const { User, BranchMembership, TenantMembership, AuditLog } = require('../models');
const { jwtSecret, authenticate, requireApproved } = require('../middleware/auth');
const {
  normalizeEmail,
  isSuperAdmin,
  activateMatchingInvitations,
  capturePendingRequest,
  accessSnapshot,
  scopeAccessToTenant,
  canManageTenant
} = require('../services/accessService');

const router = express.Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Too many sign-in attempts. Try again shortly.', code: 'AUTH_RATE_LIMITED' }
});

function googleClientId() {
  const value = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  if (!value) throw new Error('GOOGLE_CLIENT_ID is required.');
  return value;
}

function issueToken(user, claims = {}, expiresIn = null) {
  return jwt.sign(
    { userId: user.id, scope: 'deva-platform', ...claims },
    jwtSecret(),
    { expiresIn: expiresIn || process.env.JWT_EXPIRES_IN || '30d' }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name || null,
    avatarUrl: user.avatarUrl || null,
    status: user.status
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

router.post('/google', authLimiter, async (req, res) => {
  try {
    const credential = String(req.body?.credential || '');
    if (!credential) return res.status(400).json({ message: 'Google credential is required.' });

    const client = new OAuth2Client(googleClientId());
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: googleClientId()
    });
    const payload = ticket.getPayload() || {};

    const googleId = String(payload.sub || '');
    const email = normalizeEmail(payload.email);
    const name = String(payload.name || '').trim();
    const avatarUrl = payload.picture || null;

    if (!googleId || !email || payload.email_verified !== true) {
      return res.status(401).json({
        message: 'A verified Google email address is required.',
        code: 'VERIFIED_GOOGLE_EMAIL_REQUIRED'
      });
    }

    let user = await User.findOne({ where: { googleId } });
    if (user && normalizeEmail(user.email) !== email) {
      const emailOwner = await User.findOne({ where: { email } });
      if (emailOwner && emailOwner.id !== user.id) {
        return res.status(409).json({ message: 'This Google email is linked to another account.' });
      }
      user.email = email;
    }

    if (!user) user = await User.findOne({ where: { email } });

    if (!user) {
      user = await User.create({
        email,
        googleId,
        name: name || email.split('@')[0],
        avatarUrl,
        status: isSuperAdmin(email) ? 'ACTIVE' : 'PENDING',
        lastLoginAt: new Date()
      });
    } else {
      user.googleId = googleId;
      if (name) user.name = name;
      if (avatarUrl) user.avatarUrl = avatarUrl;
      if (isSuperAdmin(email)) user.status = 'ACTIVE';
      user.lastLoginAt = new Date();
      await user.save();
    }

    await activateMatchingInvitations(user);
    const access = await accessSnapshot(user);
    if (!access.approved) await capturePendingRequest(user);

    const refreshedAccess = await accessSnapshot(user);
    return res.status(refreshedAccess.approved ? 200 : 202).json({
      token: issueToken(user),
      user: publicUser(user),
      access: refreshedAccess,
      pendingApproval: !refreshedAccess.approved,
      impersonation: null,
      message: refreshedAccess.approved
        ? 'Signed in successfully.'
        : 'Your Google account is verified. An administrator must assign you to a tenant or branch before business data is available.'
    });
  } catch (error) {
    console.error('[auth/google]', error);
    return res.status(500).json({ message: 'Google authentication failed.', code: 'GOOGLE_AUTH_FAILED' });
  }
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
    user: publicUser(req.user),
    access,
    pendingApproval: !access.approved,
    impersonation: impersonationPayload(req)
  });
});

module.exports = router;
