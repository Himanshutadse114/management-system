const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/database');

const USER_STATUS = ['PENDING', 'ACTIVE', 'SUSPENDED'];
const TENANT_STATUS = ['ACTIVE', 'SUSPENDED'];
const MEMBERSHIP_STATUS = ['INVITED', 'ACTIVE', 'SUSPENDED'];
const TENANT_ROLES = ['TENANT_ADMIN', 'AUDITOR'];
const BRANCH_ROLES = ['BRANCH_MANAGER', 'INVENTORY_MANAGER', 'CASHIER', 'WAITER', 'AUDITOR'];
const BRANCH_TYPES = ['BAR_RESTAURANT', 'WINE_SHOP'];

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

async function bootstrapModels() {
  // Foundation bootstrap only. Replace with versioned migrations before the
  // schema begins carrying production accounting/inventory data.
  await sequelize.sync();
}

module.exports = {
  User,
  AccessRequest,
  Tenant,
  TenantMembership,
  Branch,
  BranchMembership,
  AuditLog,
  USER_STATUS,
  TENANT_STATUS,
  MEMBERSHIP_STATUS,
  TENANT_ROLES,
  BRANCH_ROLES,
  BRANCH_TYPES,
  bootstrapModels
};
