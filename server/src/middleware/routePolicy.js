const { authenticate, requireApproved } = require('./auth');
const { CAPABILITIES, roleHasCapability } = require('../security/rolePolicy');

const OPERATION_PREFIXES = ['/tenants', '/inventory', '/sales', '/restaurant', '/analytics', '/reports'];

function requirement(tenantId, branchId, capability, roles = null, tenantAdminAllowed = true) {
  return { tenantId, branchId, capability, roles, tenantAdminAllowed };
}

function branchRequirement(req) {
  const path = req.path;
  let match;

  // Dedicated cashier API. Exact-role only: Tenant Admins and Platform Admins
  // should use their management APIs rather than impersonating cashier context.
  match = path.match(/^\/sales\/cashier\/tenants\/([^/]+)\/branches\/([^/]+)(?:\/|$)/);
  if (match) return requirement(match[1], match[2], req.method === 'GET' ? CAPABILITIES.SALES_READ : CAPABILITIES.SALES_WRITE, ['CASHIER'], false);

  match = path.match(/^\/restaurant\/cashier\/tenants\/([^/]+)\/branches\/([^/]+)\/settlements(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_PAY, ['CASHIER'], false);

  match = path.match(/^\/restaurant\/cashier\/tenants\/([^/]+)\/branches\/([^/]+)\/orders\/[^/]+\/pay(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_PAY, ['CASHIER'], false);

  // Dedicated waiter API. Exact-role only and intentionally narrower than the
  // management restaurant API.
  match = path.match(/^\/restaurant\/waiter\/tenants\/([^/]+)\/branches\/([^/]+)\/catalogue(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_CATALOGUE_READ, ['WAITER'], false);

  match = path.match(/^\/restaurant\/waiter\/tenants\/([^/]+)\/branches\/([^/]+)\/tables(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_TABLES_READ, ['WAITER'], false);

  match = path.match(/^\/restaurant\/waiter\/tenants\/([^/]+)\/branches\/([^/]+)\/unresolved(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_ORDERS_READ, ['WAITER'], false);

  match = path.match(/^\/restaurant\/waiter\/tenants\/([^/]+)\/branches\/([^/]+)\/orders\/[^/]+\/status(?:\/|$)/);
  if (match) return requirement(match[1], match[2], CAPABILITIES.RESTAURANT_ORDERS_STATUS, ['WAITER'], false);

  match = path.match(/^\/restaurant\/waiter\/tenants\/([^/]+)\/branches\/([^/]+)\/orders(?:\/|$)/);
  if (match) return requirement(match[1], match[2], req.method === 'GET' ? CAPABILITIES.RESTAURANT_ORDERS_READ : CAPABILITIES.RESTAURANT_ORDERS_WRITE, ['WAITER'], false);

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

function isOperationalPath(path) {
  return OPERATION_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function policyGuard(req, res, next) {
  const required = branchRequirement(req);
  const operational = isOperationalPath(req.path);
  if (!required && !operational) return next();

  return authenticateOnce(req, res, () => requireApproved(req, res, () => {
    // Platform Admin is a control-plane role. It manages tenant lifecycle through
    // /api/platform and does not inherit customer operational data access.
    if (req.access?.isSuperAdmin) {
      return res.status(403).json({
        message: 'Platform administrators do not have tenant operational access.',
        code: 'PLATFORM_OPERATION_SCOPE_DENIED'
      });
    }

    // Tenant-wide routes (branches list, consolidated analytics/reports) perform
    // their own tenant membership checks inside the router.
    if (!required) return next();

    const tenantAdmin = (req.access?.tenants || []).some((row) =>
      String(row.tenantId) === String(required.tenantId) && row.role === 'TENANT_ADMIN'
    );
    if (required.tenantAdminAllowed && tenantAdmin) return next();

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
        capability: required.capability,
        allowedRoles: required.roles || []
      });
    }
    next();
  }));
}

module.exports = { branchRequirement, policyGuard, isOperationalPath };
