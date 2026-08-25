# Management System

Multi-tenant management platform for bar + restaurant and wine-shop businesses.

## Current status

Phase 1 foundation is in progress. The repository is being built from the proven Quizmoto deployment/authentication patterns while introducing strict tenant/branch isolation and alcohol-specific inventory accounting.

Read the full architecture and phased delivery plan in [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md).

## Target architecture

- **Frontend:** React + Vite static site
- **Backend:** Node.js + Express web service
- **Database:** PostgreSQL + Sequelize
- **Authentication:** Google Identity verified server-side + application JWT
- **Media/artifacts:** Cloudflare R2 through an S3-compatible storage adapter
- **Reports:** Python-first PDF/XLSX reporting with fallback strategy
- **Hosting:** Render Static Site + Render Web Service + Render PostgreSQL

## Foundation modules

- Super Admin
- Tenant management
- Branch management
- Role and branch memberships
- Pending access requests
- Google authentication
- Live membership re-check on protected routes
- Cloudflare R2 adapter
- Audit log foundation
- ICICI-inspired burgundy/orange/navy UI system

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

For PostgreSQL and Cloudflare R2 environment variables, see the `.env.example` files and `render.yaml`.

## Security model

A JWT identifies the signed-in user but does **not** permanently grant tenant/branch authority. Protected APIs re-check the active user and current PostgreSQL memberships. Tenant and branch IDs supplied by the frontend are never trusted without server-side membership verification.

## Inventory principle

Volume-based alcohol stock is tracked in **millilitres** at ledger level. Bottle counts are a presentation/convenience view. 30 ml, 60 ml, 90 ml, custom pours and full bottles each have explicit configurable selling prices.