# Stage 01 Report — Foundation, design system and responsive shell

## Status and scope

- Stage 01, completed 2026-11-19 Asia/Jakarta.
- Starting commit `2f6c393`. The working tree contained user edits in `AGENTS.md` and the supplied implementation pack. Those files were preserved, with only the required progress records included in the stage commit.
- Stage commit is the commit that added this report. Resolve it with `git log -1 --format=%h -- codex/progress/reports/STAGE_01_REPORT.md`.

## Completed work

- [x] Indonesian desktop/sidebar and mobile Sheet navigation. All nine labeled module routes, page titles and current navigation indicators verified.
- [x] Red theme, Poppins, persistent light/dark mode, shared Sonner provider, keyboard navigation, focus restoration and skip link.
- [x] Route placeholders state that recording is pending. Shared module header, metric card, loading/error/empty states, scroll-contained table and mobile/desktop form composition are available for later stages.
- [x] Jakarta-date, quantity and exact-IDR formatting helpers, sanitized environment template and local setup docs.

## Files changed and architecture

- Root App Router shell and route group under `app/(workspace)`. AppShell is a client island, with module descriptions and page metadata server-rendered.
- shadcn CLI 4.23.0 generated Base UI Sidebar, Card, Tabs, Dialog, AlertDialog, Input, Select, Table, Skeleton, Sheet, Badge, Tooltip, DropdownMenu, Field, Checkbox, Textarea, Pagination, Breadcrumb and Sonner primitives and their dependencies. Official registry items were temporarily mirrored when the CLI timed out. Generated labels were localized and responsive/focus integration checked.
- No migration in this stage. Local configuration lists variable names only.

## Business and security verification

- All views expose only the stage's informational content. There is no operational data or transaction action yet.
- `lib/navigation.ts` defines the approved role and module visibility map for the Stage 02 server guard.
- Decisions A007 and A008 cover routing, theme preference and build verification.

## Tests / checks — actual results

| Command / scenario | Result | Notes |
|---|---|---|
| `npm run lint` | Exit 0 | ESLint clean after updating the generated mobile viewport hook. |
| `npm run typecheck` | Exit 0 | TypeScript checks pass. |
| `npm run build` with temporary Poppins mirror | Exit 0 | Build compiled in 5.6 s and generated 14 static pages. Direct Google asset requests timed out on this workstation. |
| `npm run test:e2e` | 5 passed in 8.9 s | Chromium at 320, 375, 768 and 1440 px. Verified nine navigation links, no page overflow, theme persistence, Escape and modal focus restoration, and axe WCAG checks in both themes. |
| Desktop and mobile screenshot inspection | Passed | Reviewed 1440 px Dashboard in light theme and 320 px mobile navigation in dark theme. |

## Limitations, risks and blockers

- Stage 02 introduces real account data, protected routes and PostgreSQL migrations.
- Public Google Fonts connectivity is needed for a standard build. The local verification override was temporary and used real font files.

## Handoff to Stage 02

- Reuse `components/layout/app-shell.tsx`, `lib/navigation.ts`, `components/shared` and `lib/format.ts`.
- Configure `DATABASE_URL`, `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL` for the development/test environment. Existing ImageKit variable names are documented in `.env.example`.
- Read `codex/prompts/02-database-and-auth.md`, the account and database specs, and the progress tracker before implementing. Validate auth on disposable PostgreSQL.
- Build, browser, lint and typecheck evidence is recorded above. No schema migrations in Stage 01.

## Git and release safety

- [x] Report, project state and decisions updated.
- [x] Stage paths and environment file exclusion reviewed.
- [x] Local stage commit created after verification.
- [x] No Git push, production migration or deployment.
