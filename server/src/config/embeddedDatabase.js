'use strict';

/*
 * JSON database mode (DB_DRIVER=json)
 * -----------------------------------
 * A temporary replacement for the external PostgreSQL service.
 *
 * - The relational engine is PGlite (real PostgreSQL compiled to WASM) running
 *   inside this Node process, so every existing query, transaction, migration
 *   and numeric/bigint rule keeps working unchanged.
 * - Durability comes from a human-readable JSON snapshot of every table. It is
 *   restored at boot and rewritten shortly after any write. On Render the
 *   snapshot lives in the Cloudflare R2 bucket (survives restarts/redeploys);
 *   in development it is a local file.
 *
 * Limits worth knowing: one embedded session (requests are serialised), and a
 * hard crash can lose the last couple of seconds of writes. SIGTERM flushes.
 */

const fs = require('fs');
const path = require('path');
const { AsyncLocalStorage } = require('node:async_hooks');
const pg = require('pg');

const FORMAT = 'deva-json-database';
const FORMAT_VERSION = 1;
const EXCLUDED_TABLES = new Set(['schema_migrations', 'SequelizeMeta']);
const RESTORE_CHUNK_ROWS = 400;
const WRITE_STATEMENT = /^\s*(?:INSERT|UPDATE|DELETE|TRUNCATE|CREATE|ALTER|DROP|MERGE|COPY)\b/i;
const WRITE_QUERY_TYPES = new Set(['INSERT', 'UPDATE', 'BULKUPDATE', 'BULKDELETE', 'DELETE', 'UPSERT']);

