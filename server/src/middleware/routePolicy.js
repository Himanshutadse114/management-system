const { authenticate, requireApproved } = require('./auth');
const { CAPABILITIES, roleHasCapability } = require('../security/rolePolicy');

function branchRequirement(req) {
  const path = req.path;
  let match;

  match = path.match(/^\/inventory\/tenants\/([^/]+)\/branches\/([^/]+)(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: req.method === 'GET' ? CAPABILITIES.INVENTORY_READ : CAPABILITIES.INVENTORY_WRITE };

  match = path.match(/^\/sales\/tenants\/([^/]+)\/branches\/([^/]+)(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: req.method === 'GET' ? CAPABILITIES.SALES_READ : CAPABILITIES.SALES_WRITE };

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/catalogue(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: CAPABILITIES.RESTAURANT_CATALOGUE_READ };

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/tables(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: req.method === 'GET' ? CAPABILITIES.RESTAURANT_TABLES_READ : CAPABILITIES.RESTAURANT_MANAGE };

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/menu(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: CAPABILITIES.RESTAURANT_MANAGE };

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/waiters(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: CAPABILITIES.RESTAURANT_MANAGE };

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/settlements(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: CAPABILITIES.RESTAURANT_PAY };

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/unresolved(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: CAPABILITIES.RESTAURANT_ORDERS_READ };

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/orders\/[^/]+\/pay(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: CAPABILITIES.RESTAURANT_PAY };

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/orders\/[^/]+\/cancel(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: CAPABILITIES.RESTAURANT_MANAGE };

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/orders\/[^/]+\/status(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: CAPABILITIES.RESTAURANT_ORDERS_STATUS };

  match = path.match(/^\/restaurant\/tenants\/([^/]+)\/branches\/([^/]+)\/orders(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: req.method === 'GET' ? CAPABILITIES.RESTAURANT_ORDERS_READ : CAPABILITIES.RESTAURANT_ORDERS_WRITE };

  match = path.match(/^\/analytics\/tenants\/([^/]+)\/branches\/([^/]+)\/overview(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: CAPABILITIES.ANALYTICS_READ };

  match = path.match(/^\/analytics\/tenants\/([^/]+)\/branches\/([^/]+)\/expenses(?:\/|$)/);
  if (match) return { tenantId: match[1], branchId: match[2], capability: CAPABILITIES.EXPENSE_WRITE };

  return null;
}

function authenticateOnce(req, res, next) {
  if (req.user && req.access) return next();
  return authenticate(req, res, next);
}

function policyGuard(req, res, next) {
  const requirement = branchRequirement(req);
  if (!requirement) return next();

  return authenticateOnce(req, res, () => requireApproved(req, res, () => {
    if (req.access?.isSuperAdmin) return next();
    if ((req.access?.tenants || []).some((row) => String(row.tenantId) === String(requirement.tenantId) && row.role === 'TENANT_ADMIN')) return next();

    const memberships = (req.access?.branches || []).filter((row) =>
      String(row.tenantId) === String(requirement.tenantId) && String(row.branchId) === String(requirement.branchId)
    );
    if (!memberships.some((row) => roleHasCapability(row.role, requirement.capability))) {
      return res.status(403).json({
        message: 'This action is not available for your assigned branch role.',
        code: 'ROLE_CAPABILITY_DENIED',
        capability: requirement.capability
      });
    }
    next();
  }));
}

module.exports = { branchRequirement, policyGuard };
