# Multi-Outlet Bar, Restaurant & Wine Shop Management System

## Master Architecture, Product Plan and Delivery Phases

**Repository:** `Himanshutadse114/management-system`  
**Architecture reference:** `Himanshutadse114/Quizmoto`  
**Status:** Foundation implementation started  
**Primary stack:** React/Vite + Node.js/Express + PostgreSQL/Sequelize + Cloudflare R2 (S3-compatible) + Python reporting + Render

---

## 1. Product Objective

Build a secure multi-tenant business management platform for alcohol businesses that may operate multiple outlets, including:

- Bar + restaurant outlets
- Wine/liquor retail shops
- Mixed outlet portfolios under one owner/tenant

The platform must give a central Super Admin control over tenants, give each Tenant Admin consolidated control over all owned branches, and give branch-level staff only the data and workflows they are authorised to access.

The system must combine inventory, alcohol volume accounting, POS/order capture, waiter accountability, restaurant menu/QR presentation, branch analytics, profit-and-loss visibility, audit trails and downloadable management reports.

---

## 2. Quizmoto Architecture Review — Patterns Reused

The new platform deliberately reuses proven architectural patterns from Quizmoto while replacing Quizmoto-specific domain logic.

### 2.1 Authentication pattern

Quizmoto uses Google Identity on the React frontend and verifies the Google ID token again on the backend with `google-auth-library`. The backend creates/links the local user, then issues its own JWT. The new system will keep this pattern.

Key principles retained:

1. Google credential is never trusted only because the browser received it; backend verification is mandatory.
2. Email must be verified by Google.
3. Google `sub` is stored as the provider identity and linked to the local user.
4. Application JWT is issued only by the backend.
5. Protected requests include the application JWT in the `Authorization: Bearer` header.
6. Live authorisation is re-checked against PostgreSQL, instead of treating the JWT role as permanently authoritative.

### 2.2 Approval pattern

Quizmoto separates an access request from an access grant. A user can be captured as pending, and Super Admin approval creates a live grant. Protected middleware re-checks that grant on each request, so removing a grant invalidates effective access even before an old JWT expires.

The management system extends this into hierarchical memberships:

- Platform Super Admin
- Tenant Admin
- Branch Manager
- Inventory Manager
- Cashier / Sales Operator
- Waiter
- Read-only Auditor (later phase)

Approval is not just `approved=true`; it includes the tenant, branch scope and role.

### 2.3 PostgreSQL pattern

Quizmoto uses Sequelize and supports PostgreSQL in production. Render injects database connection values into the backend service and SSL is enabled for hosted PostgreSQL.

The new system uses PostgreSQL as the source of truth from the beginning. SQLite may be used only for isolated local/unit test scenarios; production must fail fast if it is configured with an unsafe database.

### 2.4 Cloudflare R2 pattern

Quizmoto abstracts object storage behind a local/S3-compatible interface. Cloudflare R2 is S3-compatible and is configured through:

- `STORAGE_DRIVER=s3`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT`
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE`

The same abstraction will be used for:

- Product photos
- Food/menu photos
- Tenant logos
- Branch media
- Generated QR assets when persisted
- PDF/XLSX reports
- Export artifacts

Every object must use a tenant-safe namespace, for example:

`tenants/{tenantId}/branches/{branchId}/products/{productId}/...`

### 2.5 Render deployment pattern

The target deployment mirrors Quizmoto:

- Render Static Site: React/Vite frontend
- Render Web Service: Node/Express backend in Docker
- Render PostgreSQL: relational database
- Cloudflare R2: durable object/media/report storage

The frontend receives the backend URL through `VITE_BACKEND_URL`. Production CORS must be an explicit allowlist.

### 2.6 Reporting pattern

Quizmoto has a report service that serialises database data, invokes a Python report generator for branded PDF/Excel output, and has a Node fallback if Python fails.

The management system will use the same reliability pattern:

`PostgreSQL -> report query -> JSON snapshot -> Python report engine -> PDF/XLSX -> R2 -> report metadata row -> authorised download`

Reports will support English, Hindi and Marathi labels/content.

---

## 3. Multi-Tenant Hierarchy

```text
Platform
└── Super Admin
    ├── Tenant A (Business Owner / Group)
    │   ├── Tenant Admin(s)
    │   ├── Branch 1 — BAR_RESTAURANT
    │   │   ├── Branch Manager
    │   │   ├── Inventory Staff
    │   │   ├── Cashier
    │   │   └── Waiters
    │   └── Branch 2 — WINE_SHOP
    │       ├── Branch Manager
    │       ├── Inventory Staff
    │       └── Sales Operators
    └── Tenant B
        └── ...
```

