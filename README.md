# Kandang Pagi

Aplikasi web operasional peternakan ayam petelur. Panduan implementasi, aturan bisnis, dan laporan verifikasi tersedia di [codex/README.md](codex/README.md).

## Pengembangan lokal

Gunakan Node.js 22 dan npm. Jalankan `npm ci` lalu `npm run dev` dan buka [localhost:3000](http://localhost:3000). `npm run lint`, `npm run typecheck`, dan `npm run build` memeriksa kode dan build produksi. Build mengambil Poppins dari Google melalui `next/font`.

Salin `.env.example` ke `.env.local` bila perlu. Isi konfigurasi secara privat. Gunakan basis data terpisah untuk pengembangan dan produksi. Simpan konfigurasi produksi di Vercel dan jalankan migrasi secara eksplisit sebagai langkah rilis terpisah.

## Basis data dan akun pertama

Siapkan PostgreSQL untuk pengembangan. Isi `DATABASE_URL`, `DATABASE_TARGET=development`, `BETTER_AUTH_URL` dan `BETTER_AUTH_SECRET` di `.env.local` secara privat. Rahasia Better Auth minimal 32 karakter acak. Gunakan asal yang tepat, misalnya `http://localhost:3000` jika browser membuka alamat tersebut.

Jalankan `npm run db:migrate`. Untuk menyiapkan Administrator pertama, atur `BOOTSTRAP_ADMIN_EMAIL` dan `BOOTSTRAP_ADMIN_NAME`, lalu jalankan `npm run db:bootstrap-admin` di terminal. Masukkan kata sandi saat diminta. Terminal menyembunyikan input dan basis data menolak bootstrap kedua.

Administrator membuat akun di **Pengaturan → Akun pengguna**. Bagikan tautan aktivasi secara pribadi. Untuk reset, verifikasi identitas pengguna lalu terbitkan tautan reset dari daftar akun. Tautan aktivasi berlaku 24 jam dan tautan reset 30 menit. Keduanya hanya berlaku sekali.

### Pengujian

Jalankan `npm test` untuk uji unit. Siapkan basis data PostgreSQL lokal baru dengan nama berakhiran `_test` untuk setiap suite dan isi `TEST_DATABASE_URL` di lingkungan proses. Untuk uji integrasi, atur juga `BETTER_AUTH_URL` dan `BETTER_AUTH_SECRET`, lalu jalankan `npm run test:integration`. Untuk uji browser, pasang Chromium dengan `npx playwright install chromium`, jalankan `npm run build`, lalu `npm run test:e2e` menggunakan basis data uji lain yang kosong. Suite menerapkan migrasi sebelum membuat fixture.

### Rilis manual

Tinjau berkas SQL dalam `db/migrations` dan buat cadangan produksi. Dalam lingkungan migrasi terpisah, arahkan `DATABASE_URL` ke basis data produksi, atur `DATABASE_TARGET=production` dan jalankan `npm run db:migrate -- --production` secara eksplisit. Untuk bootstrap pertama di produksi, jalankan `npm run db:bootstrap-admin -- --production` dengan konfigurasi yang sama dan masukkan kata sandi di terminal. Atur `BETTER_AUTH_URL` ke asal URL Vercel Production yang stabil dan simpan rahasia di konfigurasi Vercel.

## Bukti transaksi

Isi `IMAGEKIT_PRIVATE_KEY` dan `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` secara privat. `IMAGEKIT_RECEIPT_FOLDER` mengatur direktori, dengan nilai bawaan `/kandang-pagi/receipts`. Gunakan prefiks berbeda untuk pengembangan dan produksi. Pembacaan melalui aplikasi menggunakan tautan bertanda tangan yang berlaku 120 detik. Batasi akses tanpa tanda tangan di pengaturan ImageKit untuk folder atau akun bukti, termasuk akses melalui transformasi bernama. Periksa halaman **Keuangan → Riwayat dan koreksi** untuk membersihkan unggahan yang tertunda lebih dari lima menit.

URL PostgreSQL lokal boleh menyertakan parameter kompatibilitas `schema=public`. Aplikasi tetap memakai skema `public`.
