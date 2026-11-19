# Stage 07 Report — Integration, security and release preparation

## Status and scope

- Stage 07 completed 2026-11-19, Asia/Jakarta. Starting commit `7a24ceb`.
- Resolve the local stage commit with `git log -1 --format=%h -- codex/progress/reports/STAGE_07_REPORT.md`.
- The user's edits to `AGENTS.md` and the supplied implementation pack were preserved. The release checklist is included with this stage.

## Completed work

| Module | Verified workflow |
|---|---|
| Dashboard | Dated population, HDP/HHP and FCR summaries, week trends and incomplete observations. |
| Populasi Ternak | Barns, original flock placement, mortality, cull, exit, transfers, historical balances and reversals. |
| Pakan | Products, purchase, mixing, warehouse issue, physical closing remainder, waste and measured consumption. |
| Produksi Telur | Count and weighed mass, flock or mixed-barn harvest, partial sorting, category stock and full-payment sale. |
| Kesehatan & Vaksin | Incidents, treatment and quarantine status, vaccine schedules and overdue status. |
| Keuangan | Opening cash, manual entries, linked paid transactions, private proof and dated corrections. |
| Reseller | Independent stock, unit versions, paid sales, cash, reversals and own workspace report. |
| Laporan | Dated farm operational, authorized finance and reseller reports with downloadable PDFs. |
| Pengaturan | Profile, password, theme, role/state management, manual activation/reset links, audit and the correction queue. |

The audit covered live summaries, table controls, role-appropriate actions, loading and empty states, and nine sidebar destinations scoped by role. Chromium exercised the protected pages and mobile workflows using actual PostgreSQL records.

## Files and architecture

- `app/api/bukti/[cashId]/route.ts` now relays authorized private ImageKit bytes over the application origin. It sends private/no-store headers, enforces an upstream timeout and media type, and rejects redirects.
- `server/services/receipts.ts` records completed orphan removal in audit. `next.config.ts` adds frame, content-sniffing and referrer protection, including the manual account link.
- `Dockerfile` and `compose.yaml` provide Node 22 with optional private PostgreSQL 17 development. Runtime credentials are excluded from the image context. `.env.example`, `README.md` and `codex/RELEASE_RUNBOOK.md` document development and manual release.
- No added migrations. Reviewed `0000_married_lizard.sql`, `0001_zero_harvest_observation.sql` and `0002_finance_receipts_and_corrections.sql`. PostgreSQL truncates one generated constraint identifier to its standard limit when applying the migration. All three migrations and the constraint worked in the test databases.

## Business and security verification

- **HDP.** Divide eligible egg units by the sum of matching end-of-day live birds. The two-day fixture uses 950 eggs and 1,200 live-bird days, or about 79.17%. The missing third day is marked incomplete. **HHP** uses the original hen-housed baseline per eligible day, 950 ÷ 2,000 or 47.5% in the same fixture. Mixed harvest counts at barn and farm level. Its individual flock result is unavailable.
- **FCR.** Divide measured feed consumption by actual weighed egg mass, including defects. The fixture uses 5 kg opening plus 120 kg issued, less 3 kg waste and 15 kg remaining, for 107 kg consumed. With 25 kg weighed eggs, FCR is 4.28. Checks cover missing and stale closings, zero egg mass, incomplete weighing and rescoped flock/barn reports.
- A barn transfer preserves population and the original flock baseline. History replays recorded dated events and approved corrections. A report test returns 75 birds on the earlier date before a subsequent five-bird decline.
- Inventory and cash safeguards cover parallel egg sales and warehouse issues, single linked income or expense, duplicate requests, historical negative stock checks, and administrative reversals. Starting with 40 kg, one of two simultaneous 30 kg releases succeeds. Retrying that request replays its result, leaving 10 kg in the warehouse, 30 kg in the barn, and no expense from the transfer. Opening cash, income, expense and cash balance have separate meanings in the interface.
- Reseller packaging edits preserve old factors, with 24 and 20 butir versions on different dates. Kilograms require actual weight and a separate count. Cross-tenant accesses and attempts to use a foreign unit or reverse a foreign event were rejected. Report and PDF tenant scope comes from the authenticated session.
- Verified concurrent first bootstrap, disabled public signup, account link expiry/use and purpose binding, suspension/role invalidation, session revocation after reset, origin rejection and direct ABK denial for finance PDF and receipts. The owner can read farm finances without mutation access. ABK correction requests require Administrator approval. Inspection confirmed audit details exclude account tokens and signed media URLs.
- Decisions A018 and A019 record the private delivery, dependency and Docker choices.

