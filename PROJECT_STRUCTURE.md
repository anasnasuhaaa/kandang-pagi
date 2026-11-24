# Struktur Proyek Kandang Pagi

Dokumen ini mencatat nama berkas dan folder di workspace saat perintah dijalankan. Jalankan `npm run docs:structure` dari root proyek setelah menambah, memindahkan, atau menghapus berkas, atau setelah mengubah aturan ignore. Gunakan `npm run docs:structure -- --check` untuk memeriksa apakah dokumen sesuai dengan workspace.

| Folder | Isi |
| --- | --- |
| `app/` | Halaman, layout, dan route handler Next.js. |
| `components/` | Komponen UI bersama dan komponen tiap modul. |
| `server/` dan `lib/` | Otorisasi, layanan server, validasi, dan perhitungan domain. |
| `db/` | Koneksi, skema, dan migrasi Drizzle. |
| `tests/` | Uji unit, integrasi, dan end-to-end. |
| `codex/` | Spesifikasi, catatan implementasi, laporan tahap, dan panduan rilis. |

## Berkas proyek

Daftar ini mencakup berkas yang dilacak Git dan berkas baru yang belum dilacak. Metadata internal Git disimpan di `.git/`.

```text
kandang-pagi/
├── .dockerignore
├── .env.example
├── .gitignore
├── AGENTS.md
├── Dockerfile
├── MASTER_PROMPT.md
├── PROJECT_STRUCTURE.md
├── README.md
├── REFINE_UIUX.md
├── app/
│   ├── (workspace)/
│   │   ├── dashboard/
│   │   │   └── page.tsx
│   │   ├── error.tsx
│   │   ├── kesehatan/
│   │   │   └── page.tsx
│   │   ├── keuangan/
│   │   │   └── page.tsx
│   │   ├── laporan/
│   │   │   └── page.tsx
│   │   ├── layout.tsx
│   │   ├── loading.tsx
│   │   ├── pakan/
│   │   │   └── page.tsx
│   │   ├── pengaturan/
│   │   │   └── page.tsx
│   │   ├── populasi/
│   │   │   ├── actions.ts
│   │   │   └── page.tsx
│   │   ├── produksi-telur/
│   │   │   └── page.tsx
│   │   └── reseller/
│   │       └── page.tsx
│   ├── akses/
│   │   └── page.tsx
│   ├── api/
│   │   ├── auth/
│   │   │   └── [...route]/
│   │   │       └── route.ts
│   │   ├── bukti/
│   │   │   └── [cashId]/
│   │   │       └── route.ts
│   │   └── laporan/
│   │       └── pdf/
│   │           └── route.ts
│   ├── apple-icon.png
│   ├── globals.css
│   ├── icon.png
│   ├── layout.tsx
│   ├── masuk/
│   │   └── page.tsx
│   ├── not-found.tsx
│   └── page.tsx
├── codex/
│   ├── README.md
│   ├── RELEASE_RUNBOOK.md
│   ├── checklists/
│   │   └── FINAL_RELEASE_CHECKLIST.md
│   ├── context/
│   │   ├── BUSINESS_RULES.md
│   │   ├── DATABASE_DESIGN.md
│   │   ├── DEFINITION_OF_DONE.md
│   │   ├── INTEGRATIONS_AND_DEPLOYMENT.md
│   │   ├── MODULE_SPECIFICATIONS.md
│   │   ├── PROJECT_OVERVIEW.md
│   │   ├── SECURITY_AND_ACCESS.md
│   │   ├── TECH_STACK.md
│   │   ├── TEST_STRATEGY.md
│   │   └── UI_UX_GUIDELINES.md
│   ├── progress/
│   │   ├── DECISIONS.md
│   │   ├── HANDOFF_TEMPLATE.md
│   │   ├── PROJECT_STATE.md
│   │   ├── STAGE_REPORT_TEMPLATE.md
│   │   ├── UI_UX_REFINEMENT_AUDIT.md
│   │   └── reports/
│   │       ├── STAGE_01_REPORT.md
│   │       ├── STAGE_02_REPORT.md
│   │       ├── STAGE_03_REPORT.md
│   │       ├── STAGE_04_REPORT.md
│   │       ├── STAGE_05_REPORT.md
│   │       ├── STAGE_06_REPORT.md
│   │       ├── STAGE_07_REPORT.md
│   │       ├── STAGE_08_REPORT.md
│   │       ├── STAGE_09_REPORT.md
│   │       ├── STAGE_10_REPORT.md
│   │       └── UI_UX_REFINEMENT_REPORT.md
│   └── prompts/
│       ├── 01-foundation.md
│       ├── 02-database-and-auth.md
│       ├── 03-dashboard-and-livestock.md
│       ├── 04-feed-and-egg-production.md
│       ├── 05-health-and-finance.md
│       ├── 06-reseller-and-reports.md
│       └── 07-integration-and-final-audit.md
├── components.json
├── components/
│   ├── account/
│   │   ├── account-controls.tsx
│   │   ├── auth-frame.tsx
│   │   ├── link-form.tsx
│   │   ├── login-form.tsx
│   │   └── profile-forms.tsx
│   ├── finance/
│   │   ├── cash-forms.tsx
│   │   ├── correction-forms.tsx
│   │   ├── correction-table.tsx
│   │   └── receipt-dialog.tsx
│   ├── health/
│   │   └── entry-forms.tsx
│   ├── inventory/
│   │   ├── entry-forms.tsx
│   │   ├── ledger-filters.tsx
│   │   ├── ledger-form.tsx
│   │   └── ledger-table.tsx
│   ├── layout/
│   │   ├── app-shell.tsx
│   │   └── providers.tsx
│   ├── population/
│   │   ├── filters.tsx
│   │   └── forms.tsx
│   ├── reports/
│   │   ├── report-filters.tsx
│   │   └── report-table.tsx
│   ├── reseller/
│   │   └── entry-forms.tsx
│   ├── shared/
│   │   ├── data-table.tsx
│   │   ├── date-field.tsx
│   │   ├── form-dialog.tsx
│   │   ├── form-fields.tsx
│   │   ├── module-tabs.tsx
│   │   ├── module.tsx
│   │   ├── page-links.tsx
│   │   ├── row-actions.tsx
│   │   ├── status-badge.tsx
│   │   └── use-validated-form.ts
│   └── ui/
│       ├── alert-dialog.tsx
│       ├── badge.tsx
│       ├── breadcrumb.tsx
│       ├── button.tsx
│       ├── calendar.tsx
│       ├── card.tsx
│       ├── checkbox.tsx
│       ├── dialog.tsx
│       ├── dropdown-menu.tsx
│       ├── field.tsx
│       ├── input.tsx
│       ├── label.tsx
│       ├── pagination.tsx
│       ├── popover.tsx
│       ├── select.tsx
│       ├── separator.tsx
│       ├── sheet.tsx
│       ├── sidebar.tsx
│       ├── skeleton.tsx
│       ├── sonner.tsx
│       ├── table.tsx
│       ├── tabs.tsx
│       ├── textarea.tsx
│       └── tooltip.tsx
├── compose.yaml
├── db/
│   ├── index.ts
│   ├── migrations/
│   │   ├── 0000_married_lizard.sql
│   │   ├── 0001_zero_harvest_observation.sql
│   │   ├── 0002_finance_receipts_and_corrections.sql
│   │   └── meta/
│   │       ├── 0000_snapshot.json
│   │       ├── 0001_snapshot.json
│   │       ├── 0002_snapshot.json
│   │       └── _journal.json
│   └── schema/
│       ├── auth.ts
│       ├── control.ts
│       ├── farm.ts
│       ├── index.ts
│       └── reseller.ts
├── drizzle.config.ts
├── eslint.config.mjs
├── hooks/
│   └── use-mobile.ts
├── lib/
│   ├── account-audit-labels.ts
│   ├── account-validation.ts
│   ├── domain/
│   │   ├── finance-input.ts
│   │   ├── health-input.ts
│   │   ├── inventory.ts
│   │   ├── ledger-query.ts
│   │   ├── livestock.ts
│   │   ├── population-input.ts
│   │   ├── production-input.ts
│   │   ├── report.ts
│   │   ├── reseller.ts
│   │   └── table-sort.ts
│   ├── format.ts
│   ├── navigation.ts
│   ├── receipts.ts
│   ├── roles.ts
│   ├── status-presentation.ts
│   ├── utils.ts
│   └── validation.ts
├── next.config.ts
├── package-lock.json
├── package.json
├── playwright.config.ts
├── public/
│   ├── file.svg
│   ├── globe.svg
│   ├── logo.png
│   ├── next.svg
│   ├── vercel.svg
│   └── window.svg
├── scripts/
│   ├── bootstrap-admin.ts
│   ├── database-target.ts
│   ├── migrate.ts
│   ├── smoke-imagekit.ts
│   └── update-project-structure.mjs
├── server/
│   ├── auth/
│   │   ├── accounts.ts
│   │   ├── actions.ts
│   │   ├── bootstrap.ts
│   │   ├── config.ts
│   │   ├── permissions.ts
│   │   └── workspace.ts
│   └── services/
│       ├── corrections.ts
│       ├── eggs.ts
│       ├── errors.ts
│       ├── farm.ts
│       ├── feed.ts
│       ├── finance.ts
│       ├── health.ts
│       ├── imagekit.ts
│       ├── inventory-actions.ts
│       ├── population.ts
│       ├── production-summary.ts
│       ├── receipts.ts
│       ├── report-pdf.ts
│       ├── reports.ts
│       ├── reseller-actions.ts
│       ├── reseller.ts
│       ├── table-order.ts
│       ├── transactions.ts
│       └── workflow-actions.ts
├── tests/
│   ├── e2e/
│   │   ├── setup.ts
│   │   └── workspace.spec.ts
│   ├── integration/
│   │   ├── auth.test.ts
│   │   ├── fixtures.ts
│   │   ├── health-finance.test.ts
│   │   ├── inventory.test.ts
│   │   ├── livestock.test.ts
│   │   ├── reseller-reports.test.ts
│   │   └── test-database.ts
│   └── unit/
│       ├── inventory.test.ts
│       ├── livestock.test.ts
│       ├── reseller.test.ts
│       ├── table-sort.test.ts
│       └── validation.test.ts
└── tsconfig.json
```

## Berkas dan folder yang diabaikan Git

Daftar ini mengikuti [aturan `.gitignore`](.gitignore) dan aturan ignore lokal Git. Isinya dapat berbeda antar komputer. Direktori dependensi, cache, dan hasil build atau pengujian ditampilkan sebagai direktori. Entri seperti `.env.local` hanya mencantumkan nama berkas.

```text
kandang-pagi/
├── .env.local
├── .next/
├── next-env.d.ts
├── node_modules/
├── test-results/
└── tsconfig.tsbuildinfo
```

Jalankan `git ls-files --others --ignored --exclude-standard` untuk melihat nama berkas yang diabaikan, termasuk isi direktori yang diringkas. Gunakan `git check-ignore -v -- .env.local` untuk melihat sumber aturan yang berlaku pada satu path.
