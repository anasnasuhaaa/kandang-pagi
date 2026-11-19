# Stage 02 Report — Database and authentication

## Status and scope

- Stage 02, completed 2026-11-19 Asia/Jakarta. Starting commit `fff0439`.
- Stage commit is the commit that added this report. Resolve it with `git log -1 --format=%h -- codex/progress/reports/STAGE_02_REPORT.md`.
- User-supplied changes to the implementation pack and AGENTS.md were preserved.

## Completed work

- [x] 37-table Drizzle PostgreSQL schema covers accounts, immutable event origins, livestock, feed, egg inventory, health, finance, receipts, reseller units and ledgers, corrections, audit, and idempotency.
- [x] Better Auth 1.7.20 using the version-matched Drizzle adapter. Supports sign-in and sign-out and rejects HTTP registration. Servers resolve role and reseller workspace from the active session.
- [x] Guarded first-admin CLI, admin account management, manual activation/reset links, suspension, role changes, and session revocation. Login and settings UI in Indonesian with inline Zod messages.
- [x] Profile, per-account theme and password settings, searchable/paginated account table and safe account audit.
- [x] Shared service authorization, audit, locking and idempotency primitives. Data routes render only after session and module authorization.

## Files changed and architecture

- Schema `db/schema`, lazy postgres.js connection `db/index.ts`, explicit CLI scripts `scripts/`, migration `db/migrations/0000_married_lizard.sql` and generated metadata.
- `server/auth/config.ts`, `server/auth/permissions.ts`, `server/auth/accounts.ts` and App Router auth endpoints. Better Auth uses its Admin createUser and reset/change password APIs. Its hashed verification identifier is paired with an application token digest bound to purpose, user and expiry.
- Shared modal/form components and `/masuk`, `/akses`, `/pengaturan`. Role-scoped workspace navigation and routes.
- Farm cash origin uniqueness is enforced by event primary key. Reseller composite keys enforce same-space foreign keys. Stock and population historical replay logic is staged for their modules.

## Business and security verification

- Decisions A009 and A010 document integer grams/IDR, tenant separation, advisory locking, token expiry and the transaction boundaries.
- Login/session, disabled registration, one-time bootstrap and concurrency, purpose binding, expiry, replay, revocation, password handling and scoped reseller identity are tested against real PostgreSQL.
- Only the issuing Administrator receives the activation/reset link. The URL fragment keeps the token out of navigation request URLs. Prefetch is safe and the page uses no-referrer. Test fixtures checked both token tables and audit for plaintext.
- PostgreSQL reports that a generated reseller FK name exceeds 63 bytes. It applies the constraint with the standard truncated identifier. Schema regeneration reported no changes.

## Tests / checks — actual results

| Command / scenario | Result | Notes |
|---|---|---|
| `npm run db:migrate` | Exit 0 | Fresh disposable PostgreSQL 18.6. |
| `npm run db:generate` | Exit 0 | Subsequent generation reported no schema changes. |
| `npm run db:bootstrap-admin -- --password-stdin` | Exit 0, then exit 1 | Random test password over stdin. First admin created, second refused. |
| `npm run lint` and `npm run typecheck` | Exit 0 | No lint/type failures. |
| `npm test` | 4 passed | Jakarta boundaries, exact inputs, shared validation, role map. |
| `npm run test:integration` | 8 passed | Parent suite and 7 PostgreSQL subtests. |
| `npm run build` with real-font temporary mirror | Exit 0 | Turbopack compiled and generated 16 static outputs including partial shells. |
| `npm run test:e2e` | 6 passed in 25.5 s | Four widths, both themes, auth, mobile account creation, activation link preview, ABK bypass denial and logout. |

## Limitations, risks and blockers

- Neon production/dev endpoint separation remains to be verified during release preparation. Tests used local PostgreSQL and no production credentials.
- Google Fonts connectivity workaround from Stage 01 was used for this build. No font override added to tracked application or environment template.
- The repository at this stage has operational route placeholders and a real Settings module. Stage 03 builds the dashboard and population workflows.

## Handoff to Stage 03

- Reuse `requireRole`, `requireModule`, `lockScope`, `recordOnce`, and `writeAudit`. Farm ledger scaffolding is in `db/schema/farm.ts`.
- Configure `DATABASE_URL`, `DATABASE_TARGET`, `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET` and CLI name/email in the local environment. Test suites use a fresh local `TEST_DATABASE_URL`.
- Sanitized first-admin sequence is `npm run db:migrate` then `npm run db:bootstrap-admin` at an interactive terminal. README documents manual release flags and secure configuration.
- Review flock placement, business-date replay, immutable original baseline and mixed-harvest attribution before implementing Stage 03.

## Git and release safety

- [x] Report, project state and decisions updated.
- [x] Staged paths reviewed for secrets and unrelated changes.
- [x] Local stage commit created after checks.
- [x] No Git push, production migration or deployment.
