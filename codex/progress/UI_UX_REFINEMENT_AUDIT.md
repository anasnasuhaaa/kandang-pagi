# Audit antarmuka Kandang Pagi

Baseline audit lokal `b5995ce`. Konfigurasi `base-nova` menggunakan Base UI 1.9, shadcn 4.23, React 19 dan Next 16. Pada baseline, TanStack Table belum terpasang. Halaman tetap memakai Server Components dan membatasi data sesuai sesi.

| Modul dan tampilan | Kolom dan tindakan saat audit | Cakupan dan urutan awal |
| --- | --- | --- |
| Dashboard | Tidak ada tabel. Kartu populasi, panen, pakan, vaksin dan kas. Grafik populasi. | Administrator dan Pemilik melihat kas, ABK melihat operasional. |
| Populasi · Kandang | Kode, nama, lokasi, status, aktivasi/nonaktif khusus Administrator. | Pencarian kode/nama, 12 baris, kode. |
| Populasi · Kelompok | Nama/kode, kandang, populasi, awal, ditempatkan, umur, asal, status. | Filter tanggal, lokasi, kelompok, pencarian, 12 baris, kode. |
| Populasi · Mutasi/Riwayat | Tanggal, kelompok, jenis, jumlah, asal, tujuan, catatan. Riwayat menambah pencatat, waktu, status/alasan dan pembatalan bersyarat. | Tanggal, kandang, kelompok, pencarian. SQL 12 baris berdasarkan tanggal dan urutan kejadian. |
| Pakan · Jenis Pakan | Kode, nama, kategori, status. | Kategori dan pencarian, 12 baris. |
| Pakan · Stok Pakan | Pakan/lokasi, gram ditampilkan dalam kg, nilai khusus peran keuangan. Tindakan pengukuran hari ini. Riwayat pengukuran memuat tanggal, pakan, kandang, sisa, terbuang, kembali, konsumsi. Penyesuaian memuat tanggal, jenis, pakan, lokasi, berat, catatan dan status. | Filter produk, tanggal, pencarian, 12 baris per tampilan. |
| Pakan · Aktivitas Pakan | Tanggal, aktivitas, produk, berat, lokasi, biaya untuk peran berwenang, detail, status. | Tanggal, produk, jenis, pencarian, 12 baris. Tautan tab lama tetap berlaku. |
| Produksi Telur · Panen/Sortir/Stok/Penjualan/Riwayat | Panen menurut tanggal dan sumber dengan butir, berat dan rincian. Sortir menurut lot dan kategori. Stok menurut kategori dan butir. Penjualan dan riwayat menampilkan kategori/rincian, jumlah, nominal sesuai peran, catatan, status. | Filter periode/kategori/pencarian, 12 baris. Pertahankan pembatasan transaksi dan kolom harga ABK. |
| Kesehatan · Kejadian/Jadwal/Pelaksanaan/Karantina | Kejadian memuat tanggal, jenis, kandang/kelompok, pengamatan, tindakan, petugas, status, pembaruan. Jadwal memuat tanggal, vaksin, lokasi, kelompok, status, catatan. Pelaksanaan menambah petugas dan hasil. Karantina memuat mulai, akhir, lokasi, kelompok, alasan, status, penyelesaian. | Filter kandang, periode, pencarian, 12 baris. Aksi hanya untuk operator dan baris yang memenuhi syarat. |
| Keuangan · Ringkasan/Pemasukan/Pengeluaran/Riwayat | Tanggal, kategori, sumber, nominal, catatan, jenis/status, bukti, koreksi. Pemilik membaca, Administrator mengubah. | Filter tipe, periode, pencarian, 12 baris. |
| Koreksi · Pengaturan/Keuangan | Tanggal, jenis, pemohon, nilai awal/usulan, alasan, status, alasan peninjau, keputusan. | Permintaan menunggu tetap terlihat sesuai aturan periode. Administrator meninjau, ABK terbatas pada permintaannya. |
| Reseller · Stok/Stok Masuk/Penjualan/Keuangan/Satuan | Saldo kategori dan riwayat tanggal, jenis, kategori, butir, kemasan/berat, kas, catatan, status, pembatalan. Satuan memuat tanggal efektif, kode, nama, faktor, versi, status, revisi. | Lingkup reseller dari sesi. Periode/kategori/pencarian, 12 baris. |
| Laporan · Operasional/Keuangan/Reseller | Operasional harian, penerimaan/distribusi pakan, sisa, sortir, stok akhir telur, buku kas, stok reseller, pergerakan stok/kas dan versi satuan. Detail tanggal, kategori/identitas, jumlah, berat, nominal, status, dan catatan sesuai keluarga. | Filter cakupan di server. Tiap bagian memakai 15 baris dan proyeksi maksimal 300. Urutan PDF mengikuti proyeksi server. |
| Pengaturan · Profil/Akun/Riwayat | Profil, kata sandi dan tema. Akun memuat nama, email, peran, status dan tindakan akun. Riwayat memuat waktu, pengguna, peran dan aktivitas. | Administrator untuk akun/audit. SQL akun 12 baris berdasarkan waktu dibuat, audit 15 baris berdasarkan waktu dicatat. |
| Masuk, akses, halaman tidak ditemukan, galat dan pemuatan | Form login dan tautan, pemulihan navigasi, skeleton dan coba lagi. | Pertahankan kontrol kata sandi, validasi, dan pembatasan tautan. |

