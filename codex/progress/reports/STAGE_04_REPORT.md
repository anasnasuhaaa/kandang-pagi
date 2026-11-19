# Stage 04 Report — Feed and egg production

## Status and scope

- Stage 04, completed 2026-11-19 Asia/Jakarta. Starting commit `8b12425`.
- Stage commit is the commit that added this report. Resolve it with `git log -1 --format=%h -- codex/progress/reports/STAGE_04_REPORT.md`.
- User-supplied AGENTS.md edits and implementation pack were preserved.

## Completed work

- [x] Feed product master, stock opening, paid feed receipts, weighted-average multi-ingredient mixes and shrinkage, warehouse-to-barn issues, measured daily closes, returns/waste, and audited adjustments.
- [x] Measured lot harvest (including incomplete mass and observed zero), partial grading, separated classified stock and lot balances, losses and adjustments, and one fully paid sale-to-cash origin.
- [x] Real Feed, Egg Production, and Dashboard metrics. Responsive forms, date/search filters, paginated views, confirmations and status for missing/requires-verification readings.
- [x] Cash-bearing writes are Administrator-only. ABK views redact structured financial fields and finance notes. Ledger operations write together with audit and idempotency inside PostgreSQL transactions.

## Files changed and architecture

- `app/(workspace)/pakan` and `app/(workspace)/produksi-telur`, with shared generated shadcn modal/Sheet, inputs, selects, confirmations and table composition under `components/inventory`.
- `server/services/feed.ts`, `eggs.ts`, `inventory-actions.ts` and `production-summary.ts` write and read date-effective ledger events. Pure reconciliation under `lib/domain/inventory.ts`. Population changes validate dated harvest attribution.
- `0001_zero_harvest_observation.sql` expands the harvest constraint for an explicitly measured zero-egg day. Existing nonzero harvest records remain compatible.

## Business and security verification

- 5 kg opening plus 120 kg transferred less 15 kg observed yields 110 kg consumed. With 3 kg waste the result is 107 kg. Transfer on its own produces no consumption or expense. A missing or stale physical close withholds FCR.
- A 100-egg harvest preserved 70 Coklat, 20 Putih and 10 Cacat after grading. Grading never contributes to the harvest numerator. Actual total weight, including defects, feeds the FCR calculator.
- Invalid backdating, insufficient mixes, ungraded sales, partial payment, concurrent oversell, duplicate cash posting and ABK price access were checked. The hypothetical removal of a receipt or grading that downstream stock requires was rejected.
- See A012 and A013 for the cost/reconciliation rules and scope decisions.

## Tests / checks — actual results

| Command / scenario | Result | Notes |
|---|---|---|
| `npm run db:generate -- --name zero_harvest_observation` | Exit 0 | Versioned SQL reviewed. Both migrations applied by fresh local PostgreSQL fixtures. |
| `npm run lint` and `npm run typecheck` | Exit 0 | Clean. |
| `npm test` | 12 passed | Includes physical consumption, stale and missing close, classification, paid amount and zero measurement tests. |
| `npm run test:integration` | 19 passed | Includes four inventory subtests on PostgreSQL alongside prior suites. |
| `npm run build` with temporary Poppins mirror | Exit 0 | Turbopack compiled production routes, including both real inventory pages. |
| `npm run test:e2e` | 8 passed | Widths 320/375/768/1440 and mobile flow for a paid feed receipt, harvest, sorting and fully paid sale. |

## Limitations and handoff to Stage 05

- ABK submits correction requests and Administrator reviews them in Stage 05. The audit, event origin and reconciliation functions needed by approvals are ready. Cash is posted by sale and purchase now. Manual cash, receipt attachments and the finance view come in Stage 05.
- Reuse `feedProjection` and `eggProjection` to reject reversals that invalidate effective stock. Use `farmCash.id` to link one cash entry to the originating event. Prefer the same form, date and search patterns for health and finance.
- No new service environment variables in Stage 04. PostgreSQL verification was local. Prior direct Google Fonts connectivity limitation still applies.

## Git and release safety

- [x] Report, project state, and decisions updated.
- [x] Targeted stage paths and staged content reviewed.
- [x] Local stage commit created after successful checks.
- [x] No Git push, production migration or deployment.