### Hard tenancy rule

No API route may trust a `tenantId` or `branchId` supplied by the browser by itself. The backend must resolve the authenticated user and verify a live membership for the requested tenant/branch before returning or modifying data.

A tenant user must never be able to enumerate or infer another tenant's records by changing IDs in a URL or request body.

---

## 4. Authentication & Approval Flow

### 4.1 Super Admin

- Super Admin identity is configured by environment variable.
- Super Admin must authenticate with Google.
- Super Admin can create, suspend and reactivate tenants.
- Super Admin can create/invite the first Tenant Admin.
- Super Admin can review pending platform access requests and global audit activity.

### 4.2 Tenant Admin onboarding

1. Super Admin creates tenant.
2. Super Admin adds the Tenant Admin email to an invitation/membership record.
3. Tenant Admin signs in with Google.
4. Backend verifies Google ID token and verified email.
5. User is linked to the matching invitation.
6. Backend issues application JWT.
7. Every protected request re-checks active user + tenant membership.

### 4.3 Branch staff onboarding

1. Tenant Admin/authorised Branch Manager creates a staff assignment.
2. Assignment includes role and one or more branch scopes.
3. Staff signs in with Google using the assigned email.
4. Backend links the user to the pending membership.
5. Active branch memberships determine visible screens and API permissions.

### 4.4 Unsolicited sign-in

If a verified Google user signs in but has no invitation or membership:

- Create/update the platform user.
- Capture a pending access request.
- Do not expose tenant or branch data.
- Show a clear pending approval screen.

### 4.5 Waiter accounts

Foundation authentication remains Google-based for consistency and security. A later phase can add managed waiter PIN/username login for outlets that do not issue Google accounts, but it must still map to a real staff identity and branch membership and must never become a shared generic waiter account.

---

## 5. Roles and Permission Boundaries

| Role | Primary Scope | Core Permissions |
|---|---|---|
| `SUPER_ADMIN` | Platform | Tenants, platform access, global oversight |
| `TENANT_ADMIN` | Tenant | All branches, users, analytics, reports, configuration |
| `BRANCH_MANAGER` | Branch | Branch users, inventory, menu, sales, reconciliation |
| `INVENTORY_MANAGER` | Branch | Products, purchases, stock adjustments, stock counts |
| `CASHIER` | Branch | Retail/bar sales, payments, receipt lifecycle |
| `WAITER` | Branch | Create restaurant orders, add items, submit/mark payment |
| `AUDITOR` | Tenant/Branch | Read-only reports, inventory and audit logs |

Permissions will be expressed as server-side capabilities, not only hidden frontend buttons.

---

## 6. Branch Types

### `BAR_RESTAURANT`

Enabled modules:

- Inventory
- Alcohol ML/pour pricing
- Restaurant/food menu
- Public QR menu
- Tables
- Waiter accounts and waiter POS
- Orders and payments
- Stock deduction
- Profit/loss
- Reports and analytics

### `WINE_SHOP`

Enabled modules:

- Inventory
- Bottle/package sales
- Optional configured ML/loose quantities only where the business workflow permits it
- Sales and payments
- Stock deduction
- Profit/loss
- Reports and analytics

The schema will allow future branch types without migrating every existing tenant.

---

## 7. Alcohol Inventory Model — ML Is the Canonical Measurement

Alcohol inventory must not be modelled only as `number of bottles` because a bar sells portions from opened bottles.

### 7.1 Product example

A whisky SKU may have:

- Bottle size: `750 ml`
- Purchase cost per bottle: `₹400`
- Full bottle selling price: configured independently
- 30 ml selling price: configured independently
- 60 ml selling price: configured independently
- 90 ml selling price: configured independently
- 100 ml/custom selling price: configured independently if the outlet sells it

**Important:** the system must not blindly calculate a 100 ml price by dividing the full bottle price. Portion prices are explicit commercial prices and can contain different margins.

### 7.2 Canonical stock ledger

For volume-based alcohol products, the stock ledger records changes in base ML:

- Purchase +750 ml
- Sale 30 ml -> -30 ml
- Sale 60 ml -> -60 ml
- Full bottle sale -> -750 ml
- Wastage/spillage -> negative ML with reason
- Physical adjustment -> signed ML with manager reason
- Transfer out/in -> paired branch movements

The UI can still show human-friendly values such as `12 bottles + 420 ml open stock`.

### 7.3 Non-alcohol items

Food, mixers and other items can use units such as:

