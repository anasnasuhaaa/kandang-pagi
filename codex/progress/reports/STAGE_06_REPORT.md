# Stage 06 Report — Independent reseller and historical reporting

## Status and scope

- Stage 06, completed 2026-11-19 Asia/Jakarta. Starting commit `06006ba`.
- Stage commit is the commit that added this report. Resolve it with `git log -1 --format=%h -- codex/progress/reports/STAGE_06_REPORT.md`.
- User changes to AGENTS.md and the source implementation pack were preserved.

## Completed work

- [x] Separate reseller workspace with stock, intake, paid sales, cash, and versioned packaging units. Actual kilograms and physical piece counts are distinct. Cancelled stock and cash transactions retain a dated reversal trail.
- [x] Historical operational, farm finance and reseller reports. Authorized role-specific filters and live summary/table data share a projection with the PDF exporter.
- [x] Real server-generated PDF with date criteria, generation time, repeated table headers, completeness notes and page numbers. The download endpoint rechecks session/role and uses private, no-store delivery.
- [x] Removed the placeholder route after replacing all nine module pages. Exposed report family and cash options by permission. Report/stock rollups use business dates and current effective corrections.

## Files changed and architecture

- `app/(workspace)/reseller`, `laporan`, and `app/api/laporan/pdf`, with shared forms, shadcn tables, tabs, and report selectors.
- Authenticated reseller identity resolves before every read or mutation in `server/services/reseller.ts`. Reuses the normalized Stage 02 reseller tables and their same-space keys.
- `server/services/reports.ts` and `report-pdf.ts` use the existing production, population, finance and reseller projections. PDF uses pdf-lib 1.17.1, standard font and landscape pagination. [PDF-LIB reference](https://pdf-lib.js.org/docs/api/classes/pdfdocument)
- No migration added. Cleared stale generated Next.js dev route validators after removing the placeholder file. The build regenerated its route types.

## Business and security verification

- Fixture conversion changes from 24 to 20 butir keep the original intake snapshot. A measured 2 kg entry requires the entered count of 31 butir.
- Parallel cash sales could not oversell. Reseller A could neither select Reseller B's unit nor cancel its event. Admin/Owner privileges do not confer reseller access. A forged PDF tenant parameter did not change reseller scope.
- The same report returned a 75-bird historical count before a later five-bird decline. PDF bytes loaded as a PDF document and a long fixture spanned multiple pages.
- See decisions A016 and A017 for ownership, history, report bounds and scope.

## Tests / checks — actual results

| Command / scenario | Result | Notes |
|---|---|---|
| `npm run lint` and `npm run typecheck` | Exit 0 | Clean after regenerating route validators. |
| `npm test` | 15 passed | Adds conversion, actual weight, and report range validation. |
| `npm run test:integration` | 29 passed | PostgreSQL reseller ownership, reversals, historical ledger and PDF. |
| `npm run build` with temporary Poppins mirror | Exit 0 | Static output and all nine protected routes compiled. |
| `npm run test:e2e` | 9 passed, plus 1 passed on targeted rerun | Default run passed prior regression cases. The reseller case reached the report and matched two cells with the same numeric text. After scoping the assertion to the stock table, the full reseller workflow and PDF download passed. |

## Handoff to Stage 07

- Reuse the full browser, PostgreSQL and pure test suites. Verify reset and role boundaries end-to-end, Docker dev and deployment runbook. No additional repository secrets.
- Report periods are bounded to 90 days and output to 300 rows per section. Authoritative as-of replay still scans the necessary scoped ledger history.
- Existing user-local development DB remains at the three verified migrations. Production integration and release procedures are Stage 07.
- Build used the temporary Poppins mirror to account for direct workstation connectivity.

## Git and release safety

- [x] Report, project state and decisions updated.
- [x] Reviewed staged diff and secret exclusions.
- [x] Local stage commit created after verification.
- [x] No push, production migration or deployment.
