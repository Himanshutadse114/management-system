const REPORTS_MIGRATION_ID = '20260825_005_generated_reports';
const REPORTS_DB_FALLBACK_ID = '20260827_006_generated_reports_db_fallback';

async function ensureMigrationTable(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(160) PRIMARY KEY,
    "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
}

async function isApplied(sequelize, id) {
  const [rows] = await sequelize.query('SELECT id FROM schema_migrations WHERE id = :id', {
    replacements: { id }
  });
  return rows.length > 0;
}

async function applyStatements(sequelize, id, statements) {
  if (await isApplied(sequelize, id)) return;
  const transaction = await sequelize.transaction();
  try {
    for (const statement of statements) await sequelize.query(statement, { transaction });
    await sequelize.query(
      'INSERT INTO schema_migrations (id, "appliedAt") VALUES (:id, NOW())',
      { replacements: { id }, transaction }
    );
    await transaction.commit();
    console.log(`[database] applied migration ${id}`);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

async function runReportsMigration(sequelize) {
  await ensureMigrationTable(sequelize);

  await applyStatements(sequelize, REPORTS_MIGRATION_ID, [
    `CREATE TABLE IF NOT EXISTS generated_reports (
      id UUID PRIMARY KEY,
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "branchId" UUID NULL REFERENCES branches(id) ON DELETE SET NULL,
      "reportType" VARCHAR(60) NOT NULL,
      format VARCHAR(12) NOT NULL,
      locale VARCHAR(8) NOT NULL DEFAULT 'en',
      "rangeFrom" DATE NULL,
      "rangeTo" DATE NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'GENERATING',
      "objectKey" TEXT NULL,
      "fileName" VARCHAR(240) NULL,
      "contentType" VARCHAR(120) NULL,
      "sizeBytes" BIGINT NULL,
      "errorMessage" TEXT NULL,
      "createdByUserId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      "completedAt" TIMESTAMPTZ NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS generated_reports_tenant_date_idx ON generated_reports ("tenantId", "createdAt" DESC)`,
    `CREATE INDEX IF NOT EXISTS generated_reports_branch_date_idx ON generated_reports ("tenantId", "branchId", "createdAt" DESC)`,
    `CREATE INDEX IF NOT EXISTS generated_reports_status_idx ON generated_reports (status, "createdAt" DESC)`
  ]);

  await applyStatements(sequelize, REPORTS_DB_FALLBACK_ID, [
    `ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS "fileData" BYTEA NULL`,
    `ALTER TABLE generated_reports ADD COLUMN IF NOT EXISTS "storageMode" VARCHAR(24) NULL`
  ]);
}

module.exports = {
  runReportsMigration,
  REPORTS_MIGRATION_ID,
  REPORTS_DB_FALLBACK_ID
};
