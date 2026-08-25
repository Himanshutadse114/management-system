const { QueryTypes } = require('sequelize');

const INVENTORY_CORE_ID = '20260825_001_inventory_core';

async function inventoryCoreUp(sequelize) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS product_categories (
      id UUID PRIMARY KEY,
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS product_category_tenant_name_unique ON product_categories ("tenantId", name)`,
    `CREATE INDEX IF NOT EXISTS product_categories_scope_idx ON product_categories ("tenantId", status, "sortOrder")`,

    `CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY,
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "categoryId" UUID NULL REFERENCES product_categories(id) ON DELETE SET NULL,
      sku VARCHAR(80) NULL,
      barcode VARCHAR(120) NULL,
      name VARCHAR(180) NOT NULL,
      brand VARCHAR(140) NULL,
      "productType" VARCHAR(24) NOT NULL DEFAULT 'OTHER',
      "inventoryUnit" VARCHAR(24) NOT NULL DEFAULT 'PIECE',
      "bottleVolumeMl" NUMERIC(18,3) NULL,
      "trackInventory" BOOLEAN NOT NULL DEFAULT TRUE,
      "imageObjectKey" TEXT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS product_tenant_sku_unique ON products ("tenantId", sku) WHERE sku IS NOT NULL`,
    `CREATE INDEX IF NOT EXISTS products_scope_idx ON products ("tenantId", status, name)`,
    `CREATE INDEX IF NOT EXISTS products_category_idx ON products ("tenantId", "categoryId")`,
    `CREATE INDEX IF NOT EXISTS products_barcode_idx ON products ("tenantId", barcode)`,

    `CREATE TABLE IF NOT EXISTS product_price_options (
      id UUID PRIMARY KEY,
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      label VARCHAR(80) NOT NULL,
      "quantityBaseUnits" NUMERIC(18,3) NOT NULL,
      "priceMinor" BIGINT NOT NULL,
      active BOOLEAN NOT NULL DEFAULT TRUE,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS price_option_branch_product_label_unique ON product_price_options ("branchId", "productId", label)`,
    `CREATE INDEX IF NOT EXISTS price_options_scope_idx ON product_price_options ("tenantId", "branchId", "productId", active)`,

    `CREATE TABLE IF NOT EXISTS suppliers (
      id UUID PRIMARY KEY,
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(180) NOT NULL,
      phone VARCHAR(40) NULL,
      email VARCHAR(320) NULL,
      gstin VARCHAR(40) NULL,
      address TEXT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS suppliers_scope_idx ON suppliers ("tenantId", status, name)`,
    `CREATE INDEX IF NOT EXISTS suppliers_gstin_idx ON suppliers ("tenantId", gstin)`,

    `CREATE TABLE IF NOT EXISTS purchases (
      id UUID PRIMARY KEY,
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
      "supplierId" UUID NULL REFERENCES suppliers(id) ON DELETE SET NULL,
      "invoiceNumber" VARCHAR(120) NULL,
      "purchaseDate" DATE NOT NULL,
      status VARCHAR(24) NOT NULL DEFAULT 'POSTED',
      "totalMinor" BIGINT NOT NULL DEFAULT 0,
      notes TEXT NULL,
      "idempotencyKey" VARCHAR(180) NULL,
      "createdByUserId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS purchases_branch_date_idx ON purchases ("tenantId", "branchId", "purchaseDate")`,
    `CREATE INDEX IF NOT EXISTS purchases_supplier_date_idx ON purchases ("tenantId", "supplierId", "purchaseDate")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS purchases_idempotency_unique ON purchases ("tenantId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,

    `CREATE TABLE IF NOT EXISTS purchase_lines (
      id UUID PRIMARY KEY,
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
      "purchaseId" UUID NOT NULL REFERENCES purchases(id) ON DELETE RESTRICT,
      "productId" UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      "productNameSnapshot" VARCHAR(180) NOT NULL,
      "skuSnapshot" VARCHAR(80) NULL,
      "packageCount" NUMERIC(18,3) NOT NULL,
      "packageSizeBaseUnits" NUMERIC(18,3) NOT NULL,
      "totalBaseUnits" NUMERIC(18,3) NOT NULL,
      "lineTotalMinor" BIGINT NOT NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS purchase_lines_purchase_idx ON purchase_lines ("purchaseId")`,
    `CREATE INDEX IF NOT EXISTS purchase_lines_product_idx ON purchase_lines ("tenantId", "branchId", "productId")`,

    `CREATE TABLE IF NOT EXISTS inventory_balances (
      id UUID PRIMARY KEY,
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      "quantityBase" NUMERIC(18,3) NOT NULL DEFAULT 0,
      "inventoryValueMinor" BIGINT NOT NULL DEFAULT 0,
      "weightedAverageCostMinorPerUnit" NUMERIC(24,8) NOT NULL DEFAULT 0,
      version INTEGER NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS inventory_balance_scope_unique ON inventory_balances ("tenantId", "branchId", "productId")`,
    `CREATE INDEX IF NOT EXISTS inventory_balances_branch_idx ON inventory_balances ("tenantId", "branchId")`,

    `CREATE TABLE IF NOT EXISTS inventory_movements (
      id UUID PRIMARY KEY,
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
      "productId" UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
      "movementType" VARCHAR(32) NOT NULL,
      "quantityDeltaBase" NUMERIC(18,3) NOT NULL,
      "unitCostMinorPerUnit" NUMERIC(24,8) NOT NULL DEFAULT 0,
      "costAmountMinor" BIGINT NOT NULL DEFAULT 0,
      "stockAfterBase" NUMERIC(18,3) NOT NULL,
      "inventoryValueAfterMinor" BIGINT NOT NULL,
      "referenceType" VARCHAR(60) NULL,
      "referenceId" VARCHAR(100) NULL,
      reason TEXT NULL,
      "idempotencyKey" VARCHAR(180) NULL,
      "actorUserId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`,
    `CREATE INDEX IF NOT EXISTS inventory_movements_product_date_idx ON inventory_movements ("tenantId", "branchId", "productId", "createdAt" DESC)`,
    `CREATE INDEX IF NOT EXISTS inventory_movements_type_date_idx ON inventory_movements ("tenantId", "branchId", "movementType", "createdAt" DESC)`,
    `CREATE UNIQUE INDEX IF NOT EXISTS inventory_movements_idempotency_unique ON inventory_movements ("tenantId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`
  ];

  for (const statement of statements) {
    await sequelize.query(statement);
  }
}

const migrations = [
  { id: INVENTORY_CORE_ID, up: inventoryCoreUp }
];

async function runMigrations(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(160) PRIMARY KEY,
    "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const appliedRows = await sequelize.query(
    'SELECT id FROM schema_migrations ORDER BY id ASC',
    { type: QueryTypes.SELECT }
  );
  const applied = new Set(appliedRows.map((row) => row.id));

  for (const migration of migrations) {
    if (applied.has(migration.id)) continue;
    const transaction = await sequelize.transaction();
    try {
      await migration.up(sequelize, transaction);
      await sequelize.query(
        'INSERT INTO schema_migrations (id, "appliedAt") VALUES (:id, NOW())',
        { replacements: { id: migration.id }, transaction }
      );
      await transaction.commit();
      console.log(`[database] applied migration ${migration.id}`);
    } catch (error) {
      await transaction.rollback();
      throw error;
    }
  }
}

module.exports = { runMigrations, migrations };
