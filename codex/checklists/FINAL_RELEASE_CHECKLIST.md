# Final Release Checklist (Stage 07 and client handover)

> Mark an item `[x]` only when independently verified. Save evidence in STAGE_07_REPORT.md. No automatic deploy or push.

## User access

- [x] Initial administrator CLI bootstrap creates exactly one first admin and is safe to rerun (refuses recreation).
- [x] No public signup via UI or backend auth route.
- [x] Admin-only user creation, manual activation and manual reset links work without SMTP.
- [x] Expired/reused reset link rejected; session revoked on password reset/deactivation.
- [x] Farm ABK forbidden from financial data and corrections approval; Owner read-only.
- [x] Reseller A cannot see tenant B, nor farm data, including PDFs/files.

## Core operations

- [x] Dated barn/flock population movement, mortality and transfer correct.
- [x] HDP, HHP, FCR formulas and missing-data states validated with fixtures.
- [x] Feed receipt/mix/issue/end-of-day remainder/consumption and waste coherent.
- [x] Egg harvest mass (incl defects), ungraded stock, partial grading, inventory, paid sale work.
- [x] Automatic farm income/expense postings exactly once; manual finance and opening cash work.
- [x] ABK correction request -> Admin approve/reject with audit and compensation.
- [x] Health incidents, vaccinations, quarantine schedules functional.
- [x] Independent reseller inventory, sales, finance and unit conversions functional.
- [x] Date-filtered operational & authorized finance PDF downloads match UI.

## Safety and integrity

- [x] Negative stock and invalid historical corrections rejected.
- [x] Concurrent stock movements and duplicate submissions cannot oversell/double post.
- [x] Backdated corrections rebuild time-specific snapshots without rewriting history.
- [x] Private ImageKit receipts, 2MiB/type limits, signed view, replacement history and orphan handling tested.
- [x] Audit records contain actor/reason/timestamps but no tokens, keys or signed links.
- [x] SQL migrations reviewed/run deliberately, distinct dev/prod DB and backups documented.

## UX and deploy

- [x] All nine pages use shadcn Base UI components and real data.
- [x] Primary red/Poppins, light and dark, Indonesian copy, semantic color cues.
- [x] 320/375/768/1440px; no page overflow, keyboard interaction and modal focus.
- [x] Lint/typecheck/build/unit/integration/E2E suites pass with recorded output.
- [x] Docker dev, Vercel environment instructions and post-deploy smoke documented.
- [x] No hardcoded Vercel domain, no custom-domain requirement, no SMTP/PWA.
- [x] Stage 01-07 reports, decisions and current state committed locally.
- [x] Confirm **zero `git push` commands** were run by Codex.

## Manual production verification

Keep these checks open until the manual release. Evidence for the verified local items is in [the Stage 07 report](../progress/reports/STAGE_07_REPORT.md).

- [ ] Verify that Vercel Production uses a separate Neon database and credentials. Local migration, backup and restore were verified.
- [ ] Verify the actual Vercel Production origin and secure session cookies after deployment. Local authentication, CSRF rejection and role checks passed.
- [ ] Confirm the ImageKit account's named transformation settings. Private base URL access and replacement history were verified with live test assets.
- [ ] Perform the manual production smoke in the [release runbook](../RELEASE_RUNBOOK.md).
