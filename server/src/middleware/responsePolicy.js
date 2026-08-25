const { effectiveRole } = require('../security/rolePolicy');

const SENSITIVE_EMPLOYEE_KEYS = new Set([
  'cogsMinor',
  'grossProfitMinor',
  'costAmountMinor',
  'inventoryValueMinor',
  'averageUnitCostMinor',
  'unitCostMinor',
  'weightedAverageCostMinor',
  'costMinor'
]);

const WAITER_EXTRA_KEYS = new Set([
  'availableQuantityBase',
  'quantityBase',
  'inventoryBalances',
  'payments',
  'paymentReference'
]);

function stripKeys(value, blockedKeys) {
  if (Array.isArray(value)) return value.map((item) => stripKeys(item, blockedKeys));
  if (!value || typeof value !== 'object') return value;
  const result = {};
  for (const [key, nested] of Object.entries(value)) {
    if (blockedKeys.has(key)) continue;
    result[key] = stripKeys(nested, blockedKeys);
  }
  return result;
}

function responsePolicy(req, _res, next) {
  if (!req.access || !req.path) return next();
  const match = req.path.match(/^\/(?:sales|restaurant|inventory)\/tenants\/([^/]+)\/branches\/([^/]+)/);
  if (!match) return next();

  const role = effectiveRole(req.access, match[1], match[2]);
  if (!['WAITER', 'CASHIER'].includes(role)) return next();

  const originalJson = _res.json.bind(_res);
  _res.json = (body) => {
    const blocked = new Set(SENSITIVE_EMPLOYEE_KEYS);
    if (role === 'WAITER') for (const key of WAITER_EXTRA_KEYS) blocked.add(key);
    return originalJson(stripKeys(body, blocked));
  };
  next();
}

module.exports = { responsePolicy, stripKeys };
