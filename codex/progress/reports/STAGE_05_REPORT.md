# Stage 05 Report — Health, cash, corrections and receipts

## Status and scope

- Stage 05, completed 2026-11-19 Asia/Jakarta. Starting commit `ee279a8`.
- Stage commit is the commit that added this report. Resolve it with `git log -1 --format=%h -- codex/progress/reports/STAGE_05_REPORT.md`.
- User-authored AGENTS.md and implementation-pack edits preserved.

## Completed work

- [x] Health incidents and status history, vaccination plans and executions, quarantine start/end, dates and status cards. Quarantine has no automatic population effect.
- [x] Farm cash opening, manual income and expenses, exact IDR, dated balances, linked egg-sale and feed-purchase provenance. Finance and Dashboard totals are role restricted.
- [x] ABK requests and statuses, Administrator review and direct correction, auditable reversal and replacement, repeat approval protection, and rejection if subsequent inventory or flock history would become invalid.
- [x] Private ImageKit receipts with content validation, preview, upload progress feedback, replacement history, scoped short-lived delivery, and cleanup of pending/orphan reservations.
- [x] Applied all three reviewed migrations to the user-authorized empty localhost development database. Verified 37 tables and no accounts immediately after migration. The user's existing development server returned HTTP 200 for the login page.

## Files changed and architecture

- `app/(workspace)/kesehatan`, `keuangan`, `pengaturan` and Dashboard use the shared generated shadcn form, Sheet, AlertDialog, Card, Table, Badge and Tabs.
- `server/services/health.ts`, `finance.ts`, `corrections.ts`, `receipts.ts` and `imagekit.ts` contain authorization, posting, replay and private media operations.
- `0002_finance_receipts_and_corrections.sql` adds replacement linkage/order, receipt digest and one pending upload per cash transaction. Existing dated records use their original sequence.
- ImageKit SDK `@imagekit/nodejs` 7.15.0 uses `files.upload`, `files.delete`, `assets.list`, and `helper.buildSrc`. Next.js defaults to Node runtime with Cache Components enabled. See the [SDK source](https://github.com/imagekit-developer/imagekit-nodejs) and [ImageKit private delivery documentation](https://imagekit.io/docs/media-delivery-basic-security).

## Business and security verification

- All correction approvals and their inventory/cash compensation execute under the farm transaction lock. Reviewed and denied requests remain in history. Cash opening was excluded from operating income.
- ABK was denied the finance service, another transaction's receipt, and approval. Signed delivery has no cache and is scoped to the matching transaction and version.
- Image decoder validates contents, MIME, dimensions, and the 2 MiB limit. The stub tested upload failures, concurrent replay behavior, a rejected finalization, retry cleanup, and preserved replacement history.
- On the configured ImageKit account, a synthetic private PNG returned signed HTTP 200 and unsigned HTTP 403. The test asset was deleted. The smoke command kept identifiers and credentials out of its output.
- Decisions A014 and A015 describe the correction modes, receipt reservation and recovery policy.

## Tests / checks — actual results

| Command / scenario | Result | Notes |
|---|---|---|
| `npm run lint` and `npm run typecheck` | Exit 0 | Clean after using the installed Next.js default runtime. |
| `npm test` | 12 passed | Shared time, amount, population and inventory unit fixtures. |
| `npm run test:integration` | 24 passed | Four PostgreSQL suites, including correction race and attachment failure fixtures. |
| `npm run db:migrate` and read-only verification | Exit 0 | Fresh local PostgreSQL tests, plus separately authorized user development DB. |
| `npm run build` with the temporary Poppins mirror | Exit 0 | Production bundle compiled and built the health, finance and receipt endpoints. |
| `npm run test:e2e` | 9 passed | Required widths, light/dark, stock and account flows, ABK request and admin approval, mobile health and cash entry. |
| Private ImageKit smoke | Passed | Signed 200, unsigned 403, verified PNG and cleaned up. |

## Handoff to Stage 06

- Reuse `financeView`, `farmCashSummary`, `populationPeriodData`, `feedProjection`, `eggProjection` and shared ledger UI. Reports must derive the data from the current effective ledger and enforce finance/re-seller scope at the download route.
- Environment names include `IMAGEKIT_PRIVATE_KEY`, `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT`, and optional `IMAGEKIT_RECEIPT_FOLDER` alongside DB/auth names. The generated first Administrator is not seeded in the user's DB. Run the interactive bootstrap to create that account.
- Configured account-level ImageKit unsigned delivery policy for named transformations remains a manual release check. The smoke verified private delivery without a named transformation.
- Google Fonts workstation networking remains as documented. No production migration, deployment, or push performed.

## Git and release safety

- [x] Report, project state and decisions updated.
- [x] Reviewed staged paths and secret exclusions.
- [x] Local stage commit created after successful verification.
- [x] No Git push, production migration or deployment.
