const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const ORDER_TYPES = ['COUNTER', 'WINE_SHOP', 'RESTAURANT'];
const ORDER_STATUSES = ['DRAFT', 'OPEN', 'SERVED', 'AWAITING_PAYMENT', 'PAID', 'CANCELLED', 'VOIDED'];
const PAYMENT_METHODS = ['CASH', 'CARD', 'UPI', 'OTHER'];

const Order = sequelize.models.Order || sequelize.define('Order', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  orderNumber: { type: DataTypes.STRING(80), allowNull: false },
  orderType: { type: DataTypes.STRING(32), allowNull: false },
  status: { type: DataTypes.STRING(32), allowNull: false },
  tableId: { type: DataTypes.UUID, allowNull: true },
  waiterUserId: { type: DataTypes.UUID, allowNull: true },
  openedByUserId: { type: DataTypes.UUID, allowNull: false },
  closedByUserId: { type: DataTypes.UUID, allowNull: true },
  subtotalMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  discountMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  taxMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  totalMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  paidMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  cogsMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  grossProfitMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  notes: { type: DataTypes.TEXT, allowNull: true },
  idempotencyKey: { type: DataTypes.STRING(180), allowNull: true },
  acceptedAt: { type: DataTypes.DATE, allowNull: true },
  paidAt: { type: DataTypes.DATE, allowNull: true },
  cancelledAt: { type: DataTypes.DATE, allowNull: true },
  cancellationReason: { type: DataTypes.TEXT, allowNull: true },
  cancelApprovedByUserId: { type: DataTypes.UUID, allowNull: true }
}, {
  tableName: 'orders',
  indexes: [
    { unique: true, fields: ['branchId', 'orderNumber'], name: 'orders_branch_number_unique' },
    { fields: ['tenantId', 'branchId', 'status', 'createdAt'] }
  ]
});

const OrderLine = sequelize.models.OrderLine || sequelize.define('OrderLine', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  orderId: { type: DataTypes.UUID, allowNull: false },
  productId: { type: DataTypes.UUID, allowNull: false },
  priceOptionId: { type: DataTypes.UUID, allowNull: true },
  productNameSnapshot: { type: DataTypes.STRING(180), allowNull: false },
  priceLabelSnapshot: { type: DataTypes.STRING(80), allowNull: true },
  quantityUnits: { type: DataTypes.INTEGER, allowNull: false },
  baseQuantityPerUnit: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
  totalBaseQuantity: { type: DataTypes.DECIMAL(18, 3), allowNull: false },
  unitPriceMinor: { type: DataTypes.BIGINT, allowNull: false },
  lineSubtotalMinor: { type: DataTypes.BIGINT, allowNull: false },
  costAmountMinor: { type: DataTypes.BIGINT, allowNull: false, defaultValue: 0 },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'ACTIVE' }
}, { tableName: 'order_lines' });

const Payment = sequelize.models.Payment || sequelize.define('Payment', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  orderId: { type: DataTypes.UUID, allowNull: false },
  method: { type: DataTypes.STRING(24), allowNull: false },
  amountMinor: { type: DataTypes.BIGINT, allowNull: false },
  reference: { type: DataTypes.STRING(180), allowNull: true },
  receivedByUserId: { type: DataTypes.UUID, allowNull: false }
}, { tableName: 'payments' });

Order.hasMany(OrderLine, { foreignKey: 'orderId', as: 'lines' });
OrderLine.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });
Order.hasMany(Payment, { foreignKey: 'orderId', as: 'payments' });
Payment.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

function assertAllowed(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
}
Order.beforeValidate((order) => {
  assertAllowed(order.orderType, ORDER_TYPES, 'Order type');
  assertAllowed(order.status, ORDER_STATUSES, 'Order status');
});
Payment.beforeValidate((payment) => assertAllowed(payment.method, PAYMENT_METHODS, 'Payment method'));

module.exports = { Order, OrderLine, Payment, ORDER_TYPES, ORDER_STATUSES, PAYMENT_METHODS };
