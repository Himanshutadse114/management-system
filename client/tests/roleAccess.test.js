import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MODULES,
  accessForBranchRoles,
  focusedAccessProfile
} from '../src/roleAccess.js';

function membership(role, branchId = role.toLowerCase()) {
  return {
    membershipId: `${branchId}-${role}`,
    tenantId: 'tenant-1',
    branchId,
    role,
    branch: { id: branchId, tenantId: 'tenant-1', name: branchId, type: 'BAR_RESTAURANT' }
  };
}

test('waiters enter only the table-order workflow', () => {
  const profile = focusedAccessProfile({ tenants: [], branches: [membership('WAITER')] });
  assert.deepEqual(profile.modules, [MODULES.WAITER]);
  assert.equal(profile.defaultModule, MODULES.WAITER);
});

test('manager access does not mix in lower-purpose cashier and waiter screens', () => {
  const profile = focusedAccessProfile({
    tenants: [],
    branches: [membership('BRANCH_MANAGER', 'branch-1'), membership('WAITER', 'branch-1'), membership('CASHIER', 'branch-1')]
  });
  assert.ok(profile.modules.includes(MODULES.BRANCH_OVERVIEW));
  assert.ok(profile.modules.includes(MODULES.RESTAURANT_MANAGER));
  assert.ok(!profile.modules.includes(MODULES.WAITER));
  assert.ok(!profile.modules.includes(MODULES.CASHIER));
});

test('branch scoping keeps only the roles required by a workspace', () => {
  const access = { tenants: [], branches: [membership('WAITER'), membership('INVENTORY_MANAGER')] };
  const scoped = accessForBranchRoles(access, ['INVENTORY_MANAGER']);
  assert.equal(scoped.branches.length, 1);
  assert.equal(scoped.branches[0].role, 'INVENTORY_MANAGER');
});
