const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Sequelize, QueryTypes } = require('sequelize');
const embedded = require('../src/config/embeddedDatabase');

const BACKSLASH = String.fromCharCode(92);

async function openDatabase() {
  const engine = await embedded.createEngine();
  const sequelize = new Sequelize('management_system', 'postgres', '', {
    dialect: 'postgres', logging: false, host: engine.host, port: engine.port, pool: { max: 1, min: 0 }
  });
  embedded.enableTransactionContext(Sequelize, sequelize);
  return { engine, sequelize };
}

async function createSchema(sequelize) {
  await sequelize.query(`CREATE TABLE parents (id uuid PRIMARY KEY, name text NOT NULL, big bigint, amount numeric(30,10), tags text[], meta jsonb, blob bytea, at timestamptz, day date, flag boolean DEFAULT false)`);
  await sequelize.query(`CREATE TABLE children (id uuid PRIMARY KEY, "parentId" uuid NOT NULL REFERENCES parents(id), note text NOT NULL DEFAULT 'none')`);
}

describe('JSON database snapshot', function jsonDatabaseSuite() {
  this.timeout(60000);
  let directory;
  let previousContext;
  const opened = [];

  before(() => {
    previousContext = Sequelize._cls;
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'deva-json-db-'));
  });
  after(async () => {
    Sequelize._cls = previousContext;
    for (const { engine, sequelize } of opened) { await sequelize.close().catch(() => {}); await engine.stop(); }
    fs.rmSync(directory, { recursive: true, force: true });
  });

  async function open() {
    const handle = await openDatabase();
    opened.push(handle);
    return handle;
  }

  it('survives a restart without losing precision, types or relationships', async () => {
    const file = path.join(directory, 'db.json');
    const backend = embedded.createFileBackend(file);

    const first = await open();
    await createSchema(first.sequelize);
    const parentId = '11111111-1111-4111-8111-111111111111';
    await first.sequelize.query(
      `INSERT INTO parents VALUES ('${parentId}', 'Café ₹ "quoted"', 9007199254740993, 12345678901234.1234567891, '{a,b}', '{"k":[1,2,{"z":null}]}', '${BACKSLASH}xdeadbeef', '2026-10-21T06:30:00.123456+00', '2026-10-21', true)`
    );
    await first.sequelize.query(`INSERT INTO children VALUES ('22222222-2222-4222-8222-222222222222', '${parentId}', 'hello')`);
    const before = await first.sequelize.query(`SELECT id, name, big::text, amount::text, tags, meta, encode(blob,'hex') AS blob, at::text, day::text, flag FROM parents`, { type: QueryTypes.SELECT });

    const persistence = embedded.createPersistence(first.sequelize, backend, { flushDelayMs: 10 });
    persistence.start();
    await persistence.saveNow();
    assert.ok(fs.existsSync(file), 'snapshot file should be written');
    const snapshot = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.strictEqual(snapshot.format, embedded.FORMAT);
    assert.strictEqual(snapshot.tables.parents.length, 1);
    assert.strictEqual(snapshot.tables.parents[0].big, '9007199254740993', 'bigint must stay a string');

    // "Restart": brand new empty engine, same schema, restore from the file.
    const second = await open();
    await createSchema(second.sequelize);
    assert.strictEqual(await embedded.restoreSnapshotIfPresent(second.sequelize, backend), true);
    const after = await second.sequelize.query(`SELECT id, name, big::text, amount::text, tags, meta, encode(blob,'hex') AS blob, at::text, day::text, flag FROM parents`, { type: QueryTypes.SELECT });
    assert.deepStrictEqual(after, before);
    const children = await second.sequelize.query('SELECT * FROM children', { type: QueryTypes.SELECT });
    assert.strictEqual(children.length, 1);
    assert.strictEqual(children[0].parentId, parentId);
  });

  it('saves again shortly after a write and ignores plain reads', async () => {
    const backend = embedded.createFileBackend(path.join(directory, 'auto.json'));
    const { sequelize } = await open();
    await createSchema(sequelize);
    const persistence = embedded.createPersistence(sequelize, backend, { flushDelayMs: 20, maxStaleMs: 200 });
    persistence.start();

    await sequelize.query('SELECT 1', { type: QueryTypes.SELECT });
    assert.strictEqual(persistence.state.dirty, false, 'a read must not schedule a save');

    await sequelize.query(`INSERT INTO parents (id, name) VALUES ('33333333-3333-4333-8333-333333333333', 'late')`);
    assert.strictEqual(persistence.state.dirty, true);
    await persistence.flush();
    const saved = JSON.parse(fs.readFileSync(path.join(directory, 'auto.json'), 'utf8'));
    assert.strictEqual(saved.tables.parents[0].name, 'late');
    assert.strictEqual(persistence.state.dirty, false);
  });

  it('refuses to start from a corrupt snapshot instead of wiping data', async () => {
    const file = path.join(directory, 'corrupt.json');
    fs.writeFileSync(file, '{"format":"deva-json-database","tables":{ truncated');
    const { sequelize } = await open();
    await createSchema(sequelize);
    await assert.rejects(() => embedded.restoreSnapshotIfPresent(sequelize, embedded.createFileBackend(file)), /not valid JSON/);
  });

  it('starts fresh when no snapshot exists yet', async () => {
    const { sequelize } = await open();
    await createSchema(sequelize);
    assert.strictEqual(await embedded.restoreSnapshotIfPresent(sequelize, embedded.createFileBackend(path.join(directory, 'missing.json'))), false);
  });

  it('turns a nested transaction into a savepoint instead of deadlocking', async () => {
    const { sequelize } = await open();
    await createSchema(sequelize);
    await sequelize.transaction(async () => {
      await sequelize.query(`INSERT INTO parents (id, name) VALUES ('44444444-4444-4444-8444-444444444444', 'outer')`);
      await assert.rejects(() => sequelize.transaction(async () => {
        await sequelize.query(`INSERT INTO parents (id, name) VALUES ('55555555-5555-4555-8555-555555555555', 'inner')`);
        throw new Error('inner failed');
      }), /inner failed/);
      // A query that forgets to pass the transaction still joins it.
      const rows = await sequelize.query('SELECT name FROM parents ORDER BY name', { type: QueryTypes.SELECT });
      assert.deepStrictEqual(rows.map((row) => row.name), ['outer']);
    });
    const committed = await sequelize.query('SELECT name FROM parents', { type: QueryTypes.SELECT });
    assert.deepStrictEqual(committed.map((row) => row.name), ['outer']);
  });
});
