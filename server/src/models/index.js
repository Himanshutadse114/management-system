const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');
const defineInventoryModels = require('./inventory');

const USER_STATUS = ['PENDING', 'ACTIVE', 'SUSPENDED'];
const TENANT_STATUS = ['ACTIVE', 'SUSPENDED'];
const MEMBERSHIP_STATUS = ['INVITED', 'ACTIVE', 'SUSPENDED'];
const TENANT_ROLES = ['TENANT_ADMIN', 'AUDITOR'];
const BRANCH_ROLES = ['BRANCH_MANAGER', 'INVENTORY_MANAGER', 'CASHIER', 'WAITER', 'AUDITOR'];
const BRANCH_TYPES = ['BAR_RESTAURANT', 'WINE_SHOP'];

const CATALOG_STATUS = ['ACTIVE', 'INACTIVE'];
const PRODUCT_TYPES = ['ALCOHOL', 'FOOD', 'MIXER', 'OTHER'];
const INVENTORY_UNITS = ['ML', 'PIECE', 'GRAM'];
const PURCHASE_STATUS = ['POSTED', 'VOIDED'];
const INVENTORY_MOVEMENT_TYPES = [
  'PURCHASE',
  'SALE',
  'WASTAGE',
  'ADJUSTMENT_IN',
  'ADJUSTMENT_OUT',
  'TRANSFER_IN',
  'TRANSFER_OUT',
  'RETURN_IN',
  'RETURN_OUT'
];

const User = sequelize.define('User', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  email: { type: DataTypes.STRING(320), allowNull: false, unique: true },
  googleId: { type: DataTypes.STRING(255), allowNull: true, unique: true },
  name: { type: DataTypes.STRING(120), allowNull: true },
  avatarUrl: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'PENDING' },
  lastLoginAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'users',
  indexes: [{ fields: ['email'] }, { fields: ['googleId'] }]
});

const AccessRequest = sequelize.define('AccessRequest', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  userId: { type: DataTypes.UUID, allowNull: false },
  email: { type: DataTypes.STRING(320), allowNull: false },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'PENDING' },
  requestedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
  reviewedByUserId: { type: DataTypes.UUID, allowNull: true },
  note: { type: DataTypes.TEXT, allowNull: true }
}, {
  tableName: 'access_requests',
  indexes: [
    { fields: ['status', 'requestedAt'] },
    { unique: true, fields: ['email'], name: 'access_requests_email_unique' }
  ]
});

const Tenant = sequelize.define('Tenant', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(160), allowNull: false },
  slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'ACTIVE' },
  logoObjectKey: { type: DataTypes.TEXT, allowNull: true },
  createdByUserId: { type: DataTypes.UUID, allowNull: false }
}, {
  tableName: 'tenants',
  indexes: [{ fields: ['status'] }]
});

const TenantMembership = sequelize.define('TenantMembership', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  userId: { type: DataTypes.UUID, allowNull: true },
  email: { type: DataTypes.STRING(320), allowNull: false },
  role: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'TENANT_ADMIN' },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'INVITED' },
  invitedByUserId: { type: DataTypes.UUID, allowNull: false },
  activatedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'tenant_memberships',
  indexes: [
    { unique: true, fields: ['tenantId', 'email'], name: 'tenant_membership_tenant_email_unique' },
    { fields: ['userId', 'status'] },
    { fields: ['tenantId', 'role', 'status'] }
  ]
});

const Branch = sequelize.define('Branch', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  name: { type: DataTypes.STRING(160), allowNull: false },
  code: { type: DataTypes.STRING(50), allowNull: false },
  type: { type: DataTypes.STRING(32), allowNull: false },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'ACTIVE' },
  address: { type: DataTypes.TEXT, allowNull: true },
  phone: { type: DataTypes.STRING(40), allowNull: true },
  timezone: { type: DataTypes.STRING(64), allowNull: false, defaultValue: 'Asia/Kolkata' },
  currency: { type: DataTypes.STRING(3), allowNull: false, defaultValue: 'INR' }
}, {
  tableName: 'branches',
  indexes: [
    { unique: true, fields: ['tenantId', 'code'], name: 'branch_tenant_code_unique' },
    { fields: ['tenantId', 'type', 'status'] }
  ]
});

