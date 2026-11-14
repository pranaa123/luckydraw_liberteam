# Target Supabase dan Vercel

Root lokal/build harus **doorprize-baru**, bukan direktori aplikasi lama. Repository Git aplikasi baru berisi isi folder ini langsung di akar repository: package.json, Dockerfile, app/ dan public/ tidak berada dalam subfolder doorprize-baru kedua. Saat memakai checkout repository baru, gunakan akar checkout sebagai konteks build. Vercel dan Supabase khusus aplikasi baru sudah terhubung; database lokal tetap terpisah.

## Jalur runtime

PHP tetap menjadi backend. Dockerfile membangun asset memakai Node lalu mengemas PHP 8.3/FrankenPHP dengan pdo_pgsql, mbstring dan curl. Caddy hanya mengekspos public/. Vercel mendokumentasikan deployment PHP melalui Docker/Container; jalur ini tidak memakai vercel-php komunitas yang sudah diarsipkan. Panduan: https://vercel.com/kb/guide/deploy-php-on-vercel-with-docker.

Supabase menyimpan PostgreSQL pada skema privat doorprize. Gunakan koneksi pooler Supabase dengan TLS untuk runtime serverless, kredensial di environment server, bukan frontend. PDO menggunakan emulated prepares dan koneksi non-persistent. Temporary table hanya hidup dalam satu transaksi dan ON COMMIT DROP; tidak ada state sesi yang diandalkan antar-request. Panduan koneksi: https://supabase.com/docs/guides/database/connecting-to-postgres.

## Migrasi dan state

Untuk Supabase baru, jalankan **supabase/migrations** berurutan: baseline lengkap skema + 001–005, lalu Google Sheets dan owner_auth. Nama migrasi dibuat CLI Supabase 3.1.0. Baseline menjalankan DDL hanya bila skema doorprize belum ada; ia tidak menulis ulang data yang sudah ada. scripts/build-database-baseline.mjs menghasilkan snapshot baseline dari skema lama dan check:supabase-schema mendeteksi drift. Perubahan berikutnya menggunakan migrasi baru, bukan mengedit baseline yang sudah diterapkan.

Lokal/native: scripts/setup-database.php tetap menjalankan schema bila perlu, database/migrations, lalu supabase/migrations; baseline mendeteksi skema yang sudah terpasang dan dilewati. Runtime PGlite memakai urutan yang sama. Uji PostgreSQL kosong menggunakan hanya paket Supabase juga lulus, sehingga tidak memerlukan penerapan lima file manual sebelum migrasi Sheets. Jangan memakai proyek/kredensial aplikasi lama.

Cursor, lease, hash baris, konflik, jadwal, status dan audit Google Sheets ada di PostgreSQL. Panggilan Google berada di luar transaksi. Satu request memproses maksimal 200 perubahan, tidak membutuhkan daemon/interval server, file data lokal, atau memori bersama antar-instance Vercel. Operator yang terbuka menjadwalkan sinkronisasi; dua jendela dibatasi Web Locks dan lease database. Jika seluruh operator ditutup, data diteruskan dari cursor saat dibuka kembali. Jadwal tutup diperiksa waktu server sebelum dan setelah jaringan; tidak ada penerimaan terlambat meski browser tertutup. Sinkronisasi tanpa operator terbuka memerlukan scheduler cloud tersendiri pada tahap berikutnya.

Adapter HTTP job di scripts/google-http-bridge.mjs hanya menghindari antrean PHP WASM terblokir selama pengembangan. Ia tidak digunakan dalam image produksi; PHP native memanggil Google melalui curl dengan batas waktu/ukuran dan validasi pengalihan HTTPS. Hasil Google hanya diterapkan jika lease/config/cursor masih berlaku dan undian tidak pending.

## Environment

