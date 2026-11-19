# Panduan rilis dan pemulihan Kandang Pagi

## Persiapan Neon dan Vercel

1. Buat basis data produksi tersendiri di Neon. Catat endpoint, nama basis data, peran runtime dan rentang pemulihan. Pertahankan pemisahan dari PostgreSQL lokal atau proyek Neon Development. Jika Preview dipakai, sediakan basis data serta rahasia Preview tersendiri. [Dokumentasi koneksi Neon](https://neon.com/docs/connect/connect-from-any-app)
2. Di Vercel, gunakan framework Next.js, Node.js 22, instalasi berdasarkan `package-lock.json` dan perintah build `npm run build`. Atur variabel di lingkungan **Production** secara privat. [Dokumentasi variabel Vercel](https://vercel.com/docs/environment-variables)

| Variabel | Penggunaan produksi |
|---|---|
| `DATABASE_URL` | PostgreSQL produksi dengan TLS dan hak data sesuai kebutuhan. Untuk runtime serverless, gunakan endpoint pooled Neon. |
| `BETTER_AUTH_SECRET` | Nilai acak yang berbeda dari pengembangan dan sedikitnya 32 karakter. |
| `BETTER_AUTH_URL` | Asal HTTPS Vercel Production yang stabil. |
| `IMAGEKIT_PRIVATE_KEY` | Rahasia server untuk unggah, akses bertanda tangan dan pemulihan media. |
| `NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT` | Endpoint HTTPS ImageKit yang sesuai dengan kunci server. |
| `NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY` | Nilai publik yang sudah disiapkan di proyek. |
| `IMAGEKIT_RECEIPT_FOLDER` | Gunakan prefiks folder produksi tersendiri untuk bukti privat. |

3. Tetapkan hak DDL ke peran migrasi terpisah. Runtime memerlukan hak baca/tulis data dan penggunaan sequence sesuai skema. Jalankan migrasi memakai endpoint **direct** dalam terminal rilis dengan rahasia yang sudah dimuat, sesudah cadangan diambil dan SQL ditinjau. Jangan jalankan migrasi dari perintah build atau startup.
4. Setelah migrasi, bootstrap Administrator pertama melalui terminal yang sama. `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_NAME` dan `DATABASE_TARGET` dipakai pada perangkat rilis. Masukkan kata sandi di prompt terminal.

```bash
DATABASE_TARGET=production npm run db:migrate -- --production
DATABASE_TARGET=production npm run db:bootstrap-admin -- --production
```

5. Pemilik repositori menerapkan rilis melalui Vercel. Gunakan URL `*.vercel.app` yang ditetapkan untuk Production. Atur asal dan secret terpisah bila menjalankan Preview. Cookie sesi memakai flag Secure untuk HTTPS dan permintaan autentikasi mengikuti asal yang dikonfigurasi. [Referensi integrasi Better Auth](https://better-auth.com/docs/integrations/next)
6. Periksa pengaturan ImageKit untuk akses tanpa tanda tangan, termasuk transformasi bernama. Rute aplikasi memeriksa peran dan menyajikan foto secara privat menggunakan tanda tangan server yang berlaku 120 detik. Verifikasi dengan media uji privat dan bersihkan artefaknya. [Panduan keamanan ImageKit](https://imagekit.io/docs/media-delivery-basic-security)

## Pemeriksaan manual sesudah penerapan

- Buka halaman Masuk dari URL Production. Pastikan cookie sesi diberi Secure dan pendaftaran publik ditolak. Masuk sebagai Administrator yang di-bootstrap. Buat akun melalui Pengaturan, salin tautan aktivasi, dan bagikan secara pribadi sesudah memeriksa identitas penerima.
- Periksa akses pemilik yang hanya membaca, ABK tanpa akses keuangan, dan satu akun reseller dengan ruang terpisah. Uji pembatalan atau reset akun uji pada lingkungan pra-rilis. Gunakan catatan operasional nyata pada produksi.
- Periksa Poppins dan pilihan tema. Buka laporan dengan periode singkat, cocokkan ringkasan HTML dengan PDF, lalu lihat foto bukti dari akun berwenang jika fitur dikonfigurasi.
- Dokumentasikan ID migrasi, versi aplikasi, waktu, dan hasil pemeriksaan. Jangan menyalin URL aktivasi/reset, URL bertanda tangan, atau rahasia ke tiket dan log.

## Cadangan dan pemulihan

Sebelum migrasi, pastikan Neon menyediakan titik pemulihan. Simpan dump skema/data yang dienkripsi, dengan nama bertanggal dan akses terbatas. Gunakan layanan PostgreSQL lokal yang dikonfigurasi privat melalui `pg_service.conf` dan `PGPASSFILE`, sehingga argumen CLI tidak memuat kata sandi. Uji pemulihan ke basis data baru yang terisolasi.

```bash
PGSERVICE=kandang_produksi pg_dump --format=custom --file=kandang-backup.dump
PGSERVICE=kandang_restore_test pg_restore --exit-on-error --no-owner --no-privileges --dbname=kandang_restore_test kandang-backup.dump
```

Periksa tabel, jumlah transaksi, dan buku migrasi pada hasil uji. Pemulihan operasional perlu memasangkan kembali referensi berkas bukti dengan aset ImageKit. Cadangkan media secara privat sesuai kebijakan retensi. [Cadangan dan pemulihan Neon](https://neon.com/docs/postgres/backup-restore/backups)

## Penanganan gangguan

- **Migrasi gagal**. Hentikan penerapan aplikasi baru, periksa skema dan tabel migrasi, lalu evaluasi SQL pada salinan basis data. Pulihkan ke branch pemulihan bila perlu. Jalankan rollback aplikasi hanya setelah memastikan kompatibilitas skema dengan versi sebelumnya.
- **Rahasia atau sesi bocor**. Ganti kredensial terdampak, cabut sesi dan tautan yang masih berlaku, periksa audit dan lakukan pemeriksaan akses ulang. Jika rahasia ImageKit berubah, periksa akses tanda tangan dan pemulihan unggahan.
- **Unggahan tertunda**. Administrator dapat menjalankan pemeriksaan unggahan dari Keuangan → Riwayat dan koreksi. Sistem membersihkan reservasi yang berumur lebih dari lima menit. Catat kegagalan berulang dan periksa akses ImageKit.
- **Saldo operasional salah**. Temukan kejadian dan sumber transaksi di riwayat. Gunakan permintaan koreksi atau pembalik yang disetujui. Periksa posisi stok dan kas pada tanggal asli dan tanggal sesudahnya.
