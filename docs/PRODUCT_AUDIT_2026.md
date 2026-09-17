# Deva Product Audit and Competitive Delivery Plan

**Audit date:** 17 September 2026
**Scope:** Web client, Node/Express API, PostgreSQL models and migrations, reports, Android shell, deployment configuration, the supplied Petpooja Marketplace brochure, Petpooja's public website/app presence, and independent review signals.

## 1. Executive verdict

Deva is a credible early product foundation, not yet a complete hospitality operating system.

Its strongest differentiators are already meaningful:

- tenant and branch isolation with live role checks;
- separate owner, manager, inventory, cashier, waiter, and auditor experiences;
- alcohol stock tracked in millilitres with explicit pour and bottle prices;
- immutable stock movements, weighted cost, COGS, and gross-profit snapshots;
- counter sales, restaurant table orders, manager cancellation, QR menu, analytics, and PDF/XLSX reports;
- English, Hindi, and Marathi foundations.

However, it does **not** yet match the supplied Petpooja marketplace catalogue. Of the 17 brochure areas, Deva has 5 partial equivalents and 12 are absent; none currently match the advertised workflow end to end.

The correct strategy is not to copy Petpooja screen for screen. Deva should become the simplest, most trustworthy operating system for independent and multi-outlet bars, wine shops, and restaurants, with unusually strong liquor control and role-specific UX.

## 2. What was inspected

- Product and architecture documents under `docs/`.
- All server models, migrations, routes, services, security middleware, tests, and deployment configuration.
- All React workspaces, access routing, public menu, style layers, and build configuration.
- Flutter Android shell and CI workflow.
- Production client build and dependency audits.
- Database-backed test suite startup.
- Supplied `Marketplace Brochure 2026 (1).pdf` (20 pages), treated only as reference material.
- Current Petpooja product/pricing/outlet pages, Google Play/App Store presence, Capterra, and G2 summaries.

## 3. Brochure coverage: direct answer

| Brochure capability | Deva today | Verdict | What is required |
|---|---|---|---|
| Captain app | Responsive waiter workspace; Android app only shows placeholder module cards | Partial | Native operational ordering, KOT status, offline queue, notifications, payments |
| Reservation manager | No reservation, waitlist, deposit, guest, or booking-channel model | Missing | Calendar, floor allocation, waitlist, reminders, deposits, no-show tracking |
| Token management | No token/KDS pickup workflow | Missing | Token issue, preparation states, display board, ready notification |
| Zomato/Swiggy reconciliation | No aggregator imports or payout comparison | Missing | Import adapters, commission/tax rules, mismatch workflow, payout reports |
| Business website | Attractive public QR menu only | Partial | Branded domain/site, outlet hours, SEO, direct ordering, tracking, payment |
| Online ordering widget | No embeddable order widget | Missing | Cart, checkout, payment, order acceptance, stock/menu sync |
| Tally/ERP integration | No accounting export/sync adapter | Missing | GST-aware ledger mapping, daily journal export, retries, reconciliation |
| Loyalty | No customer or points ledger | Missing | Customer identity, earning/redemption rules, expiry, campaigns |
| Virtual wallet | No stored-value ledger | Missing | Top-ups, redemptions, refunds, liability reporting, fraud controls |
| Scan & Order | QR opens a read-only menu | Partial | Cart, table verification/OTP, order approval, repeat rounds, online payment |
| QR feedback | No feedback/survey domain | Missing | Bill-linked survey, configurable questions, alerts, guest consent |
| Kiosk | No kiosk mode | Missing | Full-screen ordering, payments, printer/KDS sync, offline support |
| Wireless calling device | No device/event integration | Missing | Device registry, table events, acknowledgements, service-time metrics |
| Dynamic reports | 12 predefined report families with PDF/XLSX | Partial | Custom dimensions, filters, saved views, schedules, drill-down dashboards |
| Tasks/SOPs | No tasks/checklists/evidence workflow | Missing | Recurrence, SOP templates, assignment, proof, approval, escalation |
| Payroll | Roles exist, but no HR/attendance/payroll | Missing | Employee records, shifts, attendance, leave, wage rules, statutory exports |
| Purchase | Suppliers and posted purchases update stock | Partial | PO/GRN, invoice attachments/OCR, returns, payables, approval, vendor analytics |

## 4. Current Deva capability audit

### 4.1 Strong and worth preserving

