# Stage 08 Report — Password policy and visibility

## Status and scope

- Completed 2026-11-24 (Asia/Jakarta). This report is in the local stage commit.
- The checkout started at `bedea19` with local documentation and structure tooling changes. The pre-existing changes were preserved.

## Completed work

- Bootstrap, activation, reset and profile changes use the shared Zod and Better Auth policy of 8–128 characters. Login and current-password verification retain the existing input rules.
- Login, activation/reset and all three profile password inputs use the shared shadcn Input and Button composition with independent visibility state.
- Indonesian account-link copy and validation messages follow the shared minimum. The CLI continues to hide interactive input.

## Files changed and architecture

- `lib/validation.ts`, `lib/account-validation.ts` and `server/auth/config.ts` share the password policy. The account services and CLI already consume these schemas.
- `components/shared/form-fields.tsx` composes the input, label, field error and visibility button used by the account forms.
- Session handling, token issuance and the database schema required no changes.

## Business and security verification

- Verified password confirmation, preserved whitespace, the 128-character limit, manual links, token single use, session revocation, closed registration, role checks and tenant isolation.
- Verified 7-character rejection and 8-character acceptance in the bootstrap, activation, reset and profile paths. Direct Better Auth reset and change operations also rejected 7 characters.

## Tests and checks

| Command or scenario | Result |
|---|---|
| `npm run lint` and `npm run typecheck` | Both passed. |
| `npm test` | 16 passed. |
| `tsx --test tests/integration/auth.test.ts` | 8 passed, including the parent suite, against disposable PostgreSQL. |
| `npm run db:bootstrap-admin -- --password-stdin` | Rejected 7 characters and created the first Administrator with 8 on a fresh test database. |
| `npm run build` | Production build passed in an isolated copy using the configured Poppins font. |
| `npm run test:e2e -- --grep 'akun baru, aktivasi'` | Chromium scenario passed. Tab, Enter and Space exercised each eye button, kept the entered values, and allowed successful form submission afterward. |
| `npm run docs:structure -- --check` | Passed after regenerating and reviewing the project map. |

## Limitations and handoff

- Browser verification used Chromium. CLI verification exercised piped input.
- Stage 09 covers the date-field migration.

## Git and release safety

- Updated project state and decisions and reviewed the stage diff before creating the local commit.
- No push or deployment.
