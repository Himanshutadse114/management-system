const { authenticate, requireApproved } = require('./auth');
const { CAPABILITIES, roleHasCapability } = require('../security/rolePolicy');

function requirement(tenantId, branchId, capability, roles = null) {
  return { tenantId, branchId, capability, roles };
}

function branchRequirement(req) {
  const path = req.path;
  let match;

  // Dedicated cashier API. The URL itself declares the employee context,
  // removing ambiguity for identities with more than one branch role.
  match = path.match(/^\/sales\/cashier\/tenants\/([^/]+)\/branches\/([^/]+)(?:\/|$)/);
  if (match) return requirement(match[1], match[2], req.method === 'GET' ? CAPABILITIES.SALES_READ : CAPABILITIES.SALES_WRITE, ['CASHIER']);

  match = path.match(/^\/restaurant\/cashier\/tenants\/([^/]+)\/branches\/([^/]+)\/settlements(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_PAY, ['CASHIER']);

  match = path.match(/^\/restaurant\/cashier\/tenants\/([^/]+)\/branches\/([^/]+)\/orders\/[^/]+\/pay(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_PAY, ['CASHIER']);

  // Dedicated waiter API. Waiter reads/writes are always waiter-scoped even
  // when the same identity is also a cashier or manager elsewhere.
  match = path.match(/^\/restaurant\/waiter\/tenants\/([^/]+)\/branches\/([^/]+)\/catalogue(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_CATALOGUE_READ, ['WAITER']);

  match = path.match(/^\/restaurant\/waiter\/tenants\/([^/]+)\/branches\/([^/]+)\/tables(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_TABLES_READ, ['WAITER']);

  match = path.match(/^\/restaurant\/waiter\/tenants\/([^/]+)\/branches\/([^/]+)\/unresolved(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_ORDERS_READ, ['WAITER']);

  match = path.match(/^\/restaurant\/waiter\/tenants\/([^/]+)\/branches\/([^/]+)\/orders\/[^/]+\/status(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_ORDERS_STATUS, ['WAITER']);

  match = path.match(/^\/restaurant\/waiter\/tenants\/([^/]+)\/branches\/([^/]+)\/orders(?:\/|$)/);
  if (match) return requirement(match[1], match[2], req.method === 'GET' ? CAPABILITIES.RESTAURANT_ORDERS_READ : CAPABILITIES.RESTAURANT_ORDERS_WRITE, ['WAITER']);

  // Inventory management API: branch managers and inventory managers only.
  match = path.match(/^\/inventory\/tenants\/([^/]+)\/branches\/([^/]+)(?:\/|$)/);
  if (match) return requirement(match[1], match[2], req.method === 'GET' ? CAPABILITIES.INVENTORY_READ : CAPABILITIES.INVENTORY_WRITE, ['BRANCH_MANAGER', 'INVENTORY_MANAGER']);

  // Management sales API: cashiers use the dedicated /sales/cashier namespace.
  match = path.match(/^\/sales\/tenants\/([^/]+)\/branches\/([^/]+)(?:\/|$)/);
  if (match) return requirement(match[1], match[2], req.method === 'GET' ? CAPABILITIES.SALES_READ : CAPABILITIES.SALES_WRITE, ['BRANCH_MANAGER']);

  // Management restaurant API. Waiters/cashiers use dedicated namespaces.
  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/catalogue(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_CATALOGUE_READ, ['BRANCH_MANAGER']);

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/tables(?:\/|$)/);
  if (match) return requirement(match[1], match[2], req.method === 'GET' ? CAPABILITIES.RESTAURANT_TABLES_READ : CAPABILITIES.RESTAURANT_MANAGE, ['BRANCH_MANAGER']);

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/menu(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_MANAGE, ['BRANCH_MANAGER']);

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/waiters(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_MANAGE, ['BRANCH_MANAGER']);

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/unresolved(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_ORDERS_READ, ['BRANCH_MANAGER']);

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/orders\/[^/]+\/pay(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_PAY, ['BRANCH_MANAGER']);

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/orders\/[^/]+\/cancel(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_MANAGE, ['BRANCH_MANAGER']);

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/orders\/[^/]+\/status(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_ORDERS_STATUS, ['BRANCH_MANAGER']);

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/orders(?:\/|$)/);
  if (match) return requirement(match[1], match[2], req.method === 'GET' ? CAPABILITIES.RESTAURANT_ORDERS_READ : CAPABILITIES.RESTAURANT_ORDERS_WRITE, ['BRANCH_MANAGER']);

  // Analytics and expenses.
  match = path.match(/^\/analytics\/tenants\/([^/]+)\/branches\/([^/]+)\/overview(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.ANALYTICS_READ, ['BRANCH_MANAGER', 'AUDITOR']);

  match = path.match(/^\/analytics\/tenants\/([^/]+)\/branches\/([^/]+)\/expenses(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.EXPENSE_WRITE, ['BRANCH_MANAGER']);

  return null;
}

function authenticateOnce(req, res, next) {
  if (req.user && req.access) return next();
  return authenticate(req, res, next);
}

function policyGuard(req, res, next) {
  const required = branchRequirement(req);
  if (!required) return next();

  return authenticateOnce(req, res, () => requireApproved(req, res, () => {
    if (req.access?.isSuperAdmin) return next();
    if ((req.access?.tenants || []).some((row) => String(row.tenantId) === String(required.tenantId) && row.role === 'TENANT_ADMIN')) return next();

    const memberships = (req.access?.branches || []).filter((row) =>
      String(row.tenantId) === String(required.tenantId) && String(row.branchId) === String(required.branchId)
    );
    const permitted = required.roles
      ? memberships.some((row) => required.roles.includes(row.role))
      : memberships.some((row) => roleHasCapability(row.role, required.capability));

    if (!permitted) {
      return res.status(403).json({
        message: 'This action is not available for your assigned branch role.',
        code: 'ROLE_CAPABILITY_DENIED',
        capability: required.capability
      });
    }
    next();
  }));
}

module.exports = { branchRequirement, policyGuard };