| Area | Evidence | Assessment |
|---|---|---|
| Multi-tenancy | Tenant/branch models, scoped memberships, live access snapshot | Strong foundation |
| Role isolation | Dedicated waiter and cashier namespaces plus response field stripping | Strong design; keep testing every new route |
| Alcohol control | ML base unit, bottle size, explicit price options, exact stock deduction | Differentiating strength |
| Inventory accounting | Immutable movements, weighted average cost, inventory valuation | Good core; needs stocktake, transfers, batches, returns |
| Sales integrity | Idempotent checkout and historical price/cost snapshots | Good foundation |
| Restaurant accountability | Table lock, waiter ownership, unresolved orders, manager cancellation | Good first version |
| Analytics | Sales, COGS, gross profit, expenses, payment/product mix, branch comparison | Useful owner baseline |
| Reports | 12 report families, PDF/XLSX, history, object storage fallback | Useful but not dynamic |
| Localization | English/Hindi/Marathi UI/report groundwork | Valuable India-market advantage |

### 4.2 Critical operational gaps

| Priority | Gap | Why it blocks real outlets |
|---|---|---|
| P0 | Shift opening/closing and cash drawer reconciliation | Owners cannot prove cashier collections or close a day cleanly |
| P0 | KOT/kitchen production workflow | Restaurant orders do not become a usable kitchen queue |
| P0 | Refunds, returns, voids, discount approval | Paid mistakes and customer returns lack controlled correction paths |
| P0 | GST/business/receipt configuration | Billing is not ready for configurable statutory and invoice needs |
| P0 | Physical stocktake | Bars and wine shops need counted-vs-system variance with approval |
| P0 | Offline/resilient billing | Internet loss can stop the most important workflow |
| P1 | Modifiers, combos, add-ons, recipes/raw materials | Food costing and real menu ordering remain shallow |
| P1 | Split bills, merge/move tables, partial/mixed payments | Core dine-in scenarios are unsupported |
| P1 | Batch/expiry/MRP/case-pack/excise fields | Wine retail and food stock need traceability and packaging depth |
| P1 | Purchase orders, GRN, returns, payables | Purchase posting alone is not procurement control |
| P1 | CRM, loyalty, feedback | No repeat-customer engine or service recovery loop |
| P1 | Reservations/waitlist | Fine-dine front-of-house flow is incomplete |
| P1 | Aggregator order and payout adapters | High-volume delivery operations still need separate systems |
| P2 | Payroll, attendance, tasks/SOPs | Multi-outlet workforce operations are outside Deva |
| P2 | Kiosk, token display, device integrations | QSR scale and hardware automation are outside Deva |

### 4.3 Admin audit

The current platform admin can create/suspend businesses and assign initial admins. The business admin can add branches and staff. This is a good access foundation but not yet an operational admin console.

Missing admin controls include:

- business profile, branding, tax, invoice, licence, hours, and payment settings;
- feature flags and plan/entitlement control;
- branch templates and central menu/price deployment;
- approval queues for discounts, voids, refunds, purchases, transfers, and stock variances;
- audit-log viewer and export;
- device, terminal, printer, KDS, and integration health;
- data import/migration, backup/restore, retention, and account deletion;
- support cases, incident status, onboarding checklist, and training progress;
- webhook/API key management and integration retry queues.

An important inconsistency was corrected during this audit: the frontend exposed tenant operational modules to the Platform Admin even though the backend intentionally rejects that scope. Platform Admin navigation now stays in the control plane.

## 5. UI/UX and colour-system audit

### What works

- The warm cream/copper palette is distinctive and more appropriate for hospitality than copying Petpooja red.
- Role-specific workspaces are the right information architecture.
- The public menu is visually stronger than the internal administrative screens.
- Light and dark themes and responsive layouts already exist.

### What weakens the experience

- The production CSS bundle is about 243 KB and is composed of many late override layers. This makes visual regressions likely and slows deliberate design work.
- Many original components use 8-10 px labels and dense uppercase text. Later overrides improve parts of the app, but the underlying scale is inconsistent.
- Several large JSX files combine data loading, business actions, and long inline layouts, which makes interaction consistency and testing difficult.
- Navigation vocabulary still varies between Stock/Inventory, Sales/Sales & Orders, Restaurant/Table Service, and platform-oriented terminology.
- The web bundle is about 501 KB minified and now triggers the Vite chunk-size warning. Role workspaces should be lazy-loaded.
- The Android app is a secure sign-in and navigation shell; module taps currently show “next module to connect” messages rather than real workflows.
- Google Fonts are runtime dependencies. Core operational screens should self-host/subset fonts or use system fallbacks so typography does not depend on the network.

### Recommended visual direction: “Deva Copper & Ink”

- Primary: deep copper `#C65D17` for actions and active states.
- Ink: `#17211F` for high-contrast navigation and text.
- Ivory: `#FBF7F0` for calm hospitality surfaces.
- Forest: `#2F6F54` for paid/ready/in-stock states.
- Burgundy: `#9E3E38` for destructive/variance states.
- Minimum 14 px body text, 12 px supporting text, and 44 px touch targets.
- Use Montserrat/system sans for operations; reserve Lora for marketing/public-menu display headings.
- One card system, one input system, one table system, and one status vocabulary across roles.
- Prefer workflow states and next actions over dashboard decoration.

