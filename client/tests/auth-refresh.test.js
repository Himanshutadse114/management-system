import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const source = () => readFile(new URL('../src/AuthContext.jsx', import.meta.url), 'utf8');

test('a cached mobile session is not blocked by background revalidation', async () => {
  const auth = await source();
  assert.match(auth, /useState\(Boolean\(token && !session\)\)/);
  assert.match(auth, /AUTH_REFRESH_TIMEOUT_MS/);
  assert.match(auth, /timeout:\s*options\.timeoutMs \|\| AUTH_REFRESH_TIMEOUT_MS/);
});

test('session storage failures do not prevent React state from updating', async () => {
  const auth = await source();
  assert.match(auth, /function writeStoredItem/);
  assert.match(auth, /setToken\(normalizedToken\)/);
  assert.match(auth, /writeStoredItem\(TOKEN_KEY, normalizedToken\)/);
});