## Tests and checks

| Command or scenario | Actual result |
|---|---|
| `npm run lint` | Exit 0. |
| `npm run typecheck` | Exit 0. |
| `npm test` | 15 passed, 0 failed. |
| `npm run test:integration` | 30 passed, 0 failed, PostgreSQL 18.6. |
| `npm run test:e2e` | 10 Chromium scenarios passed. Includes role-specific journeys, ABK requests, finance and reseller PDF downloads, and account reset. |
| Chromium responsiveness and accessibility | 320, 375, 768 and 1440 px without page overflow. Keyboard navigation and focus restoration verified. Dashboard axe WCAG checks reported zero violations in light and dark themes. Manually inspected desktop dashboard and mobile egg production screenshots. |
| `npm run build` | Exit 0. The production bundle compiled with all nine protected modules and API routes. Used a temporary local mirror of actual Poppins WOFF2 assets after direct Google Fonts timeouts. |
| `npm run db:generate` | No schema changes. |
| `npm run db:migrate` | Three migrations on fresh test PostgreSQL 18.6 and Docker PostgreSQL 17. Rerun on the user's development database succeeded. Verified 37 public tables, three migration records and one active Administrator on that database. |
| `pg_dump --format=custom` and `pg_restore --exit-on-error` | Exit 0 using isolated databases. Restore contained 37 public tables, three migration records and 36 fixture farm events. |
| `npm run test:imagekit` | Live provider accepted valid PNG media with two versions and one active. Signed access returned HTTP 200 and unsigned access HTTP 403. Both test files were deleted. PostgreSQL fixture checks cover type/size limits and orphan recovery. |
| Authorized receipt HTTP smoke | Real PNG served to Pemilik with HTTP 200 and no redirect. ABK received 403, and an unauthenticated request received 401. The test asset was deleted. |
| Docker Compose build, startup and application smoke | Built the development image after retrying the npm registry failure with integrity-checked public npm cache entries. Isolated services became healthy. Node 22 ran migrations, bootstrap succeeded once, and login and authenticated dashboard returned HTTP 200. No environment file was present in the image. |
| `npm audit --json` | Zero reported vulnerabilities after scoped tooling dependency fixes. |

## Release handoff

- For local use, use the already migrated development database in `.env.local`. `npm run dev` starts the app. An empty fresh development database requires `npm run db:migrate` and `npm run db:bootstrap-admin` with `BOOTSTRAP_ADMIN_EMAIL` and `BOOTSTRAP_ADMIN_NAME` set privately.
- Configuration names are listed in `.env.example`. Keep `BETTER_AUTH_SECRET` and `IMAGEKIT_PRIVATE_KEY` server-side. Production must have a separate `DATABASE_URL` and an HTTPS `BETTER_AUTH_URL` matching the Vercel Production origin.
- The [release runbook](../../RELEASE_RUNBOOK.md) covers explicit migrations, bootstrap, privacy settings, smoke checks, backup and recovery. The [final release checklist](../../checklists/FINAL_RELEASE_CHECKLIST.md) distinguishes locally verified checks from production checks during manual release.
- Actual Vercel hostname/cookies and production Neon credentials and separation await manual verification. The ImageKit named-transformation policy also needs account-level confirmation before release. Provider tests covered private assets at the base delivery URL.
- This stage uses the production Next.js build to test Chromium. The temporary Poppins mirror was a workstation connectivity workaround. Normal builds use the configured Google Fonts integration.
- PDF periods are limited to 90 days with up to 300 rows per section and explicit truncation notes. Linked corrections that cannot be represented as field replacements use a validated cancellation followed by a corrected re-entry.

## Git and release safety

- [x] Stage report, project state, decisions and release checklist updated.
- [x] Reviewed staged paths and changes for secrets and unrelated files.
- [x] Local stage commit created after checks passed.
- [x] No Git push, production database migration or deployment performed.
