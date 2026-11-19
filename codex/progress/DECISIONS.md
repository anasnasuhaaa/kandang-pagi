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