const BranchMembership = sequelize.define('BranchMembership', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: false },
  branchId: { type: DataTypes.UUID, allowNull: false },
  userId: { type: DataTypes.UUID, allowNull: true },
  email: { type: DataTypes.STRING(320), allowNull: false },
  role: { type: DataTypes.STRING(32), allowNull: false },
  status: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'INVITED' },
  invitedByUserId: { type: DataTypes.UUID, allowNull: false },
  activatedAt: { type: DataTypes.DATE, allowNull: true }
}, {
  tableName: 'branch_memberships',
  indexes: [
    { unique: true, fields: ['branchId', 'email', 'role'], name: 'branch_membership_branch_email_role_unique' },
    { fields: ['userId', 'status'] },
    { fields: ['tenantId', 'branchId', 'status'] }
  ]
});

const AuditLog = sequelize.define('AuditLog', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  tenantId: { type: DataTypes.UUID, allowNull: true },
  branchId: { type: DataTypes.UUID, allowNull: true },
  actorUserId: { type: DataTypes.UUID, allowNull: true },
  action: { type: DataTypes.STRING(100), allowNull: false },
  entityType: { type: DataTypes.STRING(80), allowNull: false },
  entityId: { type: DataTypes.STRING(100), allowNull: true },
  metadata: { type: DataTypes.JSONB, allowNull: true },
  ipAddress: { type: DataTypes.STRING(64), allowNull: true }
}, {
  tableName: 'audit_logs',
  updatedAt: false,
  indexes: [
    { fields: ['tenantId', 'createdAt'] },
    { fields: ['branchId', 'createdAt'] },
    { fields: ['actorUserId', 'createdAt'] }
  ]
});

const {
  ProductCategory,
  Product,
  ProductPriceOption,
  Supplier,
  Purchase,
  PurchaseLine,
  InventoryBalance,
  InventoryMovement
} = defineInventoryModels(sequelize, DataTypes);

User.hasMany(TenantMembership, { foreignKey: 'userId', as: 'tenantMemberships' });
TenantMembership.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Tenant.hasMany(TenantMembership, { foreignKey: 'tenantId', as: 'memberships', onDelete: 'CASCADE' });
TenantMembership.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Tenant.hasMany(Branch, { foreignKey: 'tenantId', as: 'branches', onDelete: 'CASCADE' });
Branch.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

User.hasMany(BranchMembership, { foreignKey: 'userId', as: 'branchMemberships' });
BranchMembership.belongsTo(User, { foreignKey: 'userId', as: 'user' });
Branch.hasMany(BranchMembership, { foreignKey: 'branchId', as: 'memberships', onDelete: 'CASCADE' });
BranchMembership.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
Tenant.hasMany(BranchMembership, { foreignKey: 'tenantId', as: 'branchMemberships', onDelete: 'CASCADE' });

User.hasMany(AccessRequest, { foreignKey: 'userId', as: 'accessRequests' });
AccessRequest.belongsTo(User, { foreignKey: 'userId', as: 'user' });

Tenant.hasMany(ProductCategory, { foreignKey: 'tenantId', as: 'productCategories', onDelete: 'CASCADE' });
ProductCategory.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
ProductCategory.hasMany(Product, { foreignKey: 'categoryId', as: 'products' });
Product.belongsTo(ProductCategory, { foreignKey: 'categoryId', as: 'category' });
Tenant.hasMany(Product, { foreignKey: 'tenantId', as: 'products', onDelete: 'CASCADE' });
Product.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });

Product.hasMany(ProductPriceOption, { foreignKey: 'productId', as: 'priceOptions', onDelete: 'CASCADE' });
ProductPriceOption.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Branch.hasMany(ProductPriceOption, { foreignKey: 'branchId', as: 'priceOptions', onDelete: 'CASCADE' });
ProductPriceOption.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });

Tenant.hasMany(Supplier, { foreignKey: 'tenantId', as: 'suppliers', onDelete: 'CASCADE' });
Supplier.belongsTo(Tenant, { foreignKey: 'tenantId', as: 'tenant' });
Tenant.hasMany(Purchase, { foreignKey: 'tenantId', as: 'purchases', onDelete: 'CASCADE' });
Branch.hasMany(Purchase, { foreignKey: 'branchId', as: 'purchases' });
Purchase.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
Supplier.hasMany(Purchase, { foreignKey: 'supplierId', as: 'purchases' });
Purchase.belongsTo(Supplier, { foreignKey: 'supplierId', as: 'supplier' });
User.hasMany(Purchase, { foreignKey: 'createdByUserId', as: 'createdPurchases' });
Purchase.belongsTo(User, { foreignKey: 'createdByUserId', as: 'createdBy' });
Purchase.hasMany(PurchaseLine, { foreignKey: 'purchaseId', as: 'lines' });
PurchaseLine.belongsTo(Purchase, { foreignKey: 'purchaseId', as: 'purchase' });
Product.hasMany(PurchaseLine, { foreignKey: 'productId', as: 'purchaseLines' });
PurchaseLine.belongsTo(Product, { foreignKey: 'productId', as: 'product' });

