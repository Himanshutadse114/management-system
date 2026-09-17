# Deva Partner API

## Authentication and environments

Create a sandbox key in **Ecosystem**. Send it in `X-API-Key`; secrets are displayed once. Sandbox order writes validate the request without changing live outlet data. Live keys are separately issued, scoped, expiring credentials.

Base path: `/api/partner/v1`

- `GET /catalogue` requires `catalogue:read` and returns the branch menu, variants and modifiers.
- `POST /orders` requires `orders:write`. `externalOrderId` is the idempotency identity, and each line contains `priceOptionId` plus an integer `quantityUnits`.

Partner orders enter the outlet’s guest-order acceptance queue. Replaying the same external ID returns the original request. Server catalogue prices are authoritative.

## Webhooks

Admins register HTTPS endpoints in **Ecosystem**. Each delivery includes `X-Deva-Event` and `X-Deva-Signature: sha256=<hex HMAC>`. Verify the HMAC over the exact raw body using the signing secret shown at creation.

Failed deliveries retry with exponential backoff and stop after eight attempts. Admins can inspect the error and explicitly retry. Private-network targets are rejected to reduce SSRF risk.

## Safety contract

- Never put API keys in browser/mobile client code.
- Treat minor-unit money fields as integer strings.
- Use a unique, stable `externalOrderId` for every order.
- Do not prepare an order until the outlet accepts it.
- Respect `429` and retry with backoff; do not change the external order ID during a retry.
