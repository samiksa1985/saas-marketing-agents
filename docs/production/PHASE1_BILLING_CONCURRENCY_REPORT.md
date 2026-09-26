# Phase 1 Billing Concurrency Report

## Test design

The disposable harness seeds:

- Tenant A with an active plan entitlement of `10` and organization override of `3`.
- Tenant B with no subscription.
- A `phase1_app` role that is neither superuser nor `BYPASSRLS`.

It then proves that the persistent authority adapter resolves the tenant A override, defaults tenant B to deny, and writes the authoritative limit to PostgreSQL. It runs 20 concurrent workers for 100 unique attempts against a limit of 100, asserts the 101st is quota-rejected, and runs 20 concurrent replays of one idempotency key.

Required postconditions:

| Assertion            | Required value                                     |
| -------------------- | -------------------------------------------------- |
| Unique attempts      | 100 consumed; counter used = 100; events = 100     |
| Overshoot attempt    | Rejected with quota exhaustion                     |
| Replay requests      | exactly 1 consumed; 19 duplicate; counter used = 1 |
| Missing subscription | `DEFAULT_DENY`                                     |
| Override             | `ORGANIZATION_OVERRIDE`, numeric value 3           |

Fresh disposable PostgreSQL evidence first stopped before billing SQL because
the old harness passed a raw postgres.js transaction into `drizzle(...)`. That
driver-construction defect is repaired: the harness now creates Drizzle from
its outer client and supplies the resulting tenant-scoped Drizzle transaction
to the persistent billing repository and atomic usage store.

The next real run reached the tenant-A authority path and then failed at the
postgres.js Bind stage because the production atomic usage adapter passed its
period-boundary `Date` objects directly into raw SQL. The adapter now binds
those values through the canonical Drizzle timestamp columns, producing the
required ISO driver values without changing the `date`-mode schema contract.
The final real run passed authority before reaching the separate concurrency
test. Concurrency, idempotency, rollback, and cross-tenant isolation are all
**REAL EXECUTION PASS** with 20 workers, 100 attempts, and 20 idempotency
replays. No provider call, payment action, production migration, deployment, or
production billing mutation is part of this test. See
`PHASE1_POSTGRES_FINAL_EVIDENCE.md`.
