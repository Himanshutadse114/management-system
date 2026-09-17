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
  dietaryTags: { type: DataTypes.JSONB, allowNull: true },
  modifierGroups: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] },
  comboItems: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }
}, { tableName: 'menu_items' });

const RecipeComponent = sequelize.models.RecipeComponent || sequelize.define('RecipeComponent', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  outputProductId: { type: DataTypes.UUID, allowNull: false },
  priceOptionId: { type: DataTypes.UUID, allowNull: true },
  ingredientProductId: { type: DataTypes.UUID, allowNull: false },
  quantityBasePerUnit: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
  wastePercent: { type: DataTypes.DECIMAL(8, 3), allowNull: false, defaultValue: 0 },
  active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
}, { tableName: 'recipe_components' });

const KitchenTicket = sequelize.models.KitchenTicket || sequelize.define('KitchenTicket', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, tenantId: { type: DataTypes.UUID, allowNull: false }, branchId: { type: DataTypes.UUID, allowNull: false }, orderId: { type: DataTypes.UUID, allowNull: false }, ticketNumber: { type: DataTypes.STRING(80), allowNull: false }, station: { type: DataTypes.STRING(80), allowNull: false }, roundNumber: { type: DataTypes.INTEGER, allowNull: false }, status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'NEW' }, firedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW }, startedAt: { type: DataTypes.DATE, allowNull: true }, readyAt: { type: DataTypes.DATE, allowNull: true }, completedAt: { type: DataTypes.DATE, allowNull: true }, updatedByUserId: { type: DataTypes.UUID, allowNull: true }
}, { tableName: 'kitchen_tickets' });

const KitchenTicketLine = sequelize.models.KitchenTicketLine || sequelize.define('KitchenTicketLine', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, tenantId: { type: DataTypes.UUID, allowNull: false }, branchId: { type: DataTypes.UUID, allowNull: false }, ticketId: { type: DataTypes.UUID, allowNull: false }, orderLineId: { type: DataTypes.UUID, allowNull: false }, itemNameSnapshot: { type: DataTypes.STRING(180), allowNull: false }, quantityUnits: { type: DataTypes.INTEGER, allowNull: false }, modifiersSnapshot: { type: DataTypes.JSONB, allowNull: false, defaultValue: [] }, notes: { type: DataTypes.TEXT, allowNull: true }
}, { tableName: 'kitchen_ticket_lines' });

const Reservation = sequelize.models.Reservation || sequelize.define('Reservation', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true }, tenantId: { type: DataTypes.UUID, allowNull: false }, branchId: { type: DataTypes.UUID, allowNull: false }, tableId: { type: DataTypes.UUID, allowNull: true }, guestName: { type: DataTypes.STRING(160), allowNull: false }, phone: { type: DataTypes.STRING(40), allowNull: false }, email: { type: DataTypes.STRING(320), allowNull: true }, partySize: { type: DataTypes.INTEGER, allowNull: false }, startsAt: { type: DataTypes.DATE, allowNull: false }, durationMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 90 }, status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'BOOKED' }, depositMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 }, depositReference: { type: DataTypes.STRING(180), allowNull: true }, notes: { type: DataTypes.TEXT, allowNull: true }, consentToContact: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, createdByUserId: { type: DataTypes.UUID, allowNull: false }
}, { tableName: 'reservations' });

const RestaurantNotification = sequelize.models.RestaurantNotification || sequelize.define('RestaurantNotification', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  userId: { type: DataTypes.UUID, allowNull: true },
  role: { type: DataTypes.STRING(32), allowNull: true },
  type: { type: DataTypes.STRING(60), allowNull: false },
  title: { type: DataTypes.STRING(180), allowNull: false },
  message: { type: DataTypes.TEXT, allowNull: true },
  entityType: { type: DataTypes.STRING(80), allowNull: true },
  entityId: { type: DataTypes.UUID, allowNull: true },
  dedupeKey: { type: DataTypes.STRING(180), allowNull: true },
  readAt: { type: DataTypes.DATE, allowNull: true }
}, { tableName: 'restaurant_notifications' });

KitchenTicket.hasMany(KitchenTicketLine, { foreignKey: 'ticketId', as: 'lines' });
KitchenTicketLine.belongsTo(KitchenTicket, { foreignKey: 'ticketId', as: 'ticket' });

module.exports = { RestaurantTable, MenuItem, RecipeComponent, KitchenTicket, KitchenTicketLine, Reservation, RestaurantNotification };
