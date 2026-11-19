# Kandang Pagi

Aplikasi web operasional peternakan ayam petelur. Panduan implementasi, aturan bisnis, dan laporan verifikasi tersedia di [codex/README.md](codex/README.md).

## Pengembangan lokal

Gunakan Node.js 22 dan npm. Jalankan `npm ci` lalu `npm run dev` dan buka [localhost:3000](http://localhost:3000). `npm run lint`, `npm run typecheck`, dan `npm run build` memeriksa kode dan build produksi. Build mengambil Poppins dari Google melalui `next/font`.

Salin `.env.example` ke `.env.local` bila perlu. Isi konfigurasi secara privat. Gunakan basis data terpisah untuk pengembangan dan produksi. Simpan konfigurasi produksi di Vercel dan jalankan migrasi secara eksplisit sebagai langkah rilis terpisah.