- pieces
- plates
- grams/kg
- ml/litres
- packets

Each product declares its inventory unit and conversion rules.

---

## 8. Inventory & Purchasing

Core records:

- Product catalogue
- Product category
- Brand
- Product image(s)
- SKU/barcode (optional)
- Unit/bottle volume
- Purchase batches
- Suppliers
- Purchase price/cost
- Branch stock balance
- Inventory movement ledger
- Reorder threshold
- Stock count / physical verification
- Wastage/spillage/breakage
- Inter-branch transfer

All stock changes must create immutable inventory movement rows. Directly overwriting a stock number without a ledger entry is prohibited.

---

## 9. Sales / POS

Every sale creates a durable transaction with line items.

Each alcohol line item stores at minimum:

- Product
- Portion/price option
- ML sold
- Quantity
- Unit selling price at time of sale
- Discount
- Tax fields (configurable)
- Revenue
- Cost snapshot / COGS basis
- Inventory movement reference

This historical snapshot prevents old reports from changing when menu prices are edited later.

---

## 10. Restaurant & QR Menu

### 10.1 Public visitor menu

For `BAR_RESTAURANT` branches:

- Branch can create one or more menus.
- Menu supports categories, descriptions, availability, prices and photographs.
- Alcohol menu items display configured portion sizes (30/60/90/custom/full bottle) and respective prices.
- Branch can create table records and QR codes.
- QR opens a public, mobile-first, read-only menu.
- Visitor does **not** place the operational order directly in Phase 1 restaurant flow; the waiter takes the order.

### 10.2 Presentation

Visitor menu should be visual rather than spreadsheet-like:

- Large food/drink photography
- Category chips/tabs
- Search
- Veg/non-veg and dietary markers where relevant
- Alcohol portion cards
- Branch logo/name/contact
- Table identifier when opened from a table QR
- Responsive design for mobile

---

## 11. Waiter POS & Accountability

### Waiter flow

1. Waiter signs in.
2. Waiter sees only assigned branch.
3. Select table or takeaway/walk-in.
4. Create order.
5. Add menu items and alcohol portions.
6. Send/confirm order.
7. Order remains traceable to that waiter.
8. On payment, waiter selects payment method and marks order paid.
9. Paid status is immutable except through manager-controlled correction/refund workflow.

### Malpractice controls

An order must never silently disappear.

- Waiter cannot delete an accepted order.
- Cancellation requires reason; configurable cases require manager approval.
- Every price override/discount is audited.
- Every order created by a waiter remains in a shift reconciliation view.
- Any order still `OPEN`, `SERVED` or `AWAITING_PAYMENT` at shift close is flagged as unresolved.
- Waiter shift cannot be considered clean until each order is `PAID` or manager-approved `CANCELLED/VOIDED`.
- Dashboard shows `Unresolved waiter orders` and the responsible waiter.
- Audit log records who changed status, from what, to what and when.

This detects the intended malpractice scenario without incorrectly assuming every unpaid order is theft; the system flags it for management review.

---

## 12. Profit & Loss

### Revenue

- Paid sales
- Discounts shown separately
- Taxes/service charges shown separately
- Refunds/voids shown separately

### COGS

Initial production method: weighted-average cost by product/base unit, including cost per ML for volume products.

Example:

`weighted cost per ml = current inventory value / current stock ml`

When 60 ml is sold, COGS is the cost-per-ml snapshot multiplied by 60.

Later phase can add FIFO/batch accounting if required by finance policy.

### Gross profit

`Gross Profit = Net Sales Revenue - COGS`

### Operating P&L

The system can optionally record branch expenses (rent, wages, utilities, miscellaneous) to produce an operating P&L. Inventory gross profit and operating P&L must be shown separately so users understand the difference.

---

## 13. Analytics

### Tenant dashboard

- Today's sales across all branches
- MTD sales
- Revenue by branch
- Gross profit by branch
- Top products
- Top alcohol products by ML sold
- Full bottle vs pour sales mix
- Low stock / out of stock
- Wastage/spillage
- Discounts/voids
- Unresolved waiter orders
- Payment method mix
- Branch comparison
- Sales trend
- Inventory value

### Branch dashboard

Same metrics scoped to one branch plus:

- Active tables/orders
- Waiter performance
- Shift reconciliation
- Stock movement timeline
- Reorder list

---

## 14. Python Reports

Required export formats:

- PDF management report
- XLSX detailed workbook

Report families:

