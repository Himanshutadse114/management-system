const DEVICES_MIGRATION_ID = '20260917_011_devices_print_jobs';
async function runDevicesMigration(sequelize) {
  await sequelize.query(`CREATE TABLE IF NOT EXISTS schema_migrations (id VARCHAR(160) PRIMARY KEY, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`);
  const [rows] = await sequelize.query('SELECT id FROM schema_migrations WHERE id = :id', { replacements: { id: DEVICES_MIGRATION_ID } }); if (rows.length) return;
  const transaction = await sequelize.transaction();
  try {
    const statements = [
      `CREATE TABLE IF NOT EXISTS devices (id UUID PRIMARY KEY,"tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,"branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,name VARCHAR(160) NOT NULL,"deviceType" VARCHAR(32) NOT NULL,"connectionType" VARCHAR(24) NOT NULL,endpoint VARCHAR(500) NULL,station VARCHAR(120) NULL,status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',"lastSeenAt" TIMESTAMPTZ NULL,capabilities JSONB NOT NULL DEFAULT '{}'::jsonb,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE UNIQUE INDEX IF NOT EXISTS devices_branch_name_unique ON devices ("branchId", name)`,
      `CREATE INDEX IF NOT EXISTS devices_scope_idx ON devices ("tenantId", "branchId", status)`,
      `CREATE TABLE IF NOT EXISTS print_jobs (id UUID PRIMARY KEY,"tenantId" UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,"branchId" UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,"deviceId" UUID NOT NULL REFERENCES devices(id) ON DELETE RESTRICT,"jobType" VARCHAR(32) NOT NULL,status VARCHAR(24) NOT NULL DEFAULT 'PENDING',payload JSONB NOT NULL,attempts INTEGER NOT NULL DEFAULT 0,"errorMessage" TEXT NULL,"idempotencyKey" VARCHAR(180) NULL,"createdByUserId" UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,"acknowledgedAt" TIMESTAMPTZ NULL,"createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),"updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW())`,
      `CREATE UNIQUE INDEX IF NOT EXISTS print_jobs_idempotency_unique ON print_jobs ("tenantId", "idempotencyKey") WHERE "idempotencyKey" IS NOT NULL`,
      `CREATE INDEX IF NOT EXISTS print_jobs_queue_idx ON print_jobs ("tenantId", "branchId", status, "createdAt")`
    ];
    for (const statement of statements) await sequelize.query(statement,{transaction});
    await sequelize.query('INSERT INTO schema_migrations (id,"appliedAt") VALUES (:id,NOW())',{replacements:{id:DEVICES_MIGRATION_ID},transaction}); await transaction.commit(); console.log(`[database] applied migration ${DEVICES_MIGRATION_ID}`);
  } catch(error){await transaction.rollback();throw error;}
}
module.exports={runDevicesMigration,DEVICES_MIGRATION_ID};
