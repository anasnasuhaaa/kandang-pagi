# Laporan refinement UI/UX Kandang Pagi

Pelaksanaan 24 November 2026 (WIB), dimulai dari `b5995ce`. Aplikasi memakai Poppins, merek merah, tema terang dan gelap, serta komponen shadcn Base UI. Perubahan mencakup sembilan modul dan tampilan akun, pemuatan, galat, serta halaman yang tidak ditemukan.

## Tahap dan pemeriksaan

| Tahap | Hasil | Commit lokal |
| --- | --- | --- |
| 01 | Audit semua rute, tab, peran, tabel, status, dan aksi. Lima skenario Chromium baseline lolos. | `6a16751` |
| 02 | Token semantik terang/gelap, pemetaan status bertipe, indikator bersama. Typecheck dan ESLint sasaran lolos. | `8ab9531` |
| 03 | Tampilan tabel bersama, nomor baris, satu wilayah gulir. TanStack Table 8.21.3 untuk bagian laporan. | `0298bb7` |
| 04 | Urutan data mentah sebelum halaman, navigasi halaman dan hitungan hasil. Tipe PDF tetap menerima baris tampilan. | `640b815` |
| 05 | Menu tindakan per izin, dialog/form terpisah, fokus kembali ke pemicu. Tiga skenario ponsel lolos setelah build. | `26ec101` |
| 06 | Populasi, Pakan, Produksi Telur memakai status, indikator arah, dan format kolom sesuai data. | `63bb1d2` |
| 07 | Kesehatan, Keuangan, Koreksi, dan Reseller memakai status, arah kas, riwayat bukti, dan filter tabel yang mandiri. | `5477e24` |
| 08 | Ikon metrik, grafik populasi, laporan dengan metadata urutan, indikator peran dan profil. Typecheck dan lint lolos. | `d464ef1` |
| 09 | Pemilih tab ponsel dengan aksi kontekstual, target sentuh, dialog internal bergulir, dan reduced motion. Uji sasaran menemukan selektor yang ikut membaca simbol dropdown. Regresi menguji teks pilihan saja. | `49ce85f` |
| 10 | Regresi urutan dan akses, audit browser lintas modul, dan dokumentasi. | Commit yang memuat laporan ini |

## Implementasi

- `DataTable`, `DataTableRow`, `DataCell`, dan `PageLinks` menetapkan header, nomor baris, kolom angka, pembungkus catatan, dan paginasi. `LedgerTable` menyusun slot tampilan server dengan nilai urutan mentah. `ReportTable` memakai TanStack pada bagian laporan yang sudah dibatasi dan menyimpan urutan tiap bagian di browser. [Panduan Data Table shadcn Base UI](https://ui.shadcn.com/docs/components/base/data-table)
- Nama, status dan kategori dibandingkan menurut label. Ledger dan laporan memakai `Intl.Collator("id-ID")`. Drizzle menggunakan kolasi ICU Indonesia jika tersedia dan kolasi basis data untuk teks huruf kecil sebagai cadangan. Nominal disimpan dan dibandingkan sebagai bigint, bobot memakai gram, dan waktu memakai tanggal bisnis atau timestamp. Nilai kosong berada di akhir. Nilai sama menggunakan urutan awal atau ID stabil.
- Buku kas dan antrean koreksi menggunakan parameter URL masing-masing. Saldo per kategori reseller mengikuti filter stok dengan urutan tersendiri. Perubahan kolom urutan mengembalikan halaman pertama. Kelompok Populasi diurutkan menurut proyeksi penempatan pada tanggal yang dipilih. Pengurutan audit, akun dan mutasi memakai allowlist SQL sebelum LIMIT.
- `StatusBadge` dan `SemanticIndicator` memakai hijau untuk sukses, kuning untuk pending/perhatian, merah untuk penolakan, pembatalan atau keterlambatan, biru untuk informasi atau jadwal, ungu untuk revisi/pembalik, dan netral untuk saldo awal atau status nonaktif. Indikator pemasukan/pengeluaran dan transfer memakai ikon serta label arah. Telur coklat memakai warna bumi, putih netral, belum disortir kuning dan cacat merah.
- Tombol utama menyimpan atau membuat pencatatan. Filter dan ekspor memakai outline. Menu tiga titik memakai ghost dan mengelompokkan tindakan yang diizinkan. Pembatalan, penangguhan, serta perubahan dengan dampak kas/stok tetap melalui validasi dan konfirmasi yang berlaku. Unggah dan riwayat bukti memakai jalur akses privat yang sudah ada. [Panduan Dropdown Menu shadcn Base UI](https://ui.shadcn.com/docs/components/base/dropdown-menu)
- Audit tabel mencakup kandang, kelompok, mutasi, riwayat, lima tampilan Pakan, lima tab Produksi Telur, empat tab Kesehatan, buku kas dan antrean koreksi. Audit juga mencakup saldo dan histori Reseller, konfigurasi satuan, akun, audit pengguna, dan sembilan bentuk bagian laporan. Rincian kolom dan peran tersedia di [inventaris audit](../UI_UX_REFINEMENT_AUDIT.md).

## Verifikasi akhir

| Pemeriksaan | Hasil |
| --- | --- |
| `npm run lint` | Lolos. |
| `npm run typecheck` | Lolos. |
| `npm test` | 20 lolos. |
| `npm run test:integration` | 32 lolos pada PostgreSQL lokal, termasuk pengurutan data akun dan mutasi sebelum paginasi. |
| `npm run build` | Lolos dengan Poppins dan seluruh rute App Router. Build ulang final juga lolos pada salinan terisolasi. |
| `npm run test:e2e -- --workers=1 --timeout=90000` | 19 skenario lolos setelah uji ulang. Putaran pertama 15/19. Dua selektor tab seluler diperbaiki dan dua skenario kalender diulang setelah timeout dan gangguan D-Bus pada Chromium. Keenam skenario pada uji ulang, termasuk empat skenario tersebut, lulus. |
| `npm run docs:structure` dan `npm run docs:structure -- --check` | Keduanya lolos. |

Basis data integrasi dan browser merupakan basis data PostgreSQL 18 lokal yang terpisah. Refinement ini tidak menambah migrasi. Uji browser memakai Chromium dan emulasi viewport. Pemeriksaan visual Populasi dilakukan pada 390 dan 1440 px. Axe tidak menemukan pelanggaran pada Dashboard dan tabel Populasi terisi yang diurutkan dalam kedua tema. Pengujian lintas modul mencakup Administrator, Pemilik, ABK dan Reseller. Uji integrasi untuk bukti memakai penyedia tiruan. Unggahan ImageKit nyata dan penerapan Vercel berada di luar verifikasi ini.

Perubahan awal pengguna dipertahankan, termasuk skrip dan konfigurasi peta proyek yang sudah ada. Seluruh commit refinement dibuat lokal. Tidak ada Git push.
