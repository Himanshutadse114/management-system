const SALES_MIGRATION_ID = '20260825_002_sales_core';

async function runSalesMigration(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(160) PRIMARY KEY,
    "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const [rows] = await sequelize.query('SELECT id FROM schema_migrations WHERE id = :id', {
    replacements: { id: SALES_MIGRATION_ID }
  });
  if (rows.length) return;

  const transaction = await sequelize.transaction();
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS orders (
        id UUID PRIMARY KEY,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        "orderNumber" VARCHAR(80) NOT NULL,
        "orderType" VARCHAR(32) NOT NULL,
        status VARCHAR(32) NOT NULL,
        "tableId" UUID NULL,
        "waiterUserId" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        "openedByUserId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "closedByUserId" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        "subtotalMinor" BIGINT NOT NULL DEFAULT 0,
        "discountMinor" BIGINT NOT NULL DEFAULT 0,
        "taxMinor" BIGINT NOT NULL DEFAULT 0,
        "totalMinor" BIGINT NOT NULL DEFAULT 0,
        "paidMinor" BIGINT NOT NULL DEFAULT 0,
        "cogsMinor" BIGINT NOT NULL DEFAULT 0,
        "grossProfitMinor" BIGINT NOT NULL DEFAULT 0,
        notes TEXT NULL,
        "idempotencyKey" VARCHAR(180) NULL,
        "acceptedAt" TIMESTAMPTZ NULL,
        "paidAt" TIMESTAMPTZ NULL,
        "cancelledAt" TIMESTAMPTZ NULL,
        "cancellationReason" TEXT NULL,
        "cancelApprovedByUserId" UUID NULL REFERENCES users(id) ON DELETE SET NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS orders_branch_number_unique ON orders ("branchId", "orderNumber")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS orders_idempotency_unique ON orders ("tenantId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS orders_branch_status_date_idx ON orders ("tenantId", "branchId", status, "createdAt" DESC)`,
      `CREATE INDEX IF NOT EXISTS orders_waiter_status_idx ON orders ("tenantId", "branchId", "waiterUserId", status)`,

      `CREATE TABLE IF NOT EXISTS order_lines (
        id UUID PRIMARY KEY,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        "orderId" UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        "productId" UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        "priceOptionId" UUID NULL REFERENCES product_price_options(id) ON DELETE SET NULL,
        "productNameSnapshot" VARCHAR(180) NOT NULL,
        "priceLabelSnapshot" VARCHAR(80) NULL,
        "quantityUnits" INTEGER NOT NULL,
        "baseQuantityPerUnit" NUMERIC(18,3) NOT NULL,
        "totalBaseQuantity" NUMERIC(18,3) NOT NULL,
        "unitPriceMinor" BIGINT NOT NULL,
        "lineSubtotalMinor" BIGINT NOT NULL,
        "costAmountMinor" BIGINT NOT NULL DEFAULT 0,
        status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS order_lines_order_idx ON order_lines ("orderId")`,
      `CREATE INDEX IF NOT EXISTS order_lines_product_idx ON order_lines ("tenantId", "branchId", "productId", "createdAt" DESC)`,

      `CREATE TABLE IF NOT EXISTS payments (
        id UUID PRIMARY KEY,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
        "orderId" UUID NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
        method VARCHAR(24) NOT NULL,
        "amountMinor" BIGINT NOT NULL,
        reference VARCHAR(180) NULL,
        "receivedByUserId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS payments_order_idx ON payments ("orderId")`,
      `CREATE INDEX IF NOT EXISTS payments_branch_date_idx ON payments ("tenantId", "branchId", "createdAt" DESC)`
    ];

    for (const statement of statements) await sequelize.query(statement, { transaction });
    await sequelize.query(
      'INSERT INTO schema_migrations (id, "appliedAt") VALUES (:id, NOW())',
      { replacements: { id: SALES_MIGRATION_ID }, transaction }
    );
    await transaction.commit();
    console.log(`[database] applied migration ${SALES_MIGRATION_ID}`);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = { runSalesMigration, SALES_MIGRATION_ID };
