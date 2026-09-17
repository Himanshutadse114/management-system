const SALES_REFUNDS_MIGRATION_ID = '20260917_009_sales_refunds';

async function runSalesRefundsMigration(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(160) PRIMARY KEY, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const [rows] = await sequelize.query('SELECT id FROM schema_migrations WHERE id = :id', { replacements: { id: SALES_REFUNDS_MIGRATION_ID } });
  if (rows.length) return;
  const transaction = await sequelize.transaction();
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS sales_refunds (
        id UUID PRIMARY KEY,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        "orderId" UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        "amountMinor" BIGINT NOT NULL,
        method VARCHAR(24) NOT NULL,
        "stockDisposition" VARCHAR(24) NOT NULL,
        reason TEXT NOT NULL,
        "processedByUserId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "cashierUserId" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        "idempotencyKey" VARCHAR(180) NULL,
        "processedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS sales_refunds_one_per_order ON sales_refunds ("orderId")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS sales_refunds_idempotency_unique ON sales_refunds ("tenantId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS sales_refunds_branch_date_idx ON sales_refunds ("tenantId", "branchId", "processedAt" DESC)`
    ];
    for (const statement of statements) await sequelize.query(statement, { transaction });
    await sequelize.query('INSERT INTO schema_migrations (id, "appliedAt") VALUES (:id, NOW())', { replacements: { id: SALES_REFUNDS_MIGRATION_ID }, transaction });
    await transaction.commit();
    console.log(`[database] applied migration ${SALES_REFUNDS_MIGRATION_ID}`);
  } catch (error) { await transaction.rollback(); throw error; }
}

module.exports = { runSalesRefundsMigration, SALES_REFUNDS_MIGRATION_ID };
