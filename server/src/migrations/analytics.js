const ANALYTICS_MIGRATION_ID = '20260825_004_analytics_finance';

async function runAnalyticsMigration(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(160) PRIMARY KEY,
    "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const [rows] = await sequelize.query('SELECT id FROM schema_migrations WHERE id = :id', {
    replacements: { id: ANALYTICS_MIGRATION_ID }
  });
  if (rows.length) return;

  const transaction = await sequelize.transaction();
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS branch_expenses (
        id UUID PRIMARY KEY,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        "expenseDate" DATE NOT NULL,
        category VARCHAR(100) NOT NULL,
        description TEXT NULL,
        "amountMinor" BIGINT NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'POSTED',
        "createdByUserId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS branch_expenses_scope_date_idx ON branch_expenses ("tenantId", "branchId", "expenseDate" DESC)`,
      `CREATE INDEX IF NOT EXISTS branch_expenses_tenant_date_idx ON branch_expenses ("tenantId", "expenseDate" DESC)`,
      `CREATE INDEX IF NOT EXISTS branch_expenses_category_idx ON branch_expenses ("tenantId", category, "expenseDate" DESC)`
    ];

    for (const statement of statements) await sequelize.query(statement, { transaction });
    await sequelize.query(
      'INSERT INTO schema_migrations (id, "appliedAt") VALUES (:id, NOW())',
      { replacements: { id: ANALYTICS_MIGRATION_ID }, transaction }
    );
    await transaction.commit();
    console.log(`[database] applied migration ${ANALYTICS_MIGRATION_ID}`);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = { runAnalyticsMigration, ANALYTICS_MIGRATION_ID };
