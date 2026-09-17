const RESTAURANT_ENHANCEMENTS_MIGRATION_ID = '20260917_014_restaurant_enhancements';

async function runRestaurantEnhancementsMigration(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id VARCHAR(160) PRIMARY KEY,
    "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`);
  const [rows] = await sequelize.query('SELECT id FROM schema_migrations WHERE id = :id', { replacements: { id: RESTAURANT_ENHANCEMENTS_MIGRATION_ID } });
  if (rows.length) return;
  const transaction = await sequelize.transaction();
  try {
    const statements = [
      `ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS "modifierGroups" JSONB NOT NULL DEFAULT '[]'::jsonb`,
      `ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS "comboItems" JSONB NOT NULL DEFAULT '[]'::jsonb`,
      `ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS "modifierTotalMinor" BIGINT NOT NULL DEFAULT 0`,
      `ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS "modifiersSnapshot" JSONB NOT NULL DEFAULT '[]'::jsonb`,
      `ALTER TABLE order_lines ADD COLUMN IF NOT EXISTS notes TEXT NULL`,
      `CREATE TABLE IF NOT EXISTS recipe_components (
        id UUID PRIMARY KEY,
        "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
        "outputProductId" UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
        "priceOptionId" UUID NULL REFERENCES product_price_options(id) ON DELETE CASCADE,
        "ingredientProductId" UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
        "quantityBasePerUnit" NUMERIC(18,3) NOT NULL,
        "wastePercent" NUMERIC(8,3) NOT NULL DEFAULT 0,
        active BOOLEAN NOT NULL DEFAULT TRUE,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`,
      `CREATE INDEX IF NOT EXISTS recipe_components_output_idx ON recipe_components ("tenantId", "branchId", "outputProductId", active)`,
      `CREATE UNIQUE INDEX IF NOT EXISTS recipe_component_unique ON recipe_components ("branchId", "outputProductId", COALESCE("priceOptionId", '00000000-0000-0000-0000-000000000000'::uuid), "ingredientProductId")`
    ];
    for (const statement of statements) await sequelize.query(statement, { transaction });
    await sequelize.query('INSERT INTO schema_migrations (id, "appliedAt") VALUES (:id, NOW())', { replacements: { id: RESTAURANT_ENHANCEMENTS_MIGRATION_ID }, transaction });
    await transaction.commit();
    console.log(`[database] applied migration ${RESTAURANT_ENHANCEMENTS_MIGRATION_ID}`);
  } catch (error) {
    await transaction.rollback();
    throw error;
  }
}

module.exports = { runRestaurantEnhancementsMigration, RESTAURANT_ENHANCEMENTS_MIGRATION_ID };