1. Daily branch closing report
2. Tenant consolidated daily/monthly report
3. Sales report
4. Product/brand sales report
5. Alcohol ML consumption report
6. Inventory valuation report
7. Stock movement report
8. Purchase report
9. Wastage/spillage report
10. Waiter order and reconciliation report
11. Unpaid/unresolved order report
12. Profit and gross-margin report
13. Branch comparison report
14. Tax/configurable statutory export (later, jurisdiction-specific)

### Languages

- English (`en`)
- Hindi (`hi`)
- Marathi (`mr`)

Business data such as product names remains as entered; report headings, labels, explanatory text and standard summaries are translated.

---

## 15. Core Database Domains

Initial schema domains:

### Identity and tenancy

- `users`
- `access_requests`
- `tenants`
- `tenant_memberships`
- `branches`
- `branch_memberships`
- `audit_logs`

### Catalogue and inventory

- `product_categories`
- `products`
- `product_price_options`
- `suppliers`
- `purchase_batches`
- `inventory_movements`
- `inventory_balances` (derived/cache with ledger as truth)
- `stock_counts`
- `stock_transfers`

### Restaurant/menu

- `menus`
- `menu_categories`
- `menu_items`
- `branch_tables`
- `qr_tokens`

### Orders and payments

- `orders`
- `order_items`
- `payments`
- `refunds`
- `waiter_shifts`

### Finance/reporting

- `branch_expenses`
- `daily_closures`
- `report_jobs`
- `report_artifacts`

All tenant-owned tables include `tenant_id`; branch-owned tables additionally include `branch_id` where appropriate.

---

## 16. API Structure

```text
/api/auth/*
/api/platform/tenants/*
/api/tenants/:tenantId/*
/api/branches/:branchId/*
/api/inventory/*
/api/products/*
/api/purchases/*
/api/sales/*
/api/orders/*
/api/tables/*
/api/menus/*
/api/waiters/*
/api/analytics/*
/api/reports/*
/public/menu/:publicToken
```

Public routes expose only explicitly published menu information. Internal IDs, cost price, stock quantities, tenant staff and analytics must never leak through the public menu API.

---

## 17. Media / R2 Key Design

```text
tenants/{tenantId}/branding/{file}
tenants/{tenantId}/branches/{branchId}/products/{productId}/{file}
tenants/{tenantId}/branches/{branchId}/menus/{menuItemId}/{file}
tenants/{tenantId}/branches/{branchId}/reports/{yyyy}/{mm}/{reportId}.{ext}
```

Database rows store object keys, not R2 credentials.

Upload controls:

- MIME allowlist
- File size limits
- Randomised filenames
- Image dimension normalisation in a later media-processing phase
- Authorisation before upload/delete
- No client-side R2 secret keys

---

## 18. UI / Design System

The product will use an ICICI-inspired banking palette requested for the project, without copying protected logos or branded artwork.

Foundation colour tokens:

- Deep burgundy: `#A51C30`
- Strong orange: `#F58220`
- Deep navy: `#1B2A57`
- Warm off-white: `#FFF9F3`
- Surface white: `#FFFFFF`
- Text charcoal: `#22252A`

Design characteristics:

- Satoshi/Inter-style clean typography
- Burgundy/navy navigation
- Orange action/highlight colour
- High-contrast white cards
- Clean financial dashboards
- Charts designed for operational readability
- Mobile-first waiter screens
- Photo-forward public menu
- No unnecessary heavy bold typography

---

## 19. Delivery Phases

### Phase 0 — Architecture audit & project blueprint

**Status: completed/being documented**

- Review Quizmoto auth, approval, PostgreSQL, R2, Render and report generation
- Define multi-tenant architecture
- Define roles and branch types
- Define inventory measurement model
- Define restaurant/waiter controls
- Define report strategy

### Phase 1 — Foundation / authentication / tenancy

- Repository scaffold
- Render blueprint
- Environment contract
- PostgreSQL/Sequelize boot
- Google sign-in
- Backend JWT
- Live access/membership re-check
- Super Admin bootstrap
- Tenant CRUD
- Tenant Admin assignment
- Branch CRUD
- Branch type
- Branch memberships and roles
- Audit log foundation
- R2 storage adapter
- Base ICICI-inspired frontend shell

**Acceptance:** Super Admin can create a tenant and Tenant Admin; Tenant Admin can create branches and assign staff; users see only authorised tenant/branch data.

### Phase 2 — Product catalogue & inventory ledger

- Categories/products
- Alcohol bottle volume
- 30/60/90/custom/full-bottle price options
- Product photos to R2
- Suppliers/purchases
- Inventory movements
- Stock balance view
- Wastage/spillage
- Low-stock alerts
- Stock count and adjustments

