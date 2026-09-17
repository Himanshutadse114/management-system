# Deva Delivery Tracker

This is the execution source of truth for the competitive product program defined in `PRODUCT_AUDIT_2026.md`.

Status values: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `COMPLETE`.

## Program status

| Phase | Outcome | Status |
|---|---|---|
| 0 | Quality, security, observability, truthful product surface | COMPLETE |
| 1 | Outlet control essentials for a complete trading day | COMPLETE |
| 2 | Restaurant execution from order to kitchen to payment | COMPLETE |
| 3 | Guest growth, direct ordering, and external channels | COMPLETE |
| 4 | Procurement, workforce, and multi-outlet excellence | COMPLETE |
| 5 | Offline reliability, hardware, public APIs, and scale | COMPLETE |

## Phase 0 - Quality and safety gate

- [x] Repository-wide product/UX/security audit.
- [x] Competitive benchmark against supplied brochure and current public presence.
- [x] Remove Platform Admin operational navigation that backend policy rejects.
- [x] PostgreSQL-backed GitHub Actions test service.
- [x] Client production build in CI.
- [x] Server syntax verification in CI.
- [x] Production dependency audit in CI.
- [x] Secure dependency overrides for vulnerable `qs` and `uuid` versions.
- [x] Request IDs and structured HTTP completion logs.
- [x] Separate liveness and database readiness endpoints.
- [x] Make the inventory core migration participate in its transaction.
- [x] Lazy-load web workspaces and public-menu/admin-only code.
- [x] Frontend component/accessibility tests.
- [x] End-to-end smoke tests for owner, manager, waiter, cashier, and public menu.
- [x] Backup/restore and incident runbook plus isolated CI restore drill.
- [x] Consolidate UI tokens and remove conflicting override layers.

**Exit gate:** CI proves builds, migrations, critical commerce tests, reports, accessibility smoke tests, and production dependency policy.

## Phase 1 - Outlet control essentials

- [x] Atomic inter-branch stock transfer with dual ledger entries and audit event.
- [x] Physical stocktake session, line counts, variance, approval, and posting.
- [x] Cashier/waiter shift open, handover, and close.
- [x] Expected vs declared cash and variance approval.
- [x] Refund/return posting, manager-approved void/cancellation, discount reasons, and price-override controls.
- [x] Branch GST/legal identity, invoice/receipt, payment-method, tax and operating-day settings.
- [x] Receipt/KOT printer and terminal registry with idempotent observable print queue.
- [x] Batch, expiry, MRP, case/pack conversion, supplier return, and dispatch/receive in-transit transfers.

**Exit gate:** a bar, restaurant, and wine shop can each complete and reconcile a full day without database intervention or spreadsheets.

## Phase 2 - Restaurant execution

- [x] KOT tickets by order round and BAR/KITCHEN routing with auditable status transitions.
- [x] Responsive KDS queue with station columns, preparation timers, ready and completion states.
- [x] Menu modifiers, add-ons, combos, variants, recipes, and raw-material consumption with KOT snapshots.
- [x] Split/merge/move table and repeat order rounds, preserving inventory and kitchen history.
- [x] Partial and mixed payments across counter and restaurant settlement, with exact-total validation.
- [x] Reservation calendar, waitlist, deposits, table assignment, no-shows, and automated in-app reminders.
- [x] Operational captain/waiter mobile screens with kitchen-ready and cashier bill notifications.

**Exit gate:** every restaurant order can travel from guest/waiter to kitchen to settlement with no verbal or paper-only state transition.

## Phase 3 - Guest growth and channels

- [x] QR cart/order/pay with table verification and acceptance controls.
- [x] Direct-order website and embeddable ordering widget.
- [x] Customer consent, visit history, CRM, loyalty points, offers, wallet, and feedback.
- [x] Aggregator adapter contract and order/menu synchronization.
- [x] Zomato/Swiggy payout import and reconciliation workflow.
- [x] Tally/accounting export adapter with retry and reconciliation logs.

**Exit gate:** outlets can accept direct and integrated digital orders, retain consenting customer relationships, and reconcile payouts.

## Phase 4 - Procurement, workforce, and group control

- [x] Purchase requisition, PO, approval, GRN, invoice attachment/OCR, debit note, and payable.
- [x] Vendor price comparison and performance analytics.
- [x] Tasks, recurring SOPs, evidence, approvals, escalation, and branch scorecards.
- [x] Employee records, roster, attendance, leave, payroll inputs, advances, and exports.
- [x] Central menu/recipe/price templates and central-kitchen dispatch.
- [x] Saved/custom reports, schedules, alerts, forecasts, and anomaly detection.

**Exit gate:** a multi-outlet owner can control purchasing, people, operating standards, and reporting centrally.

## Phase 5 - Reliability, hardware, and ecosystem

- [x] Offline-first billing queue, conflict rules, retries, and visible sync state.
- [x] Terminal, printer, KDS, kiosk, token display, and calling-device registry.
- [x] Device and integration health monitoring.
- [x] Load/failover tests, SLOs, RPO/RTO targets, and restore drills.
- [x] Public API, webhooks, API keys, rate plans, and partner sandbox.
- [x] Production-ready operational Android workflows for each supported role.

**Exit gate:** critical billing continues through network loss, integrations are observable/recoverable, and supported partners can integrate safely.

## Definition of done for every feature

1. Database migration and rollback/recovery consideration.
2. Tenant and branch scope enforcement.
3. Least-privilege role mapping.
4. Idempotency for retryable writes.
5. Immutable audit event for sensitive actions.
6. Responsive and accessible role-specific UI.
7. API/integration tests including failure and cross-tenant cases.
8. Analytics/report implications included.
9. Operational documentation and support diagnostics.
10. Successful production build and CI gate.
