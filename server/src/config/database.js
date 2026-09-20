const { Sequelize } = require('sequelize');

const dialect = String(process.env.DB_DIALECT || 'postgres').toLowerCase();
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

if (isProduction && dialect !== 'postgres') {
  throw new Error('Production requires DB_DIALECT=postgres.');
}

const sslEnabled = String(process.env.DB_SSL || '').toLowerCase() === 'true';
const databaseUrl = String(process.env.DATABASE_URL || '').trim();

const databaseOptions = {
  dialect,
  logging: false,
  dialectOptions: sslEnabled
    ? { ssl: { require: true, rejectUnauthorized: false } }
    : {}
};

// Render may provide its private PostgreSQL connection as DATABASE_URL. The
// private/internal URL is preferred when the API and database share a region.
const sequelize = databaseUrl
  ? new Sequelize(databaseUrl, databaseOptions)
  : new Sequelize(
      process.env.DB_NAME || 'management_system',
      process.env.DB_USER || 'postgres',
      process.env.DB_PASS || '',
      {
        ...databaseOptions,
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT || 5432)
      }
    );

async function connectDatabase() {
  await sequelize.authenticate();
  const models = require('../models');
  await models.bootstrapModels();
  const { runSalesMigration } = require('../migrations/sales');
  const { runRestaurantMigration } = require('../migrations/restaurant');
  const { runAnalyticsMigration } = require('../migrations/analytics');
  const { runReportsMigration } = require('../migrations/reports');
  const { runStocktakeMigration } = require('../migrations/stocktake');
  const { runOperationalShiftsMigration } = require('../migrations/operationalShifts');
  const { runSalesRefundsMigration } = require('../migrations/salesRefunds');
  const { runBranchSettingsMigration } = require('../migrations/branchSettings');
  const { runDevicesMigration } = require('../migrations/devices');
  const { runKitchenTicketsMigration } = require('../migrations/kitchenTickets');
  const { runReservationsMigration } = require('../migrations/reservations');
  const { runRestaurantEnhancementsMigration } = require('../migrations/restaurantEnhancements');
  const { runRestaurantNotificationsMigration } = require('../migrations/restaurantNotifications');
  const { runInventoryOperationsMigration } = require('../migrations/inventoryOperations');
  const { runGrowthMigration } = require('../migrations/growth');
  const { runIntegrationsMigration } = require('../migrations/integrations');
  const { runOperationsMigration } = require('../migrations/operations');
  const { runEcosystemMigration } = require('../migrations/ecosystem');
  const { runGuestPaymentsMigration } = require('../migrations/guestPayments');
  await runSalesMigration(sequelize);
  await runRestaurantMigration(sequelize);
  await runAnalyticsMigration(sequelize);
  await runReportsMigration(sequelize);
  await runStocktakeMigration(sequelize);
  await runOperationalShiftsMigration(sequelize);
  await runSalesRefundsMigration(sequelize);
  await runBranchSettingsMigration(sequelize);
  await runDevicesMigration(sequelize);
  await runKitchenTicketsMigration(sequelize);
  await runReservationsMigration(sequelize);
  await runRestaurantEnhancementsMigration(sequelize);
  await runRestaurantNotificationsMigration(sequelize);
  await runInventoryOperationsMigration(sequelize);
  await runGrowthMigration(sequelize);
  await runIntegrationsMigration(sequelize);
  await runOperationsMigration(sequelize);
  await runEcosystemMigration(sequelize);
  await runGuestPaymentsMigration(sequelize);

  const { ensureBootstrapSuperAdmin } = require('../services/credentialService');
  await ensureBootstrapSuperAdmin();

  if (String(process.env.NODE_ENV || '').toLowerCase() !== 'test') {
    const { seedDemoData } = require('../services/demoSeedService');
    await seedDemoData();
  }

  console.log('[database] PostgreSQL connected and models ready');
}

module.exports = { sequelize, connectDatabase };
