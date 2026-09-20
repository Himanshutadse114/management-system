const assert = require('node:assert/strict');
const {
  normalizeUsername,
  validateUsername,
  validatePassword,
  internalEmailFor,
  publicEmail,
  hashPassword,
  verifyPassword,
  hashRecoveryCode,
  verifyRecoveryCode
} = require('../src/services/credentialService');

describe('credential service', () => {
  it('normalizes usernames and keeps generated emails private', () => {
    assert.equal(normalizeUsername('  Owner.One  '), 'owner.one');
    assert.equal(validateUsername('Owner_01'), 'owner_01');
    assert.equal(internalEmailFor('owner_01'), 'owner_01@accounts.deva.invalid');
    assert.equal(publicEmail('owner_01@accounts.deva.invalid'), null);
    assert.equal(publicEmail('owner@example.com'), 'owner@example.com');
  });

  it('rejects weak passwords', () => {
    assert.throws(() => validatePassword('short'), (error) => error.code === 'PASSWORD_WEAK');
    assert.throws(() => validatePassword('alllowercase123'), (error) => error.code === 'PASSWORD_WEAK');
  });

  it('hashes passwords with a salt and verifies without exposing plaintext', async () => {
    const first = await hashPassword('StrongPass123');
    const second = await hashPassword('StrongPass123');
    assert.notEqual(first, second);
    assert.equal(first.includes('StrongPass123'), false);
    assert.equal(await verifyPassword('StrongPass123', first), true);
    assert.equal(await verifyPassword('WrongPass123', first), false);
  });

  it('stores recovery codes as salted hashes and compares them case-insensitively', async () => {
    const hash = await hashRecoveryCode('DEVA-ABCDE-23456-ZYXWV');
    assert.equal(hash.includes('ABCDE'), false);
    assert.equal(await verifyRecoveryCode('deva-abcde-23456-zyxwv', hash), true);
    assert.equal(await verifyRecoveryCode('DEVA-WRONG-23456-ZYXWV', hash), false);
  });
});