Product.hasMany(InventoryBalance, { foreignKey: 'productId', as: 'inventoryBalances', onDelete: 'CASCADE' });
InventoryBalance.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Branch.hasMany(InventoryBalance, { foreignKey: 'branchId', as: 'inventoryBalances', onDelete: 'CASCADE' });
InventoryBalance.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
Product.hasMany(InventoryMovement, { foreignKey: 'productId', as: 'inventoryMovements' });
InventoryMovement.belongsTo(Product, { foreignKey: 'productId', as: 'product' });
Branch.hasMany(InventoryMovement, { foreignKey: 'branchId', as: 'inventoryMovements' });
InventoryMovement.belongsTo(Branch, { foreignKey: 'branchId', as: 'branch' });
User.hasMany(InventoryMovement, { foreignKey: 'actorUserId', as: 'inventoryMovements' });
InventoryMovement.belongsTo(User, { foreignKey: 'actorUserId', as: 'actor' });

function assertAllowed(value, allowed, label) {
  if (!allowed.includes(value)) throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
}

Tenant.beforeValidate((tenant) => assertAllowed(tenant.status, TENANT_STATUS, 'Tenant status'));
TenantMembership.beforeValidate((m) => {
  assertAllowed(m.status, MEMBERSHIP_STATUS, 'Tenant membership status');
  assertAllowed(m.role, TENANT_ROLES, 'Tenant membership role');
});
Branch.beforeValidate((branch) => {
  assertAllowed(branch.status, TENANT_STATUS, 'Branch status');
  assertAllowed(branch.type, BRANCH_TYPES, 'Branch type');
});
BranchMembership.beforeValidate((m) => {
  assertAllowed(m.status, MEMBERSHIP_STATUS, 'Branch membership status');
  assertAllowed(m.role, BRANCH_ROLES, 'Branch membership role');
});
User.beforeValidate((user) => assertAllowed(user.status, USER_STATUS, 'User status'));
ProductCategory.beforeValidate((category) => assertAllowed(category.status, CATALOG_STATUS, 'Category status'));
Supplier.beforeValidate((supplier) => assertAllowed(supplier.status, CATALOG_STATUS, 'Supplier status'));
Purchase.beforeValidate((purchase) => assertAllowed(purchase.status, PURCHASE_STATUS, 'Purchase status'));
Product.beforeValidate((product) => {
  assertAllowed(product.status, CATALOG_STATUS, 'Product status');
  assertAllowed(product.productType, PRODUCT_TYPES, 'Product type');
  assertAllowed(product.inventoryUnit, INVENTORY_UNITS, 'Inventory unit');
  if (product.productType === 'ALCOHOL') {
    if (product.inventoryUnit !== 'ML') throw new Error('Alcohol products must use ML as the inventory unit.');
    if (!product.bottleVolumeMl || Number(product.bottleVolumeMl) <= 0) {
      throw new Error('Alcohol products require a positive bottle volume in ML.');
    }
  }
});
InventoryMovement.beforeValidate((movement) => assertAllowed(movement.movementType, INVENTORY_MOVEMENT_TYPES, 'Inventory movement type'));

async function bootstrapModels() {
  // Phase 1 compatibility: existing identity/tenancy tables were initially
  // bootstrapped with Sequelize. Keep only those foundation tables on sync.
  // Phase 2+ accounting/inventory tables are exclusively migration-managed.
  const foundationModels = [
    User,
    AccessRequest,
    Tenant,
    TenantMembership,
    Branch,
    BranchMembership,
    AuditLog
  ];
  for (const model of foundationModels) await model.sync();

  const { runMigrations } = require('../migrations');
  await runMigrations(sequelize);
}

module.exports = {
  User,
  AccessRequest,
  Tenant,
  TenantMembership,
  Branch,
  BranchMembership,
  AuditLog,
  ProductCategory,
  Product,
  ProductPriceOption,
  Supplier,
  Purchase,
  PurchaseLine,
  InventoryBalance,
  InventoryMovement,
  USER_STATUS,
  TENANT_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLES,
  BRANCH_ROLES,
  BRANCH_TYPES,
  CATALOG_STATUS,
  PRODUCT_TYPES,
  INVENTORY_UNITS,
  PURCHASE_STATUS,
  INVENTORY_MOVEMENT_TYPES,
  bootstrapModels
};
