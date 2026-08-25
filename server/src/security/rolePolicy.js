const CAPABILITIES = Object.freeze({
  INVENTORY_READ: 'inventory.read',
  INVENTORY_WRITE: 'inventory.write',
  SALES_READ: 'sales.read',
  SALES_WRITE: 'sales.write',
  RESTAURANT_CATALOGUE_READ: 'restaurant.catalogue.read',
  RESTAURANT_TABLES_READ: 'restaurant.tables.read',
  RESTAURANT_ORDERS_READ: 'restaurant.orders.read',
  RESTAURANT_ORDERS_WRITE: 'restaurant.orders.write',
  RESTAURANT_ORDERS_STATUS: 'restaurant.orders.status',
  RESTAURANT_PAY: 'restaurant.pay',
  RESTAURANT_MANAGE: 'restaurant.manage',
  ANALYTICS_READ: 'analytics.read',
  EXPENSE_WRITE: 'expenses.write',
  REPORTS_READ: 'reports.read'
});

const BRANCH_ROLE_CAPABILITIES = Object.freeze({
  BRANCH_MANAGER: Object.freeze([
    CAPABILITIES.INVENTORY_READ,
    CAPABILITIES.INVENTORY_WRITE,
    CAPABILITIES.SALES_READ,
    CAPABILITIES.SALES_WRITE,
    CAPABILITIES.RESTAURANT_CATALOGUE_READ,
    CAPABILITIES.RESTAURANT_TABLES_READ,
    CAPABILITIES.RESTAURANT_ORDERS_READ,
    CAPABILITIES.RESTAURANT_ORDERS_WRITE,
    CAPABILITIES.RESTAURANT_ORDERS_STATUS,
    CAPABILITIES.RESTAURANT_PAY,
    CAPABILITIES.RESTAURANT_MANAGE,
    CAPABILITIES.ANALYTICS_READ,
    CAPABILITIES.EXPENSE_WRITE,
    CAPABILITIES.REPORTS_READ
  ]),
  INVENTORY_MANAGER: Object.freeze([
    CAPABILITIES.INVENTORY_READ,
    CAPABILITIES.INVENTORY_WRITE
  ]),
  CASHIER: Object.freeze([
    CAPABILITIES.SALES_READ,
    CAPABILITIES.SALES_WRITE,
    CAPABILITIES.RESTAURANT_PAY
  ]),
  WAITER: Object.freeze([
    CAPABILITIES.RESTAURANT_CATALOGUE_READ,
    CAPABILITIES.RESTAURANT_TABLES_READ,
    CAPABILITIES.RESTAURANT_ORDERS_READ,
    CAPABILITIES.RESTAURANT_ORDERS_WRITE,
    CAPABILITIES.RESTAURANT_ORDERS_STATUS
  ]),
  AUDITOR: Object.freeze([
    CAPABILITIES.ANALYTICS_READ,
    CAPABILITIES.REPORTS_READ
  ])
});

function roleHasCapability(role, capability) {
  return Boolean(BRANCH_ROLE_CAPABILITIES[String(role || '').toUpperCase()]?.includes(capability));
}

function rolesFor(capability) {
  return Object.entries(BRANCH_ROLE_CAPABILITIES)
    .filter(([, capabilities]) => capabilities.includes(capability))
    .map(([role]) => role);
}

function effectiveRole(access, tenantId, branchId) {
  if (access?.isSuperAdmin) return 'SUPER_ADMIN';
  if ((access?.tenants || []).some((row) => String(row.tenantId) === String(tenantId) && row.role === 'TENANT_ADMIN')) {
    return 'TENANT_ADMIN';
  }
  return (access?.branches || []).find((row) => String(row.branchId) === String(branchId))?.role || null;
}

function isHigherScopeRole(role) {
  return role === 'SUPER_ADMIN' || role === 'TENANT_ADMIN';
}

module.exports = {
  CAPABILITIES,
  BRANCH_ROLE_CAPABILITIES,
  roleHasCapability,
  rolesFor,
  effectiveRole,
  isHigherScopeRole
};
