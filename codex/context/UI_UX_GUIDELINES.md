# UI/UX Design System — Kandang Pagi

## Brand and appearance

- Product name: **Kandang Pagi**.
- Client-requested primary **red**; proposed token `#DC2626` with hover `#B91C1C`, pale red for subtle selected states. Preserve flexibility if the client later provides official brand colors.
- **Poppins** via `next/font/google`, applied consistently to body, forms, dialogs, tables, navigation, charts and PDF UI where applicable.
- Both **Light** and **Dark** themes with per-user preference (local temporary preference acceptable pre-auth; account-saved preference when authenticated). Ensure no hydration flash in final app. Contrast must remain accessible.
- Use red for primary actions/active nav; success/warning/error use distinct semantic tokens. Not every status/chart should become red.
- A clean, modern operations dashboard: compact but readable, moderate radius/space, subtle surfaces and deliberate chart color use. No flat page of raw HTML primitives.

## Component contract

Use **library-generated shadcn/ui for Base UI**, including when rendering field controls and data tables. Inspect existing `components.json`; do NOT reinitialize to Radix or copy incompatible snippets. An app-specific `DatePicker`, `MoneyField`, `QuantityField`, `DataTable` or chart wrapper may be composed from shadcn components, but not be a homemade replacement for foundational Button/Dialog/Select/Input etc.

Recommended: sidebar, breadcrumb/header, Card, Tabs, Button, Badge, Table and TanStack Table, Input, Select, Checkbox, Textarea, Popover/Calendar, Dialog, AlertDialog, Sheet or Drawer, Tooltip, Skeleton, Form/Field, Sonner Toaster, DropdownMenu, Pagination. Install missing shadcn components via the current CLI and inspect generated source carefully.

## Sidebar and page map

Exactly one sidebar entry for each:

1. Dashboard
2. Populasi Ternak
3. Pakan
4. Produksi Telur
5. Kesehatan & Vaksin
6. Keuangan
7. Reseller
8. Laporan
9. Pengaturan

Permission-hide inaccessible modules and protect routes server-side. Within each page use tabs for subfeatures. Action button must reflect selected tab, e.g. on Pakan: `Tambah Pakan Masuk`, `Buat Mix Pakan`, `Catat Pakan Keluar`, `Catat Sisa Pakan` — never one vague `Tambah Data` for every tab.

## Data module visual hierarchy

1. Header: title, description, active period/filter summary, contextual action.
2. Live summary/KPI cards with values, units and as-of date; show **loading**, **no data**, **incomplete** distinctly.
3. A chart or lightweight context if genuinely useful for decisions.
4. Tabs for relevant subworkflows.
5. Shared DataTable with search and filters where applicable, sortable data headers, row numbers, pagination, empty and loading states, and permission-aware row actions.
6. Transaction details via dialog/sheet for inspection, auditing, correction requests, and approval if authorized.

## Shared tables and actions

- Use `DataTable` for the shadcn table surface, `DataTableRow` for the first `#` column, `DataCell` for column-specific alignment and wrapping, and `PageLinks` for the result count and page controls. Use stable row IDs and column IDs. Row numbers follow the result order across pages.
- Filter the authorized result, sort typed values, then paginate. Use allowlisted Drizzle ordering for database-paginated accounts, account audit, and population history. Sort the existing dated flock snapshot before slicing. Use TanStack Table for report sections within the existing report limit. Keep browser sorting independent of the PDF order.
- Use `urut` and `arah` for URL sort state. Clicking a header cycles through ascending, descending, and the default order. Reset pagination on sort or filter changes. When a page has two tables with independent controls, use scoped query keys to preserve the other table's settings.
- Sort monetary amounts as bigint and weights in grams. Compare labels with Indonesian collation. Use nulls last and stable ties. Group incompatible dimensions by unit before comparing their quantities. Choose a clear primary key for composite columns.
- Use the shared `RowActions` ellipsis menu for supported row operations. Place it on the right and render it only when that row has an authorized action. Menu actions open the existing dialog or sheet after menu dismissal and return focus to the trigger. Use destructive styling for actual suspension, reversal and cancellation.
- Use `StatusBadge` for lifecycle, eligibility or category and `SemanticIndicator` for directions and movement types. Green indicates success, amber pending or attention, red rejected or overdue, blue scheduled or informational, purple adjustments and revisions, and gray inactive, archived or opening balances. The indicator always includes a readable label. Colors for egg categories distinguish ungraded, brown, white and defective eggs.
- Keep `MetricCard` neutral. Use a compact Lucide icon and a semantic tone for the icon when the underlying data warrants it. Keep values tabular and retain the distinction between zero and missing observations.

## Forms

- Use React Hook Form + Zod and the correct Base UI shadcn field/label/error composition; validate server-side too.
- Date input must be usable on both mobile and desktop, with Jakarta-local date clearly displayed; do not rely only on raw browser date/time picker if UX degrades.
- Currency field displays `Rp`, accepts valid locale-friendly input, normalizes safely to exact IDR; quantities show kg/butir with explicit precision and conversion rules.
- Derived numbers (price/kg, mix totals, egg sale total) shown read-only and recalculated on server before commit.
- Desktop Dialog for shorter create/edit flows; mobile Sheet/Drawer/full-screen form where appropriate. Multi-step complex forms may use a dedicated page.
- Display stock availability, constraints and consequences before transaction submission; sensible confirmation for cancellation, approval or stock impact.
- Preserve input after server-side errors and show field and form-level messages.

## Responsive acceptance

- Test at 320, 360, 375, 390, 430, 768, 1024, 1280 and 1440 px, including long Indonesian words, charts and error states.
- Keep horizontal scrolling within each table’s single keyboard-focusable scroll region. Allow meaningful long descriptions to wrap and keep amounts right-aligned.
- Buttons must be tappable; modals must fit viewport and scroll internally; keyboard focus remains visible and trapped when appropriate.
- Keep the mobile sidebar and place the compact module selector beside the active action. Desktop retains tabs and the overview above the controls. Keep pagination and form actions within the viewport.
- Skeleton loading for meaningful network fetches; avoid flashing `Menghubungkan...` or a fake live status for fast requests.

## Indonesian copy guidance

- Plain familiar labels: `Tambah`, `Simpan`, `Batalkan`, `Konfirmasi`, `Tanggal`, `Jumlah`, `Berat (kg)`, `Harga`, `Stok Tersedia`, `Belum Disortir`, `Menunggu Pencatatan`, `Koreksi Ditolak`, `Lihat Riwayat`.
- Never show developer jargon (ORM, Zod, JWT, transaction rollback) to operators.
- Distinguish stock **available** vs stock **already distributed**, current **zero** vs **not measured**; cash balance vs profit.
- Receipts and PDFs with Indonesian headings and dates.

## Review checklist

Use visible UI review for desktop/mobile. Verify form errors, menu tab actions, empty data, cross-role navigation, light/dark contrast, Poppins loading, toast timing, and page-level scroll. Correct major design regressions before stage commit.
