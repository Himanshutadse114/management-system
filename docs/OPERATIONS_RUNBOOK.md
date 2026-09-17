# Operations Runbook

## Service checks

- Liveness: `GET /health` proves the process can answer HTTP and returns the request ID.
- Readiness: `GET /ready` proves PostgreSQL is reachable. Remove an instance from traffic while this returns `503`.
- Every API response returns `X-Request-Id`; search structured completion logs by that value before escalating.

## Backup policy

- PostgreSQL is the system of record. Run an encrypted `pg_dump --format=custom` at least daily and before every production migration.
- Retain daily backups for 35 days and monthly backups for 12 months in a separate account/region with restricted restore access.
- Object storage containing product/menu images must have versioning and lifecycle protection enabled; the database only stores object keys.
- Target RPO: 24 hours until continuous recovery is configured. Target RTO: 4 hours.

## Restore drill

1. Create a new empty database; never restore over the active production database.
2. Restore with `pg_restore --no-owner --no-privileges --exit-on-error`.
3. Verify `schema_migrations`, tenant count, branch count, paid-order totals, inventory balance totals, and audit-log continuity.
4. Start one application instance against the restored database and check `/ready`.
5. Test a read-only login and generate one management report. Do not send messages or payments from a drill environment.
6. Record start time, completion time, backup timestamp, row-count checks, issues, and the operator.

CI performs an isolated dump/restore on every change and queries the restored migration ledger. Production owners must run and record a production-like restore drill quarterly.

## Incident response

1. Declare the incident owner and timestamp; preserve request IDs, database logs, deployment SHA, and affected tenant/branch IDs.
2. For integrity risk, disable writes or remove the affected instance from traffic before investigating. Do not manually edit inventory balances or paid orders.
3. Classify scope: authentication, tenant isolation, payment, stock, device/print queue, or availability.
4. Use audit logs and immutable inventory movements to reconstruct sensitive changes.
5. If rollback is safe, deploy the last known-good application version. Database migrations are forward-only; restore to a new database if data recovery is required.
6. Validate tenant isolation, a sample order, stock totals, shift cash, reports, and readiness before reopening writes.
7. Document root cause, customer impact, recovery point, corrective actions, and owners.

## Escalation signals

- Any cross-tenant response, unexplained stock balance/version change, duplicate payment, or missing audit event is severity 1.
- Readiness failures over five minutes, print queue backlog over 15 minutes, or billing failures across a branch are severity 2.
- Include the request ID and exact UTC time in every escalation.

## Reliability objectives

- Monthly availability SLO: 99.9% for authenticated billing APIs; public menu target: 99.5%.
- Server-side write latency target: p95 under 750 ms and p99 under 2 seconds under the supported outlet load. CI runs a lightweight concurrent health check; production must run a full staged load test before large rollouts.
- Billing recovery: counter checkout uses a device-local, idempotent offline queue when the network is unavailable. The cashier sees the pending count and can retry. Server validation remains authoritative, so stock or policy conflicts stay visible for manager resolution instead of being silently overwritten.
- Conflict rule: identical idempotency keys replay the original result. A different offline sale never replaces an existing order, inventory movement, payment, or shift.
- Webhook deliveries use signed payloads, exponential retry, an eight-attempt dead-letter state, and a visible retry log.
- Current disaster-recovery targets are RPO 24 hours and RTO 4 hours. Tighten the RPO only after point-in-time database recovery and object-store replication are enabled and drilled.

## Offline billing recovery

1. Keep the cashier device open. Pending offline sales are stored only on that browser profile and sync automatically after the `online` event.
2. Do not clear site data or move to another device while the pending count is non-zero.
3. If a queued sale is rejected after reconnection, preserve its idempotency key and resolve stock, shift, or price policy before retrying.
4. Compare synced receipt numbers to the physical/UPI/card record before closing the shift.
5. Escalate any duplicate-looking receipt or payment; never manually edit the order or inventory tables.

## Partner API and webhook operations

- Issue sandbox keys first and give each partner the minimum scopes. Secrets are shown once; revoke and replace them if lost.
- Live keys must have an expiry and a named owner. Review `lastUsedAt` and revoke dormant credentials quarterly.
- Webhook endpoints must use HTTPS in production. Investigate `FAILED` deliveries by request ID and partner response before using Retry.
- Partner order writes are idempotent by external order ID and require outlet acceptance before fulfillment.