The desired UX should be measurably simpler than Petpooja: a new waiter should place an order in under two minutes of training; a cashier should close a shift without a spreadsheet; an owner should find sales, cash variance, and stock risk in three taps.

## 6. Engineering, security, and reliability audit

### Verified

- Client production build passes.
- Server JavaScript syntax checks pass after the first implementation slice.
- Client production dependency audit reports no known vulnerabilities.
- Production startup validates core secrets and explicit CORS origins.
- Helmet, upload size/type checks, JWT verification, live membership checks, and idempotency exist.

### Risks and gaps

- The database-backed suite contains only nine high-value integration tests and requires an external PostgreSQL instance. In this workspace it could not run because PostgreSQL was not listening.
- There are no frontend unit, component, accessibility, or end-to-end tests.
- There is no lint/type-check script or API schema/contract generation.
- Server dependencies report four moderate production advisories in the installed tree, mainly transitive `uuid` and `qs`; upgrades must be tested rather than force-downgraded.
- JWTs and the cached session are stored in browser `localStorage`, increasing the impact of an XSS flaw. Move toward short-lived access tokens plus secure, rotating HttpOnly refresh cookies.
- Thirty-day JWT expiry is long for POS/admin access without server-side session/device revocation.
- No MFA/step-up authentication exists for refunds, payroll, integration keys, or high-value admin actions.
- Audit records exist but there is no admin viewer, tamper-evident export, or alerting.
- No structured application logging, tracing, metrics, error monitoring, or integration health dashboard is present.
- No documented backup restore drill, RPO/RTO, disaster recovery, or data retention policy is present.
- The first inventory migration issues statements outside the migration transaction passed by the runner.
- Several list APIs use fixed limits without cursor pagination, export jobs, or background processing.

## 7. Petpooja public-presence benchmark

### Vendor claims and product breadth

Petpooja publicly positions POSS as an all-in-one restaurant system with quick billing/KOT, inventory, online orders, CRM, multi-outlet management, 80+ reports, 150+ integrations, multiple outlet formats, and a claimed 1,00,000+ restaurants. Its pricing page packages core billing/inventory/reporting/CRM separately from add-ons such as KDS, captain app, loyalty, token management, feedback, website ordering, QR ordering, and dynamic reports.

Its current public portfolio is broader than the supplied brochure: POSS, Attendo (formerly Payroll), Invoice, Tasks, Purchase, offline/on-premise POS, reservation management, kiosk, Scan & Order, and reconciliation. It also sells onboarding, training, dedicated support, hardware compatibility, and 24×7 support as part of the product experience.

Primary references:

