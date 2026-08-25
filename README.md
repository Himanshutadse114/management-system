# Management System

Multi-tenant management platform for bar + restaurant and wine-shop businesses, built with the Quizmoto-style responsive application shell and an orange-accent operations theme.

## Current status

Core delivery phases are implemented:

- **Phase 1:** Google authentication, live RBAC, tenants, branches, PostgreSQL, R2/Render foundation
- **Phase 2:** ML-based inventory, products, explicit portion pricing, suppliers, purchases, weighted costing and immutable stock ledger
- **Phase 3:** Wine-shop/counter POS with payment capture, exact stock deduction, COGS and gross-profit snapshots
- **Phase 4:** Restaurant tables, public QR menu, waiter orders, payment lifecycle, unresolved-order controls and manager cancellation
- **Phase 5:** Consolidated/branch analytics, gross profit, operating P&L, expenses, payment mix, product mix, wastage and waiter reconciliation
- **Phase 6:** Python-first PDF/XLSX reporting with secure report history and English/Hindi/Marathi output
- **Phase 7:** Shared English/Hindi/Marathi UI language layer, persistent language selection and localized core shell/public menu
- **Phase 8:** PostgreSQL-backed CI tests for tenant isolation, idempotent checkout, ML stock accuracy, restaurant table locking, cancellation restoration and demo-data integrity

Read the architecture in [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md).

## Technology

- **Frontend:** React 19 + Vite
- **Backend:** Node.js 22 + Express
- **Database:** PostgreSQL + Sequelize
- **Authentication:** Google Identity verified server-side + application JWT
- **Media/artifacts:** Cloudflare R2 through an S3-compatible storage adapter
- **Reports:** Python-first PDF/XLSX pipeline with Node fallback
- **Hosting:** Render Static Site + Render Docker Web Service + Render PostgreSQL

## Demo tenant

An idempotent demo dataset is automatically created after database migrations unless `DEMO_SEED_ENABLED=false` is set.

- **Tenant Admin / Owner:** `himanshutadse1272@gmail.com`
- **Branch Manager:** `cybetantforum@gmail.com`
- **Waiter:** `tadsehimanshu127@gmail.com`
- **Tenant:** Demo Hospitality Group
- **Restaurant:** Demo Social Bar & Kitchen (`DEMO-RST`)
- **Wine Shop:** Demo Cellars Wine Shop (`DEMO-WS`)

The demo includes alcohol stock and explicit 30/60/90/full-bottle pricing, suppliers, purchases, six restaurant tables with QR tokens, wine-shop sales, paid and unresolved waiter orders, expenses, wastage, analytics data and a full food menu. Food sections include starters, main course, rice & biryani, breads, bar snacks, mocktails/beverages and desserts.

The three demo users are created by email with `googleId` unset. On first successful Google sign-in, the backend links the verified Google identity to the existing demo user and the assigned role is immediately available.

## Local setup

### Backend

```bash
cd server
cp .env.example .env
npm install
npm run dev
```

### Frontend

```bash
cd client
cp .env.example .env
npm install
npm run dev
```

## Security model

A JWT identifies the signed-in user but does **not** permanently grant tenant/branch authority. Protected APIs re-check the active user and current PostgreSQL memberships. Tenant and branch IDs supplied by the frontend are never trusted without server-side membership verification.

Accepted restaurant orders are not silently deleted. Unresolved orders remain visible until paid or manager-cancelled, and manager cancellation posts compensating stock movements while preserving the audit history.

## Inventory principle

Volume-based alcohol stock is tracked in **millilitres** at ledger level. Bottle counts are a presentation/convenience view. 30 ml, 60 ml, 90 ml, custom pours and full bottles each have explicit configurable selling prices. Money is stored in integer minor units and weighted costs use exact PostgreSQL numeric values rather than JavaScript floating-point accounting.
