# Decision Log — Kandang Pagi

> Approved business decisions must not be silently changed. Add new technical decisions with date, stage, options, rationale, consequences and approval/assumption status. Do not conflate an engineering assumption with explicit client approval.

| ID | Status | Decision / rationale | Stage |
|---|---|---|---|
| D001 | Approved | Nine core modules functional in first web-responsive MVP; no PWA. | Planning |
| D002 | Approved | Next.js 16/React 19/Drizzle/Neon, existing npm repo and Git; do not reinitialize. | Planning |
| D003 | Approved | Better Auth + Drizzle; admin-only account creation; no public registration, no SMTP; manual activation and password reset. | Planning |
| D004 | Approved | First administrator bootstrapped via secure, single-use CLI procedure. | Planning |
| D005 | Approved | Primary color red, Poppins, light/dark; real shadcn/ui Base UI components. | Planning |
| D006 | Approved | Dev/prod database separated; Docker dev and Vercel deploy; no custom domain prerequisite. | Planning |
| D007 | Approved | Farm HDP denominator end-of-day hens after all movements; original per-flock HHP baseline. | Planning |
| D008 | Approved | All eggs incl Cacat count for HDP/HHP; FCR uses actual egg mass incl defects and actual feed consumed. | Planning |
| D009 | Approved | Warehouse-to-barn feed issue is not consumption; daily end-of-day leftover reading. | Planning |
| D010 | Approved | Ungraded eggs must be graded into Coklat/Putih/Cacat before category sale. | Planning |
| D011 | Approved | Farm egg sale paid in full; paid purchases/sales auto-post to finance without double entry. | Planning |
| D012 | Approved | Reseller stock/sales/finance wholly independent; configurable multi-unit conversion. | Planning |
| D013 | Approved | ABK correction request, administrator approval; no destructive transaction edits; audit trail. | Planning |
| D014 | Approved | Date-effective historical reports; admin initial stock/cash balances; optional private 2 MiB receipt with one active file and replacement history. | Planning |
| D015 | Approved | Local Git commit at each stage, report and state file; absolutely no push. | Planning |
| A001 | Engineering default, revisit only if challenged | Mixed-flock eggs cannot be assigned to a particular flock without evidence. | Planning |
| A002 | Engineering default, revisit only if challenged | Reseller stock base unit is butir; packaging conversions integer and versioned; kg cannot auto-convert to pieces. | Planning |
| A003 | Engineering default, revisit only if challenged | Price-bearing paid feed purchase posting restricted to Administrator; ABK limited to non-financial operations. | Planning |
| A004 | Engineering default, revisit only if challenged | Reseller sales cash-only in MVP; no reseller credit/receivables. | Planning |
| A005 | Engineering default, revisit only if challenged | Proposed primary red hex `#DC2626`, subject to client brand asset if later provided. | Planning |
| A006 | Engineering default, revisit only if challenged | FIFO-independent moving weighted-average feed cost for MVP, with exact monetary arithmetic. | Planning |

## Stage 01 engineering decisions

### A007 — Routes and theme preference
- Date/stage: 2026-11-19, Stage 01.
- Status: Engineering assumption.
- The Stage 01 shell uses the approved module slugs and a shared navigation authorization map. Module pages can replace the dynamic placeholder independently.
- next-themes begins with the browser's system theme and remembers the visitor's explicit choice on the device. Stage 02 adds authenticated preference persistence.
- The theme uses the proposed light red, accessible dark red, and a darker foreground red on light-theme selected navigation.
- Compared with requiring a database for the foundation, this keeps all Stage 01 routes independently renderable until authentication arrives.

### A008 — Local font build verification
- Date/stage: 2026-11-19, Stage 01.
- Status: Workstation-specific verification.
- The build uses the required Next.js Poppins integration. Direct requests to Google Fonts asset servers failed, including a retry through a local connectivity proxy.
- A temporary localhost server served actual Poppins WOFF2 files from Fontsource 5.2.7. The Next.js Google Fonts response override pointed the original Poppins CSS declarations to that server. Production compilation and browser checks passed against the resulting bundle. The mirror and override are outside the repository.

## Stage 02 engineering decisions

### A009 — Dated event ledgers and scoped locks
- Date/stage: 2026-11-19, Stage 02.
- Status: Engineering assumption.
- Farm and reseller operations have separate event/date/audit and ledger structures. Farm cash uses the origin event ID as its primary key, allowing at most one cash posting for an origin. Composite foreign keys for reseller stock, cash, units, and reversals require the same space.
- IDR uses PostgreSQL bigint and JavaScript BigInt. Weight uses integer grams, with 0.001 kg input precision. The effective sort key is business date and event ordering, with timestamps for the actual recorded time. Build historic balances from ledger events.
- Transaction-scoped advisory locks serialize MVP writes by custody scope. Account mutations and login use the account lock. Farm and reseller operations can use separate farm/tenant keys. Write validated ledger rows and safe audit entries in the same transaction after validation. Use request key plus normalized fingerprint for retry safety.

### A010 — Better Auth issuance and profile lifecycle
- Date/stage: 2026-11-19, Stage 02.
- Status: Engineering assumption.
- Use Better Auth 1.7.20 Admin `createUser` and its supported `requestPasswordReset`, `resetPassword`, and `changePassword` APIs. The stock CLI alone allows another administrator after confirmation, so the custom CLI wraps the supported API and guards the transaction with a lock and singleton marker.
- The account service binds a Better Auth reset token to an application purpose and status, and serves it in a URL fragment. Both Better Auth verification identifiers and application token digests are hashed. Application-level link revocation and consumption are enforced before calling Better Auth in the same DB transaction.
- The auth handler exposes the required sign-in and sign-out paths. It uses database-backed Better Auth rate limiting and an authoritative DB session. Account links use a DB rate counter. Login and account management are ordered against password/role/status changes. Account settings persist the theme, which is applied on the next sign-in.
- Test against PostgreSQL 18.6 in disposable local databases. Production and Neon-specific verification are separate release checks. The CLI requires an explicit environment target and a production flag for an intentional production release.

## Stage 03 engineering decisions

### A011 — Population replay and reporting scope
- Date/stage: 2026-11-19, Stage 03.
- Status: Engineering assumption implementing the approved flock baseline and transfer rules.
- Each new group receives a separate opening/arrival record with an immutable baseline. Transfers move the whole live flock to avoid overlapping placement intervals and retain the original identity. ABK can record groups and movements across the single farm while barn master changes and cancellation remain Administrator operations.
- Writes serialize under a farm advisory lock, order operations by business date and event sequence, and replay later events to catch invalid negative quantities or placements. Reversals record the original effective date and a separate recorded timestamp. An earlier cancellation is rejected if later stock/placement would no longer be valid.
- Jakarta midnight represents the business date when the source form has no time of day. Date filters accept up to 90 days per request using the projected as-of ledger. HHP includes eligible dates with flock presence, including a placement/exit day. HDP uses end-of-day count. Mixed harvests affect farm and barn totals but block attribution to the affected flock on that date.
- Pending feed and egg metrics remain explicit until real capture is implemented. Report calculations consume measured and dated rows.

## Entry template

```markdown
### [ID] — [Decision title]
- Date/stage:
- Status: Approved / Assumption / Proposed / Superseded
- Problem:
- Chosen solution:
- Alternatives:
- Reason:
- Data/security/UX consequences:
- Follow-up or verification:
```

Never delete decisions; mark superseded with a pointer to the replacement.
