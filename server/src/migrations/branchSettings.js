const BRANCH_SETTINGS_MIGRATION_ID = '20260917_010_branch_settings';

async function runBranchSettingsMigration(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(160) PRIMARY KEY, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const [rows] = await sequelize.query('SELECT id FROM schema_migrations WHERE id = :id', { replacements: { id: BRANCH_SETTINGS_MIGRATION_ID } });
  if (rows.length) return;
  const transaction = await sequelize.transaction();
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS branch_settings (
        id UUID PRIMARY KEY,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        "legalName" VARCHAR(200) NULL,
        gstin VARCHAR(15) NULL,
        "fssaiNumber" VARCHAR(32) NULL,
        "stateCode" VARCHAR(2) NULL,
        "invoicePrefix" VARCHAR(24) NOT NULL DEFAULT 'INV',
        "receiptFooter" TEXT NULL,
        "defaultTaxRateBps" INTEGER NOT NULL DEFAULT 0,
        "serviceChargeRateBps" INTEGER NOT NULL DEFAULT 0,
        "allowedPaymentMethods" JSONB NOT NULL DEFAULT '["CASH","CARD","UPI"]'::jsonb,
        "opensAt" VARCHAR(5) NULL,
        "closesAt" VARCHAR(5) NULL,
        "businessDayCloseAt" VARCHAR(5) NOT NULL DEFAULT '04:00',
        "requireShiftForBilling" BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS branch_settings_branch_unique ON branch_settings ("branchId")`,
      `CREATE INDEX IF NOT EXISTS branch_settings_tenant_idx ON branch_settings ("tenantId", "branchId")`
    ];
    for (const statement of statements) await sequelize.query(statement, { transaction });
    await sequelize.query('INSERT INTO schema_migrations (id, "appliedAt") VALUES (:id, NOW())', { replacements: { id: BRANCH_SETTINGS_MIGRATION_ID }, transaction });
    await transaction.commit();
    console.log(`[database] applied migration ${BRANCH_SETTINGS_MIGRATION_ID}`);
  } catch (error) { await transaction.rollback(); throw error; }
}

module.exports = { runBranchSettingsMigration, BRANCH_SETTINGS_MIGRATION_ID };
