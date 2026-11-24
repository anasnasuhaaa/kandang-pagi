# Stage 09 Report — Calendar date fields

## Status and scope

- Completed 2026-11-24 (Asia/Jakarta). This report is in the local stage commit.
- Started at `8c034c6`. Existing workspace changes, including the project map and its generator, were kept outside this stage commit.

## Completed work

- Used the installed shadcn CLI and `base-nova` configuration to generate the official Calendar and Base UI Popover. Connected the generated day button's ref so Calendar autofocus and arrow-key navigation reach the day controls. [shadcn Base UI Calendar](https://ui.shadcn.com/docs/components/base/calendar)
- Applied the shared picker to population and operational ledger forms, including finance, reseller, feed, production, health and future vaccine schedules. Ledger, dashboard, population and report filters use the same field.
- Grepped the full app and components for native date/time inputs and other date-entry controls. The remaining ledger field type discriminator routes to the shared picker.
- Indonesian labels and dates use the fixed Asia/Jakarta timezone. The form submits the original field name and date-only value in `YYYY-MM-DD` format, including an empty value on clear.

## Files changed and architecture

- `components/shared/date-field.tsx` composes the generated Calendar and Popover with the existing Button, FieldLabel and FieldError. It handles defaults, clear, native form reset, and calendar-level bounds.
- `components/inventory/ledger-form.tsx` serves as the shared operational entry point. Dedicated population forms and all filter forms use the same picker.
- Added the registry's React DayPicker 10.0.2 and date-fns 4.4.0 dependencies. Data schemas and routes required no changes or migrations.

## Business and security verification

- Transaction dates still enforce their existing caps, and future vaccine schedules can be saved. Required date fields reject empty submissions. Clearing an optional report date omits that query parameter and lets the existing default period apply.
- Report start and end dates round-trip separately and match the PDF query. Date filters retain their original URL keys and tab selection.
- The existing integration suite exercised authorization, tenant isolation, corrections and historical reports.

## Tests and checks

| Command or scenario | Result |
|---|---|
| `npm run lint` and `npm run typecheck` | Both passed. |
| `npm test` | 16 passed. |
| `npm run test:integration` | 30 passed, including parent suites, against disposable PostgreSQL. |
| `npm run build` | Production build passed in an isolated copy. |
| `npm run test:e2e -- --workers=1 --timeout=60000` | All 12 Chromium tests passed. The suite covered 320, 375, 768 and 1440 px layouts, both themes, and date round-trips in Jakarta and Los Angeles. A previous run passed 11 cases and hit the 30-second limit in the 768 px navigation case. |
| `npm run docs:structure -- --check` | Passed after regenerating and reviewing the project map. |

## Limitations and handoff

- Browser coverage used Chromium with simulated viewport sizes and timezones.
- No additional configuration or schema migrations are required. See decision A021 for date handling.

## Git and release safety

- Updated project state and decisions and reviewed the stage diff before creating the local commit.
- No push or deployment.
