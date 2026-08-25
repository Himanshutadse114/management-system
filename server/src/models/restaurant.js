const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const RestaurantTable = sequelize.models.RestaurantTable || sequelize.define('RestaurantTable', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(100), allowNull: false },
  code: { type: DataTypes.STRING(40), allowNull: false },
  seats: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'ACTIVE' },
  qrToken: { type: DataTypes.STRING(80), allowNull: false }
}, { tableName: 'restaurant_tables' });

const MenuItem = sequelize.models.MenuItem || sequelize.define('MenuItem', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  productId: { type: DataTypes.UUID, allowNull: false },
  displayName: { type: DataTypes.STRING(180), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: true },
  sectionName: { type: DataTypes.STRING(100), allowNull: false, defaultValue: 'Menu' },
  sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  featured: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  dietaryTags: { type: DataTypes.JSONB, allowNull: true }
}, { tableName: 'menu_items' });

module.exports = { RestaurantTable, MenuItem };