**Acceptance:** every sale/purchase/adjustment can be reconciled through immutable stock movements and ML stock is accurate.

### Phase 3 — Wine shop sales + branch POS

- Retail sales
- Full-bottle and configured quantity options
- Payment methods
- Discounts and manager rules
- Receipt transaction record
- Daily closure
- COGS and gross profit

**Acceptance:** wine shop can run daily sales and produce a closing statement with stock impact and margin.

### Phase 4 — Restaurant/bar menu, tables & waiter POS

- Menus/categories/items
- Food and alcohol items
- Images
- Public menu tokens
- Table QR
- Waiter dashboard
- Order lifecycle
- Paid marking
- Manager cancellation/void
- Waiter shift reconciliation and unresolved order alerts

**Acceptance:** visitor scans QR and views polished menu; waiter records the order; paid order deducts correct inventory and unresolved orders are clearly attributable.

### Phase 5 — Analytics & management dashboards

- Tenant overview
- Branch dashboards
- Sales trends
- Stock value
- ML consumption
- Profit/margin
- Branch comparison
- Waiter metrics
- Anomaly/unresolved order indicators

### Phase 6 — Python PDF/XLSX reporting

- Report snapshot/query layer
- Python branded PDF generator
- XLSX generator
- Node fallback where practical
- R2 artifact storage
- English/Hindi/Marathi report labels
- Report history/download permissions

### Phase 7 — Localisation & operational polish

- UI language switch: English/Hindi/Marathi
- Responsive branch POS
- Mobile waiter UX
- Menu performance/image optimisation
- Accessibility
- Empty/error/loading states

### Phase 8 — Hardening, testing & production deployment

- Tenant isolation tests
- Role matrix tests
- Inventory concurrency tests
- Duplicate-payment/idempotency tests
- Order status transition tests
- Report tests
- R2 tests
- PostgreSQL production tests
- Rate limiting
- Security headers
- Audit coverage
- Backup/recovery runbook
- Render production deployment

---

## 20. Non-Negotiable Engineering Rules

1. PostgreSQL is the accounting source of truth.
2. R2 stores binary artifacts; PostgreSQL stores keys and metadata.
3. Every tenant-owned query is tenant-scoped server-side.
4. Every branch-owned query is branch-authorised server-side.
5. Inventory changes only through a ledger movement.
6. Alcohol stock uses ML as canonical base quantity when the product is volume-based.
7. Portion prices are explicit configurable prices, not assumed fractions of bottle price.
8. Accepted waiter orders cannot be silently deleted.
9. Payment, cancellation, discount, refund and stock adjustment actions are audited.
10. Reports use historical snapshots so later product/price edits do not rewrite history.
11. Money uses integer minor units (paise) or exact decimal types; never JavaScript floating-point arithmetic for accounting totals.
12. Quantity calculations use exact database numeric/decimal types.
13. API writes that can be retried (payment/close/stock transfer) use idempotency protection.
14. Production secrets are environment variables only and are never committed.
15. Public QR menu routes never expose internal cost, inventory or staff information.

---

## 21. Initial Technical Decisions

- **Frontend:** React 19 + Vite
- **Routing:** React Router
- **Authentication UI:** `@react-oauth/google`
- **API client:** Axios
- **Backend:** Node.js + Express
- **ORM:** Sequelize
- **Database:** PostgreSQL
- **Auth verification:** `google-auth-library`
- **Application tokens:** JWT
- **Password hashing (only if optional local waiter auth is added):** bcrypt
- **Object storage:** AWS SDK S3 client targeting Cloudflare R2
- **Reports:** Python primary + Node fallback where feasible
- **PDF/XLSX:** Python reporting libraries plus ExcelJS/PDFKit fallback
- **Deployment:** Render static frontend + Render Docker web backend + Render PostgreSQL

---

## 22. Foundation Completion Definition

The foundation is considered complete when:

- Repository builds locally.
- Backend health endpoint works.
- PostgreSQL connects safely.
- Google login is verified server-side.
- Super Admin is bootstrapped from env.
- Pending unauthorised users cannot access tenant data.
- Super Admin can create tenant and assign Tenant Admin.
- Tenant Admin can create a branch.
- Staff membership can be assigned to a branch.
- Middleware blocks cross-tenant and cross-branch access.
- R2 adapter can put/get/delete an object using environment credentials.
- Render blueprint describes frontend/backend/database services.
- Base frontend shell uses the requested palette.

This foundation is the prerequisite for inventory, POS and restaurant features.