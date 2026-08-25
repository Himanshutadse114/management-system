const { Sequelize } = require('sequelize');

const dialect = String(process.env.DB_DIALECT || 'postgres').toLowerCase();
const isProduction = String(process.env.NODE_ENV || '').toLowerCase() === 'production';

if (isProduction && dialect !== 'postgres') {
  throw new Error('Production requires DB_DIALECT=postgres.');
}

const sslEnabled = String(process.env.DB_SSL || '').toLowerCase() === 'true';

const sequelize = new Sequelize(
  process.env.DB_NAME || 'management_system',
  process.env.DB_USER || 'postgres',
  process.env.DB_PASS || '',
  {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    dialect,
    logging: false,
    dialectOptions: sslEnabled
      ? { ssl: { require: true, rejectUnauthorized: false } }
      : {}
  }
);

async function connectDatabase() {
  await sequelize.authenticate();
  const models = require('../models');
  await models.bootstrapModels();
  const { runSalesMigration } = require('../migrations/sales');
  const { runRestaurantMigration } = require('../migrations/restaurant');
  const { runAnalyticsMigration } = require('../migrations/analytics');
  await runSalesMigration(sequelize);
  await runRestaurantMigration(sequelize);
  await runAnalyticsMigration(sequelize);
  console.log('[database] PostgreSQL connected and models ready');
}

module.exports = { sequelize, connectDatabase };