## Temuan dan implementasi yang diperlukan

- Ketiga jalur tabel memakai presentasi berbeda, dua lapisan gulir, dan belum memiliki penomoran atau kontrol urutan. Satukan presentasi. Pilih pengurutan pada proyeksi terotorisasi untuk ledger, SQL untuk riwayat dan akun, serta TanStack untuk bagian laporan yang sudah dibatasi.
- Pisahkan nilai mentah dari tampilan. Urutkan nominal bigint, berat gram, jumlah, tanggal bisnis, timestamp dan label Indonesia. Gunakan unit sebagai kunci pertama untuk sel dengan dimensi berbeda. Pertahankan urutan laporan PDF.
- Gunakan indikator semantik untuk status akun, pencatatan, kelompok, vaksin, kejadian kesehatan, karantina, koreksi, serta versi satuan. Kategori telur memakai identitas tersendiri. Gunakan indikator arah untuk masuk/keluar dan arus kas.
- Gabungkan kontrol baris yang berlaku menjadi menu dengan fokus yang kembali ke pemicu. Uji tindakan bergantung peran, bukti baca/unggah/ganti, perubahan akun, pembatalan dan persetujuan.
- Pertahankan pemilih mode seluler, tata letak sidebar Pakan, dan kontrol tanggal. Tinjau fokus, scroll lokal, header tabel, teks panjang, ketepatan angka, kontras tema dan keterbacaan kartu.


## Hasil tindak lanjut

- Seluruh tabel memakai kolom `#`, header urutan dengan `aria-sort`, satu wilayah gulir yang bisa difokuskan, dan hitungan hasil setelah filter. Tabel baca-saja tidak memiliki menu tindakan kosong.
- Urutan nominal dan berat memakai data mentah. Sel gabungan memakai nilai utama yang sesuai, seperti nama kelompok, tanggal lot, total butir penjualan, atau jumlah bersih pergerakan. Nilai koreksi dan satuan campuran dikelompokkan menurut dimensi sebelum dibandingkan.
- Status dipetakan dari nilai skema dan proyeksi aktual. Nilai tidak dikenal memakai status netral. Menu baris mengikuti pembatasan peran dan kondisi transaksi. Cakupan laporan PDF tetap ditentukan oleh filter laporan.
- Baseline browser memeriksa 320, 375, 768 dan 1440 px serta kontras dan struktur dalam dua tema. Hasil akhir dan batas verifikasi tercatat di [laporan refinement](reports/UI_UX_REFINEMENT_REPORT.md).
