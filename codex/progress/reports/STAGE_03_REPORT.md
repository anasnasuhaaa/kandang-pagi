# Stage 03 Report — Dashboard and livestock population

## Status and scope

- Stage 03, completed 2026-11-19 Asia/Jakarta. Starting commit `fe243f6`.
- Stage commit is the commit that added this report. Resolve it with `git log -1 --format=%h -- codex/progress/reports/STAGE_03_REPORT.md`.
- User-authored implementation pack and AGENTS.md edits preserved.

## Completed work

- [x] Administrator creates or deactivates barn masters with a recorded reason. An occupied barn cannot be deactivated. Administrator and ABK can open or place a separate flock and post mortality, cull, exit, or whole-flock transfer.
- [x] Business-day replay and immutable hen-housed baseline. Advisory locking, idempotency, transaction audit, and Administrator reversal with validation of downstream history.
- [x] Population views with date/barn/flock filters, search, paginated tables and contextual forms. Authenticated dashboard with population, flocks, deaths, real trend and explicit incomplete production/feed status.
- [x] HDP and HHP helpers use weighted denominators, handle zero/missing data, and do not allocate mixed harvest to individual flocks.

## Files changed and architecture

- `app/(workspace)/dashboard`, `app/(workspace)/populasi`, and `components/population` use generated shadcn Card, AlertDialog, Sheet, Dialog, Table, Tabs, Input, Select and Button components.
- `server/services/population.ts` implements permission-guarded writes and historical reads. Shared dated event and farm-write support in `server/services/farm.ts`. Pure replay/metrics in `lib/domain/livestock.ts`.
- Account form utilities were moved into `components/shared` for reuse. No database migrations added. Stage 02's schema was exercised against PostgreSQL.

## Business and security verification

- Farm readers and operators are checked at the service layer. Owner mutation, reseller access and ABK approval paths were rejected in tests. Idempotent replay and concurrent debits were checked in PostgreSQL.
- A fixture with 100 hens, followed by 60 deaths and a transfer, kept farm populations at 100, 40 and 40. The source barn dropped to zero after transfer. Cancelling the transfer restored the dated source position without changing the original 100 head baseline.
- The unit fixture produced HDP 85% at 850 eggs/1,000 live hens, followed by a weighted period using 950 eggs/1,200 live hen-days. HHP used the original 1,000 placed hens on each eligible day for 47.5%.
- A PostgreSQL fixture verified mixed harvest influences the barn rate without allocation to an individual flock. Decision A011 documents ordering, placement and HHP eligibility.

## Tests / checks — actual results

| Command / scenario | Result | Notes |
|---|---|---|
| `npm run lint` and `npm run typecheck` | Exit 0 | No lint/type failures. |
| `npm test` | 7 passed | Population replay, denominator weighting, zero and mixed cases plus shared tests. |
| `npm run test:integration` | 14 passed | Auth suite plus five livestock PostgreSQL subtests and their parent. |
| `npm run build` with temporary real-font mirror | Exit 0 | Compiled in 5.1 s and generated production build output. |
| `npm run test:e2e` | 7 passed in 42.0 s | Required widths and both themes. At 320 px, created a barn, placed 75 hens, recorded five deaths, and verified Dashboard shows 70. |

## Limitations and handoff to Stage 04

- Feed and egg workflows and their dashboard figures are pending Stage 04. Health and finance flows remain scheduled for Stage 05.
- Reuse `farmWrite`, `postFarmEvent`, `isEffective`, `populationPeriodData`, shared form/table components and Stage 02's environment variables. (No newly required service secrets.)
- Use the farm ledger transaction and effective-date ordering when adding feed, egg and cash origins. Verify real inventory, cost and close logic before adding production KPI values.
- Google Fonts build workaround remains workstation-specific and outside tracked configuration.

## Git and release safety

- [x] Report, project state, and decisions updated.
- [x] Reviewed stage paths, diff, and secret exclusions.
- [x] Local stage commit created after verifying acceptance.
- [x] No Git push, production migration or deployment.