- [Petpooja POSS](https://www.petpooja.com/poss)
- [POSS pricing and feature packaging](https://www.petpooja.com/poss/pricing)
- [Bar and brewery POS](https://www.petpooja.com/poss/bar-and-brewery-pos-software)
- [Table Reservation Manager](https://www.petpooja.com/poss/table-reservation-manager)
- [Scan & Order](https://www.petpooja.com/poss/scan-and-order)
- [Offline POS](https://www.petpooja.com/offline-pos)
- [Online order management](https://www.petpooja.com/poss/online-order-management-software)
- [Online order reconciliation](https://www.petpooja.com/poss/online-order-reconciliation)
- [Self-service kiosk](https://www.petpooja.com/poss/self-service-kiosk)
- [Petpooja Tasks](https://www.petpooja.com/tasks)
- [Attendo / Payroll](https://www.petpooja.com/payroll)

### Distribution and trust signals

- Google Play lists the Merchant App at 500K+ downloads and roughly 4.5 stars from about 25.9K reviews.
- Apple's India App Store lists roughly 4.7 stars from about 8.2K ratings.
- Capterra lists 4.6/5 from 37 reviews, with 4.6 scores for ease of use and customer service.
- G2 review summaries commonly praise fast billing, integrated workflows, inventory, and reports.

Independent/reference pages:

- [Google Play - Petpooja Merchant App](https://play.google.com/store/apps/details?id=com.petpooja.billing)
- [Apple App Store reviews](https://apps.apple.com/in/app/petpooja-merchant-app/id1362012013?platform=iphone&see-all=reviews)
- [Capterra reviews](https://www.capterra.com/p/172163/Petpooja-Restaurant-Management-Platform/reviews/)
- [G2 restaurant POS category summary](https://www.g2.com/categories/restaurant-pos)

### Competitive openings for Deva

Public review patterns are not uniformly positive. Recurring complaints include sync/connectivity problems, slow or delayed updates, feature overload and difficult training, navigation regressions, and inconsistent support experiences. Deva should compete on:

1. **Clarity:** smaller role-specific workspaces with guided workflows.
2. **Trust:** explicit offline/retry state, immutable financial/stock ledgers, visible audit trails.
3. **Liquor depth:** ML, open-bottle variance, peg/bottle mix, happy-hour controls, and pilferage alerts.
4. **Transparent packaging:** clear plans and no surprise per-module workflow blockers.
5. **Fast onboarding:** CSV imports, templates, setup checklist, embedded training, and migration support.
6. **Supportability:** diagnostics, sync status, remote logs with consent, and human-readable error recovery.

## 8. Delivery roadmap

### Phase 0 - Evidence, safety, and product discipline (now)

**Outcome:** truthful product surface and a repeatable quality gate.

- Maintain this capability matrix as the source of truth.
- Remove navigation/actions that are not permitted by backend scope. **Started in this audit.**
- Make CI start an isolated PostgreSQL service and run migrations plus integration tests.
- Add ESLint, frontend tests, accessibility checks, and Playwright smoke flows.
- Remediate dependency advisories with compatible upgrades.
- Define shared design tokens and retire override CSS in measured slices.
- Add structured logs, error monitoring, health/readiness checks, and backup/restore documentation.

### Phase 1 - Outlet control essentials (P0)

**Outcome:** a bar, restaurant, or wine shop can open, trade, reconcile, and close a day safely.

- Atomic inter-branch stock transfer. **Backend, UI, audit event, and integration test added in this audit.**
- Physical stocktake sessions with counted/system variance and manager approval.
- Shift open/close, opening float, expected cash, declared cash, variance, handover.
- Controlled refund, return, void, discount, and price-override workflows.
- Configurable business/GST/invoice/receipt/payment settings.
- Receipt/KOT printing abstraction and terminal/printer setup.
- Batch, expiry, MRP, case/pack conversion, supplier return, and transfer-in-transit status.

**Release gate:** one full operating day can be replayed from audit records, money and stock reconcile, and no correction requires database access.

### Phase 2 - Restaurant execution (P0/P1)

**Outcome:** orders flow from guest/waiter to kitchen to payment without side channels.

- KOT tickets, kitchen stations, KDS queue, preparation timers, ready/served states.
- Menu modifiers, add-ons, combos, variants, recipes, and raw-material consumption.
- Split/merge/move table, multiple order rounds, partial and mixed payments.
- Reservation calendar, waitlist, deposits, reminders, table assignment, and no-show reporting.
- Operational waiter/captain mobile screens and push notifications.

### Phase 3 - Guest growth and online channels (P1)

**Outcome:** outlets own more customer relationships and reconcile external channels.

- QR cart/order/pay with OTP/table verification and manager acceptance rules.
- Direct-order website/widget and branded branch pages.
- Customer/consent/visit profiles, loyalty points, offers, wallet, and feedback.
- Aggregator adapter framework, menu availability sync, order intake, and payout reconciliation.
- Tally/accounting export adapter with retry and reconciliation logs.

### Phase 4 - Procurement, workforce, and multi-outlet excellence (P1/P2)

**Outcome:** owners manage cost, people, and standards across the group.

- PO, approval, GRN, invoice attachment/OCR, debit note, payable, vendor comparison.
- Tasks, recurring SOPs, evidence, approvals, escalation, and branch scorecards.
- Attendance, rosters, leave, payroll inputs, advances, and export/integration layer.
- Central menu/recipe/price templates, central kitchen, commissary dispatch, franchise controls.
- Saved/custom reports, schedules, alerts, forecast, and anomaly detection.

### Phase 5 - Reliability, hardware, and scale (P0 throughout)

**Outcome:** Deva remains usable during rush hour and recoverable after failure.

- Offline-first billing queue with conflict rules and visible sync state.
- Terminal/device/printer/KDS registry and health monitoring.
- Kiosk/token/calling-device integration points.
- Load tests, failover tests, restore drills, RPO/RTO targets, SLOs, and incident playbooks.
- Public API, webhooks, API keys, rate plans, and partner sandbox.

## 9. Next implementation sequence

Work should continue in this exact order:

1. Finish Phase 0 CI/test environment and resolve dependency/security findings.
2. Add stocktake sessions on top of the movement ledger.
3. Implement shift and day-close reconciliation.
4. Implement refund/return/void controls.
5. Add configurable invoice/GST/receipt settings.
6. Build KOT/KDS before adding more guest-facing ordering channels.

This sequence prevents a visually impressive but operationally unsafe product. Each slice must ship with migrations, scoped APIs, audit events, role-specific UI, integration tests, and owner-facing reports.
