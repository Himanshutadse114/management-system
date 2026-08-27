export const ROLE_LABELS = Object.freeze({
  BRANCH_MANAGER: 'Branch Manager',
  INVENTORY_MANAGER: 'Stock Manager',
  CASHIER: 'Cashier',
  WAITER: 'Waiter',
  AUDITOR: 'Auditor'
});

export const MODULES = Object.freeze({
  BRANCH_OVERVIEW: 'Home',
  INVENTORY: 'Stock',
  SALES: 'Sales',
  RESTAURANT_MANAGER: 'Restaurant',
  CASHIER: 'Billing',
  WAITER: 'Take Orders',
  ANALYTICS: 'Sales & Profit',
  REPORTS: 'Reports'
});

export const MODULE_DESCRIPTIONS = Object.freeze({
  [MODULES.BRANCH_OVERVIEW]: 'See your branches and choose what you want to do.',
  [MODULES.INVENTORY]: 'Check stock, add purchases and record wastage or adjustments.',
  [MODULES.SALES]: 'Create counter sales and see completed sales for your branch.',
  [MODULES.RESTAURANT_MANAGER]: 'Manage restaurant orders, tables, QR menu and bills.',
  [MODULES.CASHIER]: 'Collect restaurant bills and create counter sales.',
  [MODULES.WAITER]: 'Choose a table, add items and send the bill to the cashier.',
  [MODULES.ANALYTICS]: 'See sales, expenses and profit in simple numbers.',
  [MODULES.REPORTS]: 'Create and download branch reports.'
});

const MODULE_ORDER = [
  MODULES.BRANCH_OVERVIEW,
  MODULES.WAITER,
  MODULES.CASHIER,
  MODULES.INVENTORY,
  MODULES.SALES,
  MODULES.RESTAURANT_MANAGER,
  MODULES.ANALYTICS,
  MODULES.REPORTS
];

export function hasTenantAdmin(access) {
  return (access?.tenants || []).some((row) => row.role === 'TENANT_ADMIN');
}

export function isPlatformOrTenantAdmin(access) {
  return Boolean(access?.isSuperAdmin || hasTenantAdmin(access));
}

export function accessForBranchRoles(access, roles) {
  const allowed = new Set(roles);
  return {
    ...access,
    branches: (access?.branches || []).filter((row) => allowed.has(row.role))
  };
}

export function membershipsForRole(access, role, branchType = null) {
  return (access?.branches || []).filter((row) => row.role === role && (!branchType || row.branch?.type === branchType));
}

export function focusedAccessProfile(access) {
  if (!access || isPlatformOrTenantAdmin(access)) return null;

  const branchMemberships = access.branches || [];
  const branchRoles = new Set(branchMemberships.map((row) => row.role));
  const tenantAuditor = (access.tenants || []).some((row) => row.role === 'AUDITOR');
  const modules = new Set();

  // A Branch Manager gets the management workspace only. Lower job roles on the
  // same account do not add waiter/cashier screens because manager responsibilities
  // already supersede those operational duties and mixing views increases risk.
  if (branchRoles.has('BRANCH_MANAGER')) {
    modules.add(MODULES.BRANCH_OVERVIEW);
    modules.add(MODULES.INVENTORY);
    modules.add(MODULES.SALES);
    modules.add(MODULES.ANALYTICS);
    modules.add(MODULES.REPORTS);
    if (branchMemberships.some((row) => row.role === 'BRANCH_MANAGER' && row.branch?.type === 'BAR_RESTAURANT')) {
      modules.add(MODULES.RESTAURANT_MANAGER);
    }
  } else {
    if (branchRoles.has('INVENTORY_MANAGER')) modules.add(MODULES.INVENTORY);
    if (branchRoles.has('CASHIER')) modules.add(MODULES.CASHIER);
    if (branchRoles.has('WAITER')) modules.add(MODULES.WAITER);
    if (branchRoles.has('AUDITOR') || tenantAuditor) {
      modules.add(MODULES.ANALYTICS);
      modules.add(MODULES.REPORTS);
    }
  }

  const orderedModules = MODULE_ORDER.filter((module) => modules.has(module));
  const primaryRole = branchRoles.has('BRANCH_MANAGER') ? 'BRANCH_MANAGER'
    : branchRoles.has('INVENTORY_MANAGER') ? 'INVENTORY_MANAGER'
      : branchRoles.has('CASHIER') ? 'CASHIER'
        : branchRoles.has('WAITER') ? 'WAITER'
          : (branchRoles.has('AUDITOR') || tenantAuditor) ? 'AUDITOR' : null;

  const defaultModule = primaryRole === 'WAITER' ? MODULES.WAITER
    : primaryRole === 'CASHIER' ? MODULES.CASHIER
      : primaryRole === 'INVENTORY_MANAGER' ? MODULES.INVENTORY
        : primaryRole === 'AUDITOR' ? MODULES.ANALYTICS
          : MODULES.BRANCH_OVERVIEW;

  return {
    primaryRole,
    primaryRoleLabel: ROLE_LABELS[primaryRole] || 'Branch Staff',
    modules: orderedModules,
    defaultModule: orderedModules.includes(defaultModule) ? defaultModule : orderedModules[0] || null,
    branchMemberships,
    tenantAuditor
  };
}