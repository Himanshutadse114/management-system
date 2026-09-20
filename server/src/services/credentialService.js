const crypto = require('crypto');
const { promisify } = require('util');
const { Op } = require('sequelize');
const { User, UserCredential } = require('../models');
const { normalizeEmail } = require('./accessService');

const scrypt = promisify(crypto.scrypt);
const SCRYPT_KEY_LENGTH = 64;
const INTERNAL_EMAIL_DOMAIN = 'accounts.deva.invalid';

function normalizeUsername(value) {
  return String(value || '').trim().toLowerCase();
}

function validateUsername(value) {
  const username = normalizeUsername(value);
  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
    const error = new Error('Username must be 3-50 characters and use letters, numbers, dot, dash or underscore.');
    error.status = 400;
    error.code = 'USERNAME_INVALID';
    throw error;
  }
  return username;
}

function validatePassword(value) {
  const password = String(value || '');
  if (password.length < 10 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)) {
    const error = new Error('Password must be 10-128 characters and include uppercase, lowercase and a number.');
    error.status = 400;
    error.code = 'PASSWORD_WEAK';
    throw error;
  }
  return password;
}

function internalEmailFor(username) {
  return `${username}@${INTERNAL_EMAIL_DOMAIN}`;
}

function publicEmail(email) {
  const normalized = normalizeEmail(email);
  return normalized.endsWith(`@${INTERNAL_EMAIL_DOMAIN}`) ? null : normalized;
}

async function hashPassword(value) {
  const password = validatePassword(value);
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT_KEY_LENGTH, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${key.toString('base64')}`;
}

async function verifyPassword(value, encoded) {
  try {
    const [algorithm, n, r, p, saltValue, keyValue] = String(encoded || '').split('$');
    if (algorithm !== 'scrypt' || !saltValue || !keyValue) return false;
    const expected = Buffer.from(keyValue, 'base64');
    const actual = await scrypt(String(value || ''), Buffer.from(saltValue, 'base64'), expected.length, {
      N: Number(n), r: Number(r), p: Number(p)
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch (_) {
    return false;
  }
}

async function createPasswordAccount({ username, password, name, email, createdByUserId, mustChangePassword = true, transaction }) {
  const normalizedUsername = validateUsername(username);
  const normalizedEmail = normalizeEmail(email) || internalEmailFor(normalizedUsername);
  if (email && !/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    const error = new Error('Email address is invalid.');
    error.status = 400;
    error.code = 'EMAIL_INVALID';
    throw error;
  }

  const existingCredential = await UserCredential.findOne({ where: { username: normalizedUsername }, transaction });
  if (existingCredential) {
    const error = new Error('Username is already in use.');
    error.status = 409;
    error.code = 'USERNAME_TAKEN';
    throw error;
  }

  let user = await User.findOne({ where: { email: normalizedEmail }, transaction });
  if (user) {
    const attached = await UserCredential.findOne({ where: { userId: user.id }, transaction });
    if (attached) {
      const error = new Error('This email already has a username.');
      error.status = 409;
      error.code = 'EMAIL_HAS_CREDENTIAL';
      throw error;
    }
    user.name = String(name || user.name || normalizedUsername).trim();
    user.status = 'ACTIVE';
    await user.save({ transaction });
  } else {
    user = await User.create({
      email: normalizedEmail,
      name: String(name || normalizedUsername).trim(),
      status: 'ACTIVE'
    }, { transaction });
  }

  const credential = await UserCredential.create({
    userId: user.id,
    username: normalizedUsername,
    passwordHash: await hashPassword(password),
    mustChangePassword,
    failedAttempts: 0,
    lockedUntil: null,
    passwordChangedAt: new Date(),
    createdByUserId: createdByUserId || null
  }, { transaction });
  return { user, credential };
}

async function resetPassword(credential, password, { mustChangePassword = true, transaction } = {}) {
  credential.passwordHash = await hashPassword(password);
  credential.mustChangePassword = mustChangePassword;
  credential.failedAttempts = 0;
  credential.lockedUntil = null;
  credential.passwordChangedAt = new Date();
  await credential.save({ transaction });
  return credential;
}

async function ensureBootstrapSuperAdmin() {
  const usernameValue = String(process.env.SUPER_ADMIN_USERNAME || '').trim();
  const passwordValue = String(process.env.SUPER_ADMIN_PASSWORD || '');
  if (!usernameValue && !passwordValue) {
    console.warn('[credentials] SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD are not set; password bootstrap is disabled.');
    return null;
  }
  if (!usernameValue || !passwordValue) throw new Error('Set both SUPER_ADMIN_USERNAME and SUPER_ADMIN_PASSWORD.');

  const username = validateUsername(usernameValue);
  const email = normalizeEmail(process.env.SUPER_ADMIN_EMAIL);
  if (!email) throw new Error('SUPER_ADMIN_EMAIL is required for the bootstrap Super Admin account.');

  let user = await User.findOne({ where: { email } });
  if (!user) user = await User.create({ email, name: 'Super Admin', status: 'ACTIVE' });
  if (user.status !== 'ACTIVE') {
    user.status = 'ACTIVE';
    await user.save();
  }

  let credential = await UserCredential.findOne({ where: { [Op.or]: [{ username }, { userId: user.id }] } });
  if (!credential) {
    credential = await UserCredential.create({
      userId: user.id,
      username,
      passwordHash: await hashPassword(passwordValue),
      mustChangePassword: false,
      failedAttempts: 0,
      passwordChangedAt: new Date()
    });
    console.log(`[credentials] bootstrap Super Admin username created: ${username}`);
  } else if (credential.username !== username || credential.userId !== user.id) {
    throw new Error('Bootstrap Super Admin username conflicts with an existing account.');
  }
  return { user, credential };
}

module.exports = {
  normalizeUsername,
  validateUsername,
  validatePassword,
  internalEmailFor,
  publicEmail,
  hashPassword,
  verifyPassword,
  createPasswordAccount,
  resetPassword,
  ensureBootstrapSuperAdmin
};