- APP_ENV (`local`, `preview`, `production`), APP_URL (origin HTTPS kanonis), APP_TIMEZONE, DB_DSN, DB_USER, DB_PASSWORD. Runtime menolak konfigurasi cloud yang belum lengkap. Origin preview tambahan berasal dari VERCEL_URL yang disediakan server, bukan header proxy klien.
- APP_ENCRYPTION_KEY: base64 dari 32 byte acak, wajib di environment cloud. Kredensial konektor memakai AES-256-GCM. File kunci storage/keys/local.key hanya fallback lokal; simpan bersama backup database bila ingin memulihkan koneksi lokal.
- Jangan kirim service-role key Supabase, password database atau kunci enkripsi ke asset/HTML umum. Respons setup konektor memang membawa script dengan kunci sumber untuk dipasang oleh operator; list, audit dan broadcast tidak membawa kunci tersebut.
- BACKGROUND_DRIVER=`supabase`, SUPABASE_URL, SUPABASE_SECRET_KEY dan SUPABASE_BACKGROUND_BUCKET=`doorprize-backgrounds`. Bucket privat menerima PNG/JPG/WebP maksimal 20 MB. Browser meminta URL upload untuk satu objek, mengunggah langsung ke Storage, lalu server memvalidasi bytes/dimensi sebelum menandai aset siap. Pembacaan memerlukan sesi dan registry milik acara, lalu redirect ke URL download 120 detik. Token signed URL tidak dicatat pada konfigurasi visual/audit/broadcast.
- Role runtime `doorprize_server` hanya membaca users dan mengelola sesi/pembatasan login pada skema privat. Query acara beralih ke `doorprize_app` dengan claim pemilik per transaksi. Password role diaktifkan melalui provisioning privat, bukan migrasi/Git. Pooler transaction port 6543 memakai TLS; nama host diambil dari metadata proyek yang ditautkan.

## Batas kesiapan saat ini

Build Container PHP berhasil pada Vercel. Preview terproteksi telah memverifikasi PDO/pooler, login pemilik, cookie Secure/HttpOnly/SameSite, CSRF/origin di balik HTTPS, isolasi pemilik dan upload/validasi/download background privat. Fixture 500 peserta dan akun QA dibatasi workspace terpisah lalu dihapus. Aksi Mulai/Stop/Sahkan/Kosongkan pada sesi uji cloud aktif tercatat 143–215 ms; pengujian lokal 50.000+ peserta/100 hasil juga mempertahankan batas <1000 ms. Angka ini bukan jaminan cold start: permintaan pertama Container pada pengujian membutuhkan sekitar 3,9 detik.

Autentikasi ini milik aplikasi PHP/PostgreSQL, bukan Supabase Auth. Tidak ada pendaftaran umum atau password bawaan di source. Source deployment diperiksa melalui `vercel deploy --dry --json`; database lokal, .env, cache, token dan upload lokal tidak ikut. Pemeriksaan Google Sheets memakai fixture lokal; spreadsheet/monitor fisik pengguna tetap memerlukan uji perangkat/sumber sebenarnya. Menghubungkan cloud tidak menyalin peserta atau riwayat lokal secara otomatis.

## Tujuan yang ditentukan pengguna

- GitHub: https://github.com/pranaa123/luckydraw_liberteam.
- Vercel: **Kapsul Photobooth**, slug `kapsul-photobooth`, proyek `luckydraw-liberteam`; domain `luckydraw-liberteam.vercel.app`. Proyek awal berisi garis bawah telah disesuaikan ke nama yang diminta pengguna karena registry menolak jalur image sebelumnya. ID proyek dan tautan GitHub dipertahankan.
- Supabase: https://supabase.com/dashboard/project/mjqkrtrjrctdqnbzbbwb.

Git lokal aplikasi baru mempunyai remote origin ke repository di atas. Region fungsi Vercel `sin1` berdampingan dengan Supabase `ap-southeast-1`. Migrasi Supabase diterapkan melalui CLI ke ref eksplisit; seluruh 16 tabel acara dan 3 tabel auth memiliki RLS. Jangan memakai project/kredensial aplikasi lama. Akun pemilik aplikasi berbeda dari kredensial GitHub/Vercel/database; password tidak disimpan dalam dokumentasi atau migrasi.
