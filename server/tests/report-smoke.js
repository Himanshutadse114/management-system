const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { sequelize } = require('../src/config/database');
const models = require('../src/models');
const { runSalesMigration } = require('../src/migrations/sales');
const { runRestaurantMigration } = require('../src/migrations/restaurant');
const { runAnalyticsMigration } = require('../src/migrations/analytics');
const { runReportsMigration } = require('../src/migrations/reports');
const { generateReport, reportBuffer } = require('../src/services/reportService');

async function main() {
  process.env.NODE_ENV = 'test';
  process.env.STORAGE_DRIVER = 'local';
  process.env.LOCAL_STORAGE_DIR = path.join(process.cwd(), '.test-report-storage');

  await sequelize.authenticate();
  await sequelize.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await models.bootstrapModels();
  await runSalesMigration(sequelize);
  await runRestaurantMigration(sequelize);
  await runAnalyticsMigration(sequelize);
  await runReportsMigration(sequelize);

  const user = await models.User.create({
    email: 'report-smoke@example.com',
    name: 'Report Smoke User',
    status: 'ACTIVE'
  });
  const tenant = await models.Tenant.create({
    name: 'Report Smoke Business',
    slug: 'report-smoke-business',
    status: 'ACTIVE',
    createdByUserId: user.id
  });
  const branch = await models.Branch.create({
    tenantId: tenant.id,
    name: 'Report Smoke Branch',
    code: 'RPT-01',
    type: 'WINE_SHOP',
    status: 'ACTIVE'
  });

  const today = new Date().toISOString().slice(0, 10);
  const result = await generateReport({
    tenantId: tenant.id,
    branchId: branch.id,
    reportType: 'INVENTORY_VALUATION',
    format: 'XLSX',
    locale: 'en',
    from: today,
    to: today,
    createdByUserId: user.id
  });

  assert.equal(result.report.status, 'READY');
  assert.ok(Number(result.report.sizeBytes) > 0, 'report must have file bytes');
  assert.ok(['local+database', 'database', 'object'].includes(result.storageMode));

  const buffer = await reportBuffer(result.report);
  assert.ok(Buffer.isBuffer(buffer));
  assert.ok(buffer.length > 100, 'downloaded report must not be empty');

  console.log(`[report-smoke] READY ${result.report.fileName} ${buffer.length} bytes via ${result.storageMode}`);
}

main()
  .catch((error) => {
    console.error('[report-smoke] failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sequelize.close().catch(() => {});
    await fs.promises.rm(process.env.LOCAL_STORAGE_DIR || '', { recursive: true, force: true }).catch(() => {});
  });
