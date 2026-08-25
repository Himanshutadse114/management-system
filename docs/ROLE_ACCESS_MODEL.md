# Role Access Model

## Principle

Outlet OS uses **role-specific workspaces** and **branch-scoped least privilege**. A user should see only the screens, data and actions needed for the job they perform at the branch where they are assigned.

The browser UI is only the first layer. Every protected API independently re-checks the current PostgreSQL membership and branch scope on every request.

## Role matrix

| Role | Primary workspace | Can see | Can do | Must not see/do |
| --- | --- | --- | --- | --- |
| Super Admin | Platform Administration | tenants, access requests, platform configuration; operational support access | create/suspend tenants, assign tenant admins | no routine shared-account operation |
| Tenant Admin | Business Console | all branches in own tenant, staff, inventory, sales, restaurant, analytics, reports | create branches, assign staff, manage all tenant operations | other tenants |
| Branch Manager | Branch Operations | only assigned branch; branch sales, stock, restaurant/table operations, branch analytics/reports | manage menu/tables, approve cancellations, settle orders, branch inventory, expenses | tenant creation, other branches, tenant staff administration |
| Inventory Manager | Inventory | inventory for assigned branches | products, purchases, suppliers, stock adjustments, wastage, movement history | POS, restaurant orders, staff, analytics/P&L, reports |
| Cashier | Cashier POS | sellable catalogue, own assigned branch sales, restaurant bills awaiting payment | counter checkout, receive/settle payments | inventory cost, COGS, profit, menu/table administration, staff, P&L |
| Waiter | Table Service | tables for assigned restaurant, sellable menu, own active/history orders | open table orders, add items, mark served, request payment | payment settlement, exact stock, COGS/profit, inventory, sales dashboard, staff, analytics, reports, menu/table configuration |
| Auditor | Audit & Reports | analytics and generated reports for assigned scope | read/export only | operational writes, POS, order changes, stock changes, staff changes |

## Waiter experience

A waiter does **not** enter the management dashboard. After Google sign-in the application opens directly into a dedicated Table Service workspace for the assigned Bar + Restaurant branch.

The waiter sees:

1. Restaurant name and their role.
2. Floor/table cards showing `Available`, `Your order`, or `Occupied`.
3. Menu/order builder with current selling prices.
4. Their own open/served/awaiting-payment orders.
5. Actions to add items, mark served, and request payment.

The waiter does not receive:

- exact branch stock quantities;
- inventory valuation or weighted cost;
- COGS or gross profit;
- other waiters' order contents, totals or customer/payment details;
- payment settlement controls;
- QR/menu administration;
- table creation/configuration;
- sales/analytics/reports/staff/platform navigation.

## Cashier experience

A cashier enters a dedicated POS workspace. In a Bar + Restaurant branch the cashier also sees only restaurant orders that are `AWAITING_PAYMENT`, so the cashier can settle the bill without getting restaurant-management access.

Cashier API responses omit COGS and gross-profit fields.

## Branch Manager experience

A Branch Manager enters a branch-scoped operating console. Navigation is built from branch capabilities and branch type. A Bar + Restaurant manager can access Restaurant; a Wine Shop manager does not get restaurant navigation.

The Branch Manager cannot create tenants/branches or assign tenant-level staff. Those actions stay with the Tenant Admin.

## Multi-role users

If one identity has more than one active branch membership, capabilities are the union of the active roles **but remain branch-specific**. A manager permission at Branch A never upgrades a waiter assignment at Branch B.

Every workspace selector must therefore filter branches by the role required for that workspace rather than showing all assigned branches.

## Enforcement layers

1. **Google authentication** proves identity.
2. **Live membership snapshot** reloads current memberships from PostgreSQL.
3. **Capability policy** maps branch roles to allowed actions.
4. **Branch scope check** verifies that the requested branch belongs to the requested tenant.
5. **Object ownership rules** further constrain waiter operations to the waiter's own orders.
6. **Response shaping** removes sensitive fields that the role does not need.
7. **UI capability routing** exposes only job-relevant workspaces.
8. **Audit logs** retain sensitive operational actions such as cancellation and payment.

## Capability map

- `inventory.read`, `inventory.write`
- `sales.read`, `sales.write`
- `restaurant.catalogue.read`
- `restaurant.tables.read`
- `restaurant.orders.read`
- `restaurant.orders.write`
- `restaurant.orders.status`
- `restaurant.pay`
- `restaurant.manage`
- `analytics.read`
- `expenses.write`
- `reports.read`

Tenant Admin and Super Admin are higher-scope overrides; branch capabilities never grant tenant/platform administration.
