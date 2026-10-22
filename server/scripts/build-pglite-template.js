// Builds an empty, pre-initialised embedded database cluster so the JSON
// database mode can start without paying PGlite's one-off initialisation memory
// spike at runtime. Run during the Docker build; safe to skip (runtime falls back).
const fs = require('fs');
const path = require('path');
const { PGlite } = require('@electric-sql/pglite');
const { TEMPLATE_PATH } = require('../src/config/embeddedDatabase');

(async () => {
  const db = await PGlite.create();
  const archive = Buffer.from(await (await db.dumpDataDir('gzip')).arrayBuffer());
  await db.close();
  fs.mkdirSync(path.dirname(TEMPLATE_PATH), { recursive: true });
  fs.writeFileSync(TEMPLATE_PATH, archive);
  console.log(`[pglite-template] wrote ${Math.round(archive.length / 1024)} KB to ${TEMPLATE_PATH}`);
  process.exit(0);
})().catch((error) => {
  console.error('[pglite-template] skipped:', error.message);
  process.exit(0);
});
