# Outlet OS — Role & Workspace Security Model

## Principle

Outlet OS uses **least privilege + role-specific workspaces**. A role is not a cosmetic sidebar filter. Backend routes, data scopes and response shapes enforce the same boundary.

The application should feel like a different product to each job role:

- a waiter sees table service;
- a cashier sees payment/POS work;
- an inventory manager sees stock work;
- a branch manager sees branch operations;
- an auditor sees read-only analytics/reports;
- a tenant admin sees the whole tenant;
- a platform super admin sees the control plane, not customer operations.

## Role matrix

| Role | Scope | Workspace | Can see/do | Must not see/do |
|---|---|---|---|---|
| Super Admin | Platform | Tenant control plane | Create/list/suspend tenants, assign Tenant Admins, review access requests | Inventory, sales, restaurant orders, staff operations, P&L, reports |
| Tenant Admin | One tenant | Business administration | Branches, staff assignments, inventory, sales, restaurant configuration, analytics, expenses, reports | Other tenants |
| Branch Manager | Assigned branch(es) | Branch operations | Inventory, branch sales, restaurant tables/menu/orders, cancellation, settlement, branch P&L, expenses, reports | Tenant creation, staff role administration, unassigned branches |
| Inventory Manager | Assigned branch(es) | Inventory | Products, suppliers, purchases, stock, wastage, adjustments, movement ledger | Sales/POS, restaurant service, P&L, reports, staff |
| Cashier | Assigned branch(es) | Cashier POS | Counter checkout, own shift receipts, restaurant bills awaiting payment | Inventory quantities/cost, COGS, gross profit, analytics, staff, menu/table management |
| Waiter | Assigned restaurant branch(es) | Table Service | Active tables, currently published menu, open own orders, add items, mark served, request bill | Payments, inventory values/quantities, cost/profit, other waiters' order detail, menu configuration, analytics, reports |
| Auditor | Tenant or assigned branch | Audit | Read-only analytics and reports for assigned scope | Inventory changes, POS, restaurant operations, expenses writes, staff management |

## Scope rules

### Super Admin

Super Admin is intentionally **not** an inherited Tenant Admin. `/api/platform/*` is its control-plane namespace. Operational prefixes (`/api/tenants`, `/api/inventory`, `/api/sales`, `/api/restaurant`, `/api/analytics`, `/api/reports`) reject the platform role.

This separation protects tenant business data from platform operators and makes support access explicit if such a feature is ever introduced later.

### Tenant Admin

Tenant Admin can operate all branches in its tenant, but tenant ID checks remain mandatory on every route. Tenant Admin is the only normal role that assigns branch staff roles.

### Branch Manager

A Branch Manager sees only branches with an active `BRANCH_MANAGER` membership. Even if the same identity also has lower staff memberships, the UI prioritises the manager workspace and does not mix waiter/cashier screens into it.

### Waiter

Waiter uses the dedicated namespace:

`/api/restaurant/waiter/tenants/:tenantId/branches/:branchId/*`

Waiter catalogue is based on **active published `menu_items`**, not all tenant products. Stock is converted to a boolean `available` signal; exact quantity and inventory cost are not returned.

Tables occupied by another waiter expose only an occupied flag. The other waiter's order number, items and value are not exposed.

Waiter order routes always force `waiterUserId = authenticated user`. A waiter cannot choose another waiter ID and can update only their own orders.

Waiter can move an order only through service states required for their job: `OPEN -> SERVED -> AWAITING_PAYMENT`. Payment and cancellation are outside waiter scope.

### Cashier

Cashier uses dedicated namespaces:

- `/api/sales/cashier/tenants/:tenantId/branches/:branchId/*`
- `/api/restaurant/cashier/tenants/:tenantId/branches/:branchId/*`

Cashier checkout accepts existing selling-price options and payment method. Cashier cannot supply manager-only discount/tax overrides.

Cashier shift sales are filtered by `closedByUserId`. Restaurant settlement queue contains only orders in `AWAITING_PAYMENT`.

### Inventory Manager

Inventory Manager can read/write stock operations but is not granted sales, restaurant, analytics or report capabilities.

### Auditor

Auditor has no mutation routes. Tenant Auditor may view tenant-level analytics/report scope; Branch Auditor is limited to explicitly assigned branches.

## API boundary strategy

1. JWT establishes identity.
2. `accessSnapshot()` reloads active PostgreSQL memberships on every request.
3. `policyGuard` checks the requested namespace and exact role/scope.
4. Route middleware rechecks branch/tenant ownership.
5. Dedicated employee routes shape minimum required response data.
6. `responsePolicy` strips sensitive cost/profit/stock fields from employee namespaces as defense in depth.
7. All sensitive actions create audit records.

## Public QR menu

Public menus are read-only and unauthenticated. They expose only:

- branch public name/address/phone/currency;
- table display information;
- active published menu entries;
- images, descriptions and public selling prices.

They never expose stock quantities, inventory cost, staff identity, order data or internal accounting fields.

Render-safe QR links use:

`/?menu=<qr-token>`

The cleaner `/menu/<qr-token>` route remains supported when the Render Static Site rewrite `/* -> /index.html` is configured.

## Future feature rule

Every new feature must answer these questions before implementation:

1. Which role owns the job?
2. Is the scope platform, tenant, branch, table/order or self-only?
3. Does another role need read-only access?
4. What fields are actually required by that role?
5. Can a user bypass the UI and call a broader API?
6. Does the action require an audit event?

A feature is not complete until both frontend navigation **and backend enforcement** follow this model.
