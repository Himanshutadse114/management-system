const express = require('express');
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { User } = require('../models');
const { jwtSecret, authenticate } = require('../middleware/auth');
const {
  normalizeEmail,
  isSuperAdmin,
  activateMatchingInvitations,
  capturePendingRequest,
  accessSnapshot
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

function issueToken(user) {
  return jwt.sign(
    { userId: user.id, scope: 'management-platform' },
    jwtSecret(),
    { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
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
      message: refreshedAccess.approved
        ? 'Signed in successfully.'
        : 'Your Google account is verified. An administrator must assign you to a tenant or branch before business data is available.'
    });
  } catch (error) {
    console.error('[auth/google]', error);
    return res.status(500).json({ message: 'Google authentication failed.', code: 'GOOGLE_AUTH_FAILED' });
  }
});

router.get('/status', authenticate, async (req, res) => {
  const access = await accessSnapshot(req.user);
  res.json({
    user: publicUser(req.user),
    access,
    pendingApproval: !access.approved
  });
});

module.exports = router;
