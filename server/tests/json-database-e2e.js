// End-to-end check of the real server in JSON database mode: boot, seed, write
// through the API, hard-kill the process, boot again, and confirm the data came
// back from the JSON snapshot. Run with: node tests/json-database-e2e.js
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'deva-json-e2e-'));
const snapshotFile = path.join(dir, 'db.json');
const PORT = Number(process.env.E2E_PORT || 5077);
const PASSWORD = 'Str0ngPassw0rd!';

const env = {
  ...process.env,
  NODE_ENV: 'development', PORT: String(PORT), DB_DRIVER: 'json', JSON_DB_PERSIST: 'true', JSON_DB_STORAGE: 'file',
  JSON_DB_FILE: snapshotFile, JSON_DB_FLUSH_DELAY_MS: '300', STORAGE_DRIVER: 'local', LOCAL_STORAGE_DIR: path.join(dir, 'objects'),
  JWT_SECRET: 'e2e-secret-with-more-than-32-characters-1234', SUPER_ADMIN_EMAIL: 'root@example.com',
  SUPER_ADMIN_USERNAME: 'rootadmin', SUPER_ADMIN_PASSWORD: PASSWORD, GOOGLE_CLIENT_ID: 'x.apps.googleusercontent.com',
  DEMO_SEED_ENABLED: 'true', CORS_ORIGIN: 'http://localhost:5173'
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function boot(label) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['src/index.js'], { cwd: root, env });
    let output = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error(`${label} did not start within 90s\n${output}`)); }, 90000);
    const onData = (chunk) => {
      output += chunk.toString();
      if (output.includes('listening on')) { clearTimeout(timer); resolve(child); }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('exit', (code) => { clearTimeout(timer); reject(new Error(`${label} exited early (${code})\n${output}`)); });
  });
}

async function api(method, route, body, token) {
  const response = await fetch(`http://127.0.0.1:${PORT}${route}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let json = text;
  try { json = JSON.parse(text); } catch (_) { /* keep text */ }
  return { status: response.status, body: json };
}

async function login() {
  const result = await api('POST', '/api/auth/password', { username: 'rootadmin', password: PASSWORD });
  if (!result.body?.token) throw new Error(`login failed: ${JSON.stringify(result.body)}`);
  return result.body.token;
}

async function main() {
  const first = await boot('boot 1');
  const health = await api('GET', '/health');
  if (health.body.database !== 'json') throw new Error(`health should report database=json, got ${JSON.stringify(health.body)}`);

  const token = await login();
  const created = await api('POST', '/api/platform/tenants', {
    name: 'Persistence Probe Cafe', ownerUsername: 'probeowner', ownerPassword: 'Tempor4ryPass!',
    ownerRecoveryCode: 'RECOVER-1234-ABCD', ownerName: 'Probe Owner', ownerEmail: 'probe@example.com'
  }, token);
  if (created.status !== 201) throw new Error(`tenant create failed: ${JSON.stringify(created.body)}`);

  await sleep(1500); // let the debounced snapshot land
  const snapshot = JSON.parse(fs.readFileSync(snapshotFile, 'utf8'));
  if (!snapshot.tables.tenants.some((row) => row.name === 'Persistence Probe Cafe')) throw new Error('new tenant missing from the snapshot file');

  first.kill('SIGKILL'); // hard kill: no graceful flush, only the debounced save can have saved it
  await sleep(800);

  const second = await boot('boot 2');
  try {
    const list = await api('GET', '/api/platform/tenants', null, await login());
    const names = (list.body.tenants || []).map((tenant) => tenant.name);
    if (!names.includes('Persistence Probe Cafe')) throw new Error(`tenant lost across restart: ${names.join(', ')}`);
    if (names.filter((name) => name === 'Demo Hospitality Group').length !== 1) throw new Error('demo data duplicated or missing after restart');
  } finally {
    second.kill('SIGKILL');
  }
  console.log('[json-database-e2e] OK: data written through the API survived a hard restart via the JSON snapshot');
}

main()
  .then(() => { fs.rmSync(dir, { recursive: true, force: true }); process.exit(0); })
  .catch((error) => { console.error('[json-database-e2e] FAILED:', error.message); fs.rmSync(dir, { recursive: true, force: true }); process.exit(1); });
