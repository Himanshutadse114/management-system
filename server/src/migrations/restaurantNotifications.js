const RESTAURANT_NOTIFICATIONS_MIGRATION_ID = '20260917_015_restaurant_notifications';

async function runRestaurantNotificationsMigration(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(160) PRIMARY KEY, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const [rows] = await sequelize.query('SELECT id FROM schema_migrations WHERE id = :id', { replacements: { id: RESTAURANT_NOTIFICATIONS_MIGRATION_ID } });
  if (rows.length) return;
  const transaction = await sequelize.transaction();
  try {
    await sequelize.query(`CREATE TABLE IF NOT EXISTS restaurant_notifications (
      id UUID PRIMARY KEY,
      "tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      "branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      "userId" UUID NULL REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(32) NULL,
      type VARCHAR(60) NOT NULL,
      title VARCHAR(180) NOT NULL,
      message TEXT NULL,
      "entityType" VARCHAR(80) NULL,
      "entityId" UUID NULL,
      "dedupeKey" VARCHAR(180) NULL,
      "readAt" TIMESTAMPTZ NULL,
      "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`, { transaction });
    await sequelize.query(`CREATE INDEX IF NOT EXISTS restaurant_notifications_inbox_idx ON restaurant_notifications ("tenantId", "branchId", "userId", role, "readAt", "createdAt" DESC)`, { transaction });
    await sequelize.query(`CREATE UNIQUE INDEX IF NOT EXISTS restaurant_notifications_dedupe_unique ON restaurant_notifications ("tenantId", "dedupeKey") WHERE "dedupeKey" IS NOT NULL`, { transaction });
    await sequelize.query('INSERT INTO schema_migrations (id, "appliedAt") VALUES (:id, NOW())', { replacements: { id: RESTAURANT_NOTIFICATIONS_MIGRATION_ID }, transaction });
    await transaction.commit();
    console.log(`[database] applied migration ${RESTAURANT_NOTIFICATIONS_MIGRATION_ID}`);
  } catch (error) { await transaction.rollback(); throw error; }
}

module.exports = { runRestaurantNotificationsMigration, RESTAURANT_NOTIFICATIONS_MIGRATION_ID };
