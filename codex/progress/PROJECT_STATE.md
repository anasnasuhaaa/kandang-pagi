# Project State — Kandang Pagi

> **Living document**: Codex must update this after every stage and include the changes in that stage's local commit. This is a **planning baseline**, not a claim that the app features are implemented.

## Summary

- Project: Kandang Pagi real client farm management web application.
- Source repository: **already initialized by user**; do not recreate Git/Next.js.
- Current stage: **05 complete**.
- Last completed stage: **05 — Health and finance**.
- Next stage: **06 — Reseller and Reports** (`codex/prompts/06-reseller-and-reports.md`).
- All nine core modules are in MVP scope.
- Git policy: local stage commits only; **NEVER PUSH**.

## Stage tracker

| Stage | Status | Report | Commit hash | Main blocker |
|---|---|---|---|---|
| 01 Foundation | Complete | [Report](reports/STAGE_01_REPORT.md) | `fff0439` | — |
| 02 Database/Auth | Complete | [Report](reports/STAGE_02_REPORT.md) | `fe243f6` | — |
| 03 Dashboard/Populasi | Complete | [Report](reports/STAGE_03_REPORT.md) | `8b12425` | — |
| 04 Pakan/Telur | Complete | [Report](reports/STAGE_04_REPORT.md) | `ee279a8` | — |
| 05 Kesehatan/Keuangan | Complete | [Report](reports/STAGE_05_REPORT.md) | Commit containing report¹ | — |
| 06 Reseller/Laporan | Not started | — | — | — |
| 07 Final Audit | Not started | — | — | — |

## Environment inventory (Codex must fill in Stage 01/02, no secret values)

- Actual versions: Next.js 16.4.6, React 19.3.0, Drizzle 0.45.4, postgres.js 4.1.1, Base UI 1.9.0, shadcn 4.23.0, TypeScript 5.9.3.
- npm 9.2.0, Node.js 22.22.1, existing npm lockfile.
- shadcn uses `base-nova`; generated primitives and the shared shell are in place.
- Verified migrations and account lifecycle on isolated local PostgreSQL 18.6. A dedicated development Neon URL is still required for Neon-based development.
- Production DB separation: **not verified**.
- ImageKit names present: `IMAGEKIT_PRIVATE_KEY`, `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY`, `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT`.
- Better Auth 1.7.20 and its Drizzle adapter are installed and verified.
- ¹ Resolve the Stage 05 commit with `git log -1 --format=%h -- codex/progress/reports/STAGE_05_REPORT.md`.

## Approved decisions snapshot

- Business-date historical reporting, HDP denominator end-of-day, flock-specific hen-housed baseline, measured egg mass including defects for FCR, barn feed closing remainder daily, separate warehouse/barn stock.
- Egg harvest -> ungraded -> Coklat/Putih/Cacat grading -> category sale only; paid-in-full sales and one linked cash posting.
- Standalone reseller with configurable integer packaging conversion and no farm link.
- Admin approves ABK correction requests; reversal and audit trail instead of hard deletion.
- Better Auth + Drizzle, one-time admin CLI, admin-created accounts and manual activation/reset URLs; no SMTP/public signup.
- Vercel, Neon separated dev/prod, private ImageKit receipts, red/Poppins, light/dark, responsive web only.

## Next-session instructions

1. Read root `AGENTS.md` and `codex/README.md`.
2. Read all context docs relevant to next stage; read previous stage report (if any).
3. Execute only the next stage. Update this file with actual completed work, command evidence, caveats and next stage.
4. Commit locally only after verification. Do not push.

## Blockers and open questions

- Direct Google Fonts downloads timed out on this workstation. Stage 01 built through a temporary Poppins mirror and verified the resulting production bundle in Chromium. The tracked build uses the standard Next.js Google Fonts integration.
- Development and production Neon endpoints have not been inspected. Tests used private disposable PostgreSQL databases. At the user’s request, their separate empty localhost development DB was migrated and verified with 3 migrations, 37 tables and 0 accounts.
- Unspecified operational details are documented safe defaults in context, not a request to start another broad decision session.
