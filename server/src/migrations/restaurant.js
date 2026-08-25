const RESTAURANT_MIGRATION_ID = '20260825_003_restaurant_core';

async function runRestaurantMigration(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(160) PRIMARY KEY,
    "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);

  const [rows] = await sequelize.query('SELECT id FROM schema_migrations WHERE id = :id', {
    replacements: { id: RESTAURANT_MIGRATION_ID }
  });
  if (rows.length) return;

  const transaction = await sequelize.transaction();
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS restaurant_tables (
        id UUID PRIMARY KEY,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(40) NOT NULL,
        seats INTEGER NOT NULL DEFAULT 4,
        status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
        "qrToken" VARCHAR(80) NOT NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS restaurant_table_branch_code_unique ON restaurant_tables ("branchId", code)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS restaurant_table_qr_token_unique ON restaurant_tables ("qrToken")`,
      `CREATE INDEX IF NOT EXISTS restaurant_tables_branch_idx ON restaurant_tables ("tenantId", "branchId", status)`,

      `CREATE TABLE IF NOT EXISTS menu_items (
        id UUID PRIMARY KEY,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        "productId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        "displayName" VARCHAR(180) NOT NULL,
        description TEXT NULL,
        "sectionName" VARCHAR(100) NOT NULL DEFAULT 'Menu',
        "sortOrder" INTEGER NOT NULL DEFAULT 0,
        featured BOOLEAN NOT NULL DEFAULT FALSE,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        "dietaryTags" JSONB NULL,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE UNIQUE INDEX IF NOT EXISTS menu_item_branch_product_unique ON menu_items ("branchId", "productId")`,
      `CREATE INDEX IF NOT EXISTS menu_items_branch_sort_idx ON menu_items ("tenantId", "branchId", active, "sectionName", "sortOrder")`
    ];

    for (const statement of statements) await sequelize.query(statement, { transaction });
    await sequelize.query(
      'INSERT INTO schema_migrations (id, "appliedAt") VALUES (:id, NOW())',
      { replacements: { id: RESTAURANT_MIGRATION_ID }, transaction }
    );
    await transaction.commit();
    console.log(`[database] applied migration ${RESTAURANT_MIGRATION_ID}`);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = { runRestaurantMigration, RESTAURANT_MIGRATION_ID };
