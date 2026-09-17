const STOCKTAKE_MIGRATION_ID = '20260917_007_stocktakes';

async function runStocktakeMigration(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(160) PRIMARY KEY,
    "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const [rows] = await sequelize.query('SELECT id FROM schema_migrations WHERE id = :id', {
    replacements: { id: STOCKTAKE_MIGRATION_ID }
  });
  if (rows.length) return;

  const transaction = await sequelize.transaction();
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS stocktakes (
        id UUID PRIMARY KEY,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        name VARCHAR(180) NOT NULL,
        status VARCHAR(24) NOT NULL DEFAULT 'COUNTING',
        notes TEXT NULL,
        "createdByUserId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "submittedByUserId" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        "approvedByUserId" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        "submittedAt" TIMESTAMPTZ NULL,
        "postedAt" TIMESTAMPTZ NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS stocktakes_branch_date_idx ON stocktakes ("tenantId", "branchId", "createdAt" DESC)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS stocktakes_one_open_per_branch ON stocktakes ("branchId") WHERE status IN ('COUNTING','SUBMITTED')`,
      `CREATE TABLE IF NOT EXISTS stocktake_lines (
        id UUID PRIMARY KEY,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        "stocktakeId" UUID NOT NULL REFERENCES stocktakes(id) ON DELETE CASCADE,
        "productId" UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        "expectedQuantityBase" NUMERIC(18,3) NOT NULL,
        "expectedBalanceVersion" INTEGER NOT NULL DEFAULT 0,
        "countedQuantityBase" NUMERIC(18,3) NULL,
        "varianceQuantityBase" NUMERIC(18,3) NULL,
        "varianceCostMinor" BIGINT NULL,
        note TEXT NULL,
        "movementId" UUID NULL REFERENCES inventory_movements(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS stocktake_line_product_unique ON stocktake_lines ("stocktakeId", "productId")`,
      `CREATE INDEX IF NOT EXISTS stocktake_lines_scope_idx ON stocktake_lines ("tenantId", "branchId", "stocktakeId")`
    ];
    for (const statement of statements) await sequelize.query(statement, { transaction });
    await sequelize.query('INSERT INTO schema_migrations (id, "appliedAt") VALUES (:id, NOW())', {
      replacements: { id: STOCKTAKE_MIGRATION_ID },
      transaction
    });
    await transaction.commit();
    console.log(`[database] applied migration ${STOCKTAKE_MIGRATION_ID}`);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = { runStocktakeMigration, STOCKTAKE_MIGRATION_ID };
