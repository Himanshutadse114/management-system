const INVENTORY_OPERATIONS_MIGRATION_ID = '20260917_016_inventory_operations';
async function runInventoryOperationsMigration(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(160) PRIMARY KEY, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const [rows] = await sequelize.query('SELECT id FROM schema_migrations WHERE id=:id', { replacements: { id: INVENTORY_OPERATIONS_MIGRATION_ID } });
  if (rows.length) return;
  const transaction = await sequelize.transaction();
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS inventory_batches (id UUID PRIMARY KEY,"tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,"branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,"productId" UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,"supplierId" UUID NULL REFERENCES suppliers(id) ON DELETE SET NULL,"purchaseId" UUID NULL REFERENCES purchases(id) ON DELETE SET NULL,"purchaseLineId" UUID NULL REFERENCES purchase_lines(id) ON DELETE SET NULL,"batchNumber" VARCHAR(120) NOT NULL,"manufacturedAt" DATE NULL,"expiresAt" DATE NULL,"mrpMinor" BIGINT NULL,"packageLabel" VARCHAR(80) NULL,"packageSizeBaseUnits" NUMERIC(18,3) NOT NULL,"quantityReceivedBase" NUMERIC(18,3) NOT NULL,"quantityCurrentBase" NUMERIC(18,3) NOT NULL,status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE UNIQUE INDEX IF NOT EXISTS inventory_batch_scope_unique ON inventory_batches ("branchId","productId","batchNumber")`,
      `CREATE INDEX IF NOT EXISTS inventory_batch_expiry_idx ON inventory_batches ("tenantId","branchId","expiresAt",status)`,
      `CREATE TABLE IF NOT EXISTS stock_transfers (id UUID PRIMARY KEY,"tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,"sourceBranchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,"destinationBranchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,"transferNumber" VARCHAR(80) NOT NULL,status VARCHAR(24) NOT NULL DEFAULT 'IN_TRANSIT',reason TEXT NOT NULL,"idempotencyKey" VARCHAR(180) NULL,"dispatchedByUserId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,"receivedByUserId" UUID NULL REFERENCES users(id) ON DELETE RESTRICT,"dispatchedAt" TIMESTAMPTZ NOT NULL,"receivedAt" TIMESTAMPTZ NULL,"cancelledAt" TIMESTAMPTZ NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE UNIQUE INDEX IF NOT EXISTS stock_transfer_number_unique ON stock_transfers ("tenantId","transferNumber")`,
      `CREATE UNIQUE INDEX IF NOT EXISTS stock_transfer_idempotency_unique ON stock_transfers ("tenantId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS stock_transfer_branch_status_idx ON stock_transfers ("tenantId","sourceBranchId","destinationBranchId",status)`,
      `CREATE TABLE IF NOT EXISTS stock_transfer_lines (id UUID PRIMARY KEY,"tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,"transferId" UUID NOT NULL REFERENCES stock_transfers(id) ON DELETE CASCADE,"productId" UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,"quantityBase" NUMERIC(18,3) NOT NULL,"costAmountMinor" BIGINT NOT NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE TABLE IF NOT EXISTS supplier_returns (id UUID PRIMARY KEY,"tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,"branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,"supplierId" UUID NOT NULL REFERENCES suppliers(id) ON DELETE RESTRICT,"productId" UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,"batchId" UUID NULL REFERENCES inventory_batches(id) ON DELETE SET NULL,"returnNumber" VARCHAR(80) NOT NULL,"quantityBase" NUMERIC(18,3) NOT NULL,"creditMinor" BIGINT NOT NULL,reason TEXT NOT NULL,"idempotencyKey" VARCHAR(180) NULL,"createdByUserId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE UNIQUE INDEX IF NOT EXISTS supplier_return_idempotency_unique ON supplier_returns ("tenantId","idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`
    ];
    for (const statement of statements) await sequelize.query(statement, { transaction });
    await sequelize.query('INSERT INTO schema_migrations (id,"appliedAt") VALUES (:id,NOW())', { replacements: { id: INVENTORY_OPERATIONS_MIGRATION_ID }, transaction });
    await transaction.commit();
    console.log(`[database] applied migration ${INVENTORY_OPERATIONS_MIGRATION_ID}`);
  } catch (error) { await transaction.rollback(); throw error; }
}
module.exports = { runInventoryOperationsMigration, INVENTORY_OPERATIONS_MIGRATION_ID };