function envFlag(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return !['0', 'false', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function envNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

function isJsonDatabase() {
  return ['json', 'embedded'].includes(String(process.env.DB_DRIVER || '').trim().toLowerCase());
}

function log(message, ...rest) {
  console.log(`[json-db] ${message}`, ...rest);
}

// ---------------------------------------------------------------------------
// Embedded PostgreSQL engine
// ---------------------------------------------------------------------------

// Initialising a brand-new cluster spikes memory by ~250 MB. The Docker build
// stores a ready-made empty cluster here (scripts/build-pglite-template.js) so
// production starts from it instead. Absent/unreadable => fall back to a fresh one.
const TEMPLATE_PATH = path.join(__dirname, '..', '..', 'pglite-template', 'data.tar.gz');

async function createDatabase() {
  const { PGlite } = require('@electric-sql/pglite');
  if (fs.existsSync(TEMPLATE_PATH)) {
    try {
      const database = await PGlite.create({ loadDataDir: new Blob([fs.readFileSync(TEMPLATE_PATH)]) });
      log('started embedded engine from the prebuilt template');
      return database;
    } catch (error) {
      log(`prebuilt template could not be loaded (${error.message}); initialising a fresh cluster`);
    }
  }
  log('prebuilt template not found; initialising a fresh cluster (uses more memory)');
  return PGlite.create();
}

async function createEngine() {
  const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
  const startedAt = Date.now();
  const db = await createDatabase();

  // The socket layer swallows engine failures and just drops the client
  // connection (surfacing as ECONNRESET). Log the real reason before that.
  const runProtocol = db.execProtocolRawStream.bind(db);
  db.execProtocolRawStream = async (...args) => {
    try { return await runProtocol(...args); } catch (error) {
      log('embedded engine query failed:', error && error.stack ? error.stack : error);
      throw error;
    }
  };

  // Sequelize only ever uses one pooled connection, but a reconnect can briefly
  // overlap the old socket closing; extra connections are queued, not harmful.
  const server = new PGLiteSocketServer({
    db, port: 0, host: '127.0.0.1', maxConnections: 4, debug: envFlag('JSON_DB_DEBUG', false)
  });
  server.addEventListener('error', (event) => log('socket server error:', event.detail && event.detail.message ? event.detail.message : event.detail));
  await server.start();
  const address = String(server.getServerConn());
  const separator = address.lastIndexOf(':');
  log(`embedded engine ready in ${Date.now() - startedAt} ms, memory ${Math.round(process.memoryUsage().rss / 1048576)} MB RSS`);
  return {
    db,
    server,
    host: address.slice(0, separator),
    port: Number(address.slice(separator + 1)),
    async stop() {
      await server.stop().catch(() => {});
      await db.close().catch(() => {});
    }
  };
}

let sharedEngine = null;

function ensureEmbeddedServer() {
  if (!sharedEngine) {
    sharedEngine = createEngine();
    sharedEngine.catch(() => { sharedEngine = null; });
  }
  return sharedEngine;
}

async function stopEmbeddedServer() {
  if (!sharedEngine) return;
  const engine = await sharedEngine.catch(() => null);
  sharedEngine = null;
  if (engine) await engine.stop();
}

// Drop-in replacement for the `pg` module that Sequelize loads. The first
// connection lazily boots the embedded engine, so nothing else has to know it
// exists (the integration tests import `sequelize` directly and never call
// connectDatabase()).
function buildPgModule(getEngine) {
  class EmbeddedClient extends pg.Client {
    connect(callback) {
      const connecting = getEngine().then((engine) => {
        this.host = engine.host;
        this.port = engine.port;
        this.connectionParameters.host = engine.host;
        this.connectionParameters.port = engine.port;
        this.connectionParameters.ssl = false;
        this.ssl = false;
        return super.connect();
      });
      if (typeof callback === 'function') {
        connecting.then(() => callback(null), (error) => callback(error));
        return undefined;
      }
      return connecting;
    }
  }
  const module = Object.create(pg);
  module.Client = EmbeddedClient;
  return module;
}

const pgModule = buildPgModule(ensureEmbeddedServer);

// One embedded session means every query shares one connection. Two things keep
// that safe without touching application code:
//  1. Sequelize CLS: a query issued inside sequelize.transaction(cb) without an
//     explicit `transaction` option joins that transaction instead of queueing
//     behind it forever.
//  2. A transaction opened while another is active becomes a SAVEPOINT of it
//     (instead of waiting for a second connection that will never exist).
// Closing the connection pool must also stop the shared embedded engine,
// otherwise its socket server keeps the Node process alive after close().
function bindEngineLifecycle(sequelize) {
  const closePool = sequelize.close.bind(sequelize);
  sequelize.close = async function close() {
    await closePool();
    await stopEmbeddedServer();
  };
}

function enableTransactionContext(Sequelize, sequelize) {

  if (!Sequelize._cls) {
    const storage = new AsyncLocalStorage();
    Sequelize.useCLS({
      run(fn) {
        const store = new Map();
        return storage.run(store, () => fn(store));
      },
      bind(fn) {
        const store = storage.getStore();
        return (...args) => storage.run(store || new Map(), () => fn(...args));
      },
      get(key) { return storage.getStore()?.get(key); },
      set(key, value) { storage.getStore()?.set(key, value); }
    });
  }

  const openTransaction = sequelize.transaction.bind(sequelize);
  sequelize.transaction = function transaction(options, autoCallback) {
    if (typeof options === 'function') { autoCallback = options; options = {}; }
    const current = Sequelize._cls && Sequelize._cls.get('transaction');
    const explicit = options && options.transaction !== undefined;
    if (current && !current.finished && !explicit) {
      return openTransaction({ ...(options || {}), transaction: current }, autoCallback);
    }
    return openTransaction(options || {}, autoCallback);
  };
}

// ---------------------------------------------------------------------------
// JSON snapshot storage backends
// ---------------------------------------------------------------------------

function isNotFound(error) {
  return error?.code === 'ENOENT'
    || error?.name === 'NoSuchKey'
    || error?.name === 'NotFound'
    || error?.$metadata?.httpStatusCode === 404;
}

function createFileBackend(filePath) {
  const target = path.resolve(filePath);
  return {
    kind: 'file',
    describe: () => target,
    async read() {
      try { return await fs.promises.readFile(target); } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async write(buffer) {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      const temp = `${target}.${process.pid}.tmp`;
      await fs.promises.writeFile(temp, buffer);
      await fs.promises.rename(temp, target);
    },
    async writeBackup(name, buffer) {
      const backup = path.join(path.dirname(target), 'backups', `${name}.json`);
      await fs.promises.mkdir(path.dirname(backup), { recursive: true });
      await fs.promises.writeFile(backup, buffer);
    }
  };
}

function createObjectBackend(key) {
  const { getObjectStorage } = require('../storage/objectStorage');
  const prefix = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : 'system/db';
  return {
    kind: 'object',
    describe: () => `object storage key ${key}`,
    async read() {
      try { return await getObjectStorage().getObjectBuffer(key); } catch (error) {
        if (isNotFound(error)) return null;
        throw error;
      }
    },
    async write(buffer) {
      await getObjectStorage().putObject({ key, body: buffer, contentType: 'application/json' });
    },
    async writeBackup(name, buffer) {
      await getObjectStorage().putObject({ key: `${prefix}/backups/${name}.json`, body: buffer, contentType: 'application/json' });
    }
  };
}

function resolveBackend() {
  const mode = String(process.env.JSON_DB_STORAGE || 'auto').trim().toLowerCase();
  const useObject = mode === 'object' || (mode === 'auto' && String(process.env.STORAGE_DRIVER || '').toLowerCase() === 's3');
  if (useObject) return createObjectBackend(process.env.JSON_DB_OBJECT_KEY || 'system/db/snapshot.json');
  return createFileBackend(process.env.JSON_DB_FILE || path.join(process.cwd(), 'data', 'db.json'));
}

// ---------------------------------------------------------------------------
// Snapshot format
// ---------------------------------------------------------------------------

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

// One table per key, one row per line: readable, diff-friendly, and lossless.
function serializeSnapshot(tables) {
  const names = Object.keys(tables).sort();
  const parts = [`{"format":"${FORMAT}","version":${FORMAT_VERSION},"savedAt":${JSON.stringify(new Date().toISOString())},"tables":{`];
  names.forEach((name, index) => {
    const rows = tables[name];
    parts.push(`${index ? ',' : ''}\n${JSON.stringify(name)}:[${rows.map((row) => `\n${JSON.stringify(row)}`).join(',')}${rows.length ? '\n' : ''}]`);
  });
  parts.push('\n}}\n');
  return Buffer.from(parts.join(''), 'utf8');
}

function parseSnapshot(buffer) {
  let snapshot;
  try { snapshot = JSON.parse(buffer.toString('utf8')); } catch (error) {
    throw new Error(`JSON database snapshot is not valid JSON (${error.message}). Refusing to start with an empty database.`);
  }
  if (!snapshot || snapshot.format !== FORMAT || typeof snapshot.tables !== 'object') {
    throw new Error('JSON database snapshot has an unexpected format. Refusing to start with an empty database.');
  }
  return snapshot;
}

async function listTableColumns(sequelize, transaction) {
  const rows = await sequelize.query(
    `SELECT c.table_name AS "table", c.column_name AS "column", c.data_type AS "type"
       FROM information_schema.columns c
       JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
      WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'
      ORDER BY c.table_name, c.ordinal_position`,
    { type: 'SELECT', transaction }
  );
  const tables = {};
  for (const row of rows) {
    if (EXCLUDED_TABLES.has(row.table)) continue;
    (tables[row.table] ||= []).push({ name: row.column, type: row.type });
  }
  return tables;
}

// bigint/numeric travel as strings: a JSON number would silently round money
// and stock quantities above 2^53 or beyond double precision.
async function dumpTables(sequelize) {
  return sequelize.transaction(async (transaction) => {
    const layout = await listTableColumns(sequelize, transaction);
    const tables = {};
    for (const [table, columns] of Object.entries(layout)) {
      const fields = columns
        .map((column) => `'${column.name.replace(/'/g, "''")}', t.${quoteIdent(column.name)}${['numeric', 'bigint'].includes(column.type) ? '::text' : ''}`)
        .join(', ');
      const [result] = await sequelize.query(
        `SELECT COALESCE(jsonb_agg(jsonb_build_object(${fields})), '[]'::jsonb) AS rows FROM public.${quoteIdent(table)} t`,
        { type: 'SELECT', transaction }
      );
      tables[table] = result.rows;
    }
    return tables;
  });
}

async function loadTables(sequelize, snapshot) {
  await sequelize.transaction(async (transaction) => {
    const layout = await listTableColumns(sequelize, transaction);
    const restorable = Object.keys(snapshot.tables).filter((table) => layout[table]);
    if (!restorable.length) return;

    // Foreign keys are validated by the snapshot's own consistency, not by load order.
    await sequelize.query("SET LOCAL session_replication_role = 'replica'", { transaction });
    await sequelize.query(`TRUNCATE ${restorable.map((table) => `public.${quoteIdent(table)}`).join(', ')} CASCADE`, { transaction });

    for (const table of restorable) {
      const rows = snapshot.tables[table];
      if (!Array.isArray(rows) || !rows.length) continue;
      const known = new Set(layout[table].map((column) => column.name));
      const columns = Object.keys(rows[0]).filter((column) => known.has(column));
      if (!columns.length) continue;
      const list = columns.map(quoteIdent).join(', ');
      for (let offset = 0; offset < rows.length; offset += RESTORE_CHUNK_ROWS) {
        const chunk = rows.slice(offset, offset + RESTORE_CHUNK_ROWS);
        await sequelize.query(
          `INSERT INTO public.${quoteIdent(table)} (${list}) SELECT ${list} FROM jsonb_populate_recordset(NULL::public.${quoteIdent(table)}, $1::jsonb)`,
          { bind: [JSON.stringify(chunk)], transaction }
        );
      }
    }

    // Keep any serial/identity sequences ahead of the restored rows.
    const sequences = await sequelize.query(
      `SELECT c.table_name AS "table", c.column_name AS "column", pg_get_serial_sequence(format('public.%I', c.table_name), c.column_name) AS sequence
         FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_default LIKE 'nextval(%'`,
      { type: 'SELECT', transaction }
    );
    for (const row of sequences) {
      if (!row.sequence || !snapshot.tables[row.table]) continue;
      await sequelize.query(
        `SELECT setval($1, COALESCE((SELECT MAX(${quoteIdent(row.column)}) FROM public.${quoteIdent(row.table)}), 0) + 1, false)`,
        { bind: [row.sequence], transaction }
      );
    }
  });
}

// ---------------------------------------------------------------------------
// Persistence controller
// ---------------------------------------------------------------------------

function createPersistence(sequelize, backend, options = {}) {
  // Remote object storage costs a request per save, so it batches more.
  const remote = backend.kind === 'object';
  const flushDelayMs = options.flushDelayMs ?? envNumber('JSON_DB_FLUSH_DELAY_MS', remote ? 5000 : 2000);
  const maxStaleMs = options.maxStaleMs ?? envNumber('JSON_DB_MAX_STALE_MS', remote ? 20000 : 10000);
  const state = { dirty: false, dirtyAt: 0, timer: null, saving: null, suppress: false, lastBackupDay: '', lastSavedAt: null, lastError: null };

  async function writeSnapshot() {
    state.suppress = true;
    let tables;
    try { tables = await dumpTables(sequelize); } finally { state.suppress = false; }
    const buffer = serializeSnapshot(tables);
    await backend.write(buffer);
    state.lastSavedAt = new Date();
    state.lastError = null;

    // Seven rolling daily copies (one slot per weekday) as a cheap safety net.
    const today = new Date().toISOString().slice(0, 10);
    if (state.lastBackupDay !== today && backend.writeBackup) {
      try {
        await backend.writeBackup(`day-${new Date().getUTCDay()}`, buffer);
        state.lastBackupDay = today;
      } catch (error) { log('daily backup failed:', error.message); }
    }
    return buffer.length;
  }

  function runSave() {
    if (state.saving) return state.saving;
    state.timer = null;
    state.dirty = false;
    state.dirtyAt = 0;
    state.saving = writeSnapshot()
      .catch((error) => {
        state.lastError = error;
        state.dirty = true;
        state.dirtyAt = state.dirtyAt || Date.now();
        log('snapshot save failed, will retry:', error.message);
        schedule(5000);
      })
      .finally(() => {
        state.saving = null;
        if (state.dirty) schedule();
      });
    return state.saving;
  }

  function schedule(delay) {
    if (state.timer) return;
    const waited = state.dirtyAt ? Date.now() - state.dirtyAt : 0;
    state.timer = setTimeout(runSave, Math.max(0, Math.min(delay ?? flushDelayMs, maxStaleMs - waited)));
  }

  function markDirty() {
    if (!state.dirty) { state.dirty = true; state.dirtyAt = Date.now(); }
    if (state.saving) return; // the next save picks this up once the current one ends
    schedule();
  }

  function onAfterQuery(queryOptions, query) {
    if (state.suppress) return;
    const sql = String(query?.sql ?? queryOptions?.sql ?? '');
    if (WRITE_QUERY_TYPES.has(String(queryOptions?.type || '').toUpperCase()) || WRITE_STATEMENT.test(sql)) markDirty();
  }

  return {
    state,
    start() { sequelize.addHook('afterQuery', 'jsonDatabasePersistence', onAfterQuery); },
    markDirty,
    async saveNow() {
      if (state.timer) { clearTimeout(state.timer); state.timer = null; }
      if (state.saving) await state.saving;
      return runSave();
    },
    async flush() {
      if (state.timer) { clearTimeout(state.timer); state.timer = null; }
      if (state.saving) await state.saving;
      if (state.dirty) await runSave();
    }
  };
}

let persistence = null;
let shutdownRegistered = false;

async function restoreSnapshotIfPresent(sequelize, backendOverride) {
  if (!envFlag('JSON_DB_PERSIST', true) && !backendOverride) return false;
  const backend = backendOverride || resolveBackend();
  const buffer = await backend.read();
  if (!buffer) {
    log(`no snapshot found at ${backend.describe()} — starting with a fresh database`);
    return false;
  }
  const snapshot = parseSnapshot(buffer);
  await loadTables(sequelize, snapshot);
  const tables = Object.keys(snapshot.tables).length;
  const rows = Object.values(snapshot.tables).reduce((sum, list) => sum + (Array.isArray(list) ? list.length : 0), 0);
  log(`restored ${rows} rows across ${tables} tables (saved ${snapshot.savedAt || 'unknown time'}) from ${backend.describe()}`);
  return true;
}

async function startPersistence(sequelize, backendOverride) {
  if (!envFlag('JSON_DB_PERSIST', true) && !backendOverride) {
    log('persistence disabled (JSON_DB_PERSIST=false): data lives in memory only');
    return null;
  }
  const backend = backendOverride || resolveBackend();
  persistence = createPersistence(sequelize, backend);
  persistence.start();
  await persistence.saveNow();
  log(`persisting to ${backend.describe()}`);

  if (!shutdownRegistered) {
    shutdownRegistered = true;
    let closing = false;
    const shutdown = async (signal) => {
      if (closing) return;
      closing = true;
      log(`${signal} received — flushing snapshot`);
      try { await persistence.saveNow(); } catch (error) { log('final snapshot failed:', error.message); }
      process.exit(0);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  }
  return persistence;
}

function getPersistence() { return persistence; }

module.exports = {
  isJsonDatabase,
  pgModule,
  createEngine,
  TEMPLATE_PATH,
  ensureEmbeddedServer,
  stopEmbeddedServer,
  enableTransactionContext,
  bindEngineLifecycle,
  createFileBackend,
  createObjectBackend,
  restoreSnapshotIfPresent,
  startPersistence,
  getPersistence,
  createPersistence,
  dumpTables,
  loadTables,
  serializeSnapshot,
  parseSnapshot,
  FORMAT
};
