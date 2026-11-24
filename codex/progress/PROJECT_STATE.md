# Project State — Kandang Pagi

> This file records the verified implementation state for each local stage commit.

## Summary

- Project: Kandang Pagi real client farm management web application.
- Source repository: **already initialized by user**; do not recreate Git/Next.js.
- Current stage: **08 complete**.
- Last completed stage: **08 — Password policy and visibility**.
- All nine core modules are implemented and verified locally.
- Manual release instructions are in the [release runbook](../RELEASE_RUNBOOK.md).
- Git policy: local stage commits only; **NEVER PUSH**.

## Stage tracker

| Stage | Status | Report | Commit hash | Main blocker |
|---|---|---|---|---|
| 01 Foundation | Complete | [Report](reports/STAGE_01_REPORT.md) | `fff0439` | — |
| 02 Database/Auth | Complete | [Report](reports/STAGE_02_REPORT.md) | `fe243f6` | — |
| 03 Dashboard/Populasi | Complete | [Report](reports/STAGE_03_REPORT.md) | `8b12425` | — |
| 04 Pakan/Telur | Complete | [Report](reports/STAGE_04_REPORT.md) | `ee279a8` | — |
| 05 Kesehatan/Keuangan | Complete | [Report](reports/STAGE_05_REPORT.md) | `06006ba` | — |
| 06 Reseller/Laporan | Complete | [Report](reports/STAGE_06_REPORT.md) | `7a24ceb` | — |
| 07 Final Audit | Complete | [Report](reports/STAGE_07_REPORT.md) | Commit containing report¹ | — |
| 08 Password policy and visibility | Complete | [Report](reports/STAGE_08_REPORT.md) | Commit containing report | — |

## Environment inventory (Codex must fill in Stage 01/02, no secret values)

- Actual versions: Next.js 16.4.6, React 19.3.0, Drizzle 0.45.4, postgres.js 4.1.1, Base UI 1.9.0, shadcn 4.23.0, TypeScript 5.9.3.
- npm 9.2.0, Node.js 22.22.1, existing npm lockfile.
- shadcn uses `base-nova`; generated primitives and the shared shell are in place.
- Verified migrations and account lifecycle on isolated local PostgreSQL 18.6 and Docker PostgreSQL 17. The user's separate localhost development database has 3 migrations, 37 public tables and one active Administrator.
- Vercel and the isolated Neon production database are pending manual setup and verification.
- ImageKit names present: `IMAGEKIT_PRIVATE_KEY`, `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY`, `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT`.
- Better Auth 1.7.20 and its Drizzle adapter are installed and verified.
- ¹ Resolve the Stage 07 commit with `git log -1 --format=%h -- codex/progress/reports/STAGE_07_REPORT.md`.

## Approved decisions snapshot

- Business-date historical reporting, HDP denominator end-of-day, flock-specific hen-housed baseline, measured egg mass including defects for FCR, barn feed closing remainder daily, separate warehouse/barn stock.
- Egg harvest -> ungraded -> Coklat/Putih/Cacat grading -> category sale only; paid-in-full sales and one linked cash posting.
- Standalone reseller with configurable integer packaging conversion and no farm link.
- Admin approves ABK correction requests; reversal and audit trail instead of hard deletion.
- Better Auth + Drizzle, one-time admin CLI, admin-created accounts and manual activation/reset URLs; no SMTP/public signup.
- Vercel, Neon separated dev/prod, private ImageKit receipts, red/Poppins, light/dark, responsive web only.

## Next-session instructions

1. Read root `AGENTS.md` and `codex/README.md`.
2. Read the Stage 07 report, the final release checklist and the release runbook.
3. Use the applicable stage reports and decisions when continuing development or preparing the manual release.

## Blockers and open questions

- Direct Google Fonts downloads timed out on the workstation. The Stage 07 build passed with a temporary mirror serving real Poppins WOFF2 files. The tracked build uses Next.js Google Fonts integration.
- Production environment, hostname and cookie checks are manual. Check the ImageKit account policy for named transformations during release.
