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

function employeeContext(path) {
  if (/^\/restaurant\/waiter\/tenants\/[^/]+\/branches\/[^/]+/.test(path)) return 'WAITER';
  if (/^\/restaurant\/cashier\/tenants\/[^/]+\/branches\/[^/]+/.test(path)) return 'CASHIER';
  if (/^\/sales\/cashier\/tenants\/[^/]+\/branches\/[^/]+/.test(path)) return 'CASHIER';
  return null;
}

function responsePolicy(req, res, next) {
  if (!req.path) return next();
  const role = employeeContext(req.path);
  if (!role) return next();

  const originalJson = res.json.bind(res);
  res.json = (body) => {
    const blocked = new Set(SENSITIVE_EMPLOYEE_KEYS);
    if (role === 'WAITER') for (const key of WAITER_EXTRA_KEYS) blocked.add(key);
    return originalJson(stripKeys(body, blocked));
  };
  next();
}

module.exports = { responsePolicy, stripKeys, employeeContext };
