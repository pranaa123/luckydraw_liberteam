# Target Supabase dan Vercel

Root lokal/build harus **doorprize-baru**, bukan direktori aplikasi lama. Repository Git aplikasi baru berisi isi folder ini langsung di akar repository: package.json, Dockerfile, app/ dan public/ tidak berada dalam subfolder doorprize-baru kedua. Saat memakai checkout repository baru, gunakan akar checkout sebagai konteks build. Koneksi database cloud dan deployment belum diaktifkan. Semua pengujian tahap ini memakai database QA lokal.

## Jalur runtime

PHP tetap menjadi backend. Dockerfile membangun asset memakai Node lalu mengemas PHP 8.3/FrankenPHP dengan pdo_pgsql, mbstring dan curl. Caddy hanya mengekspos public/. Vercel mendokumentasikan deployment PHP melalui Docker/Container; jalur ini tidak memakai vercel-php komunitas yang sudah diarsipkan. Panduan: https://vercel.com/kb/guide/deploy-php-on-vercel-with-docker.

Supabase menyimpan PostgreSQL pada skema privat doorprize. Gunakan koneksi pooler Supabase dengan TLS untuk runtime serverless, kredensial di environment server, bukan frontend. PDO menggunakan emulated prepares dan koneksi non-persistent. Temporary table hanya hidup dalam satu transaksi dan ON COMMIT DROP; tidak ada state sesi yang diandalkan antar-request. Panduan koneksi: https://supabase.com/docs/guides/database/connecting-to-postgres.

## Migrasi dan state

Untuk Supabase baru, jalankan **supabase/migrations** berurutan: baseline lengkap skema + 001–005, lalu Google Sheets dan owner_auth. Nama migrasi dibuat CLI Supabase 3.1.0. Baseline menjalankan DDL hanya bila skema doorprize belum ada; ia tidak menulis ulang data yang sudah ada. scripts/build-database-baseline.mjs menghasilkan snapshot baseline dari skema lama dan check:supabase-schema mendeteksi drift. Perubahan berikutnya menggunakan migrasi baru, bukan mengedit baseline yang sudah diterapkan.

Lokal/native: scripts/setup-database.php tetap menjalankan schema bila perlu, database/migrations, lalu supabase/migrations; baseline mendeteksi skema yang sudah terpasang dan dilewati. Runtime PGlite memakai urutan yang sama. Uji PostgreSQL kosong menggunakan hanya paket Supabase juga lulus, sehingga tidak memerlukan penerapan lima file manual sebelum migrasi Sheets. Jangan memakai proyek/kredensial aplikasi lama.

Cursor, lease, hash baris, konflik, jadwal, status dan audit Google Sheets ada di PostgreSQL. Panggilan Google berada di luar transaksi. Satu request memproses maksimal 200 perubahan, tidak membutuhkan daemon/interval server, file data lokal, atau memori bersama antar-instance Vercel. Operator yang terbuka menjadwalkan sinkronisasi; dua jendela dibatasi Web Locks dan lease database. Jika seluruh operator ditutup, data diteruskan dari cursor saat dibuka kembali. Jadwal tutup diperiksa waktu server sebelum dan setelah jaringan; tidak ada penerimaan terlambat meski browser tertutup. Sinkronisasi tanpa operator terbuka memerlukan scheduler cloud tersendiri pada tahap berikutnya.

Adapter HTTP job di scripts/google-http-bridge.mjs hanya menghindari antrean PHP WASM terblokir selama pengembangan. Ia tidak digunakan dalam image produksi; PHP native memanggil Google melalui curl dengan batas waktu/ukuran dan validasi pengalihan HTTPS. Hasil Google hanya diterapkan jika lease/config/cursor masih berlaku dan undian tidak pending.

## Environment

- APP_ENV, APP_TIMEZONE, DB_DSN, DB_USER, DB_PASSWORD.
- APP_ENCRYPTION_KEY: base64 dari 32 byte acak, wajib di environment cloud. Kredensial konektor memakai AES-256-GCM. File kunci storage/keys/local.key hanya fallback lokal; simpan bersama backup database bila ingin memulihkan koneksi lokal.
- Jangan kirim service-role key Supabase, password database atau kunci enkripsi ke asset/HTML umum. Respons setup konektor memang membawa script dengan kunci sumber untuk dipasang oleh operator; list, audit dan broadcast tidak membawa kunci tersebut.

## Batas kesiapan saat ini

Dockerfile/Caddyfile dan migrasi disiapkan untuk jalur deployment; build Docker dan koneksi nyata Vercel/Supabase belum dijalankan pada komputer ini. Aplikasi tetap menolak APP_ENV selain local sampai Storage dan validasi runtime cloud selesai. Jangan menonaktifkan guard itu untuk publikasi.

Login email/password, sesi database, EventContext, origin/CSRF dan RLS pemilik sudah tersedia serta diuji lokal. Autentikasi ini milik aplikasi PHP/PostgreSQL, bukan Supabase Auth. Sebelum produksi: verifikasi origin/cookie Secure pada domain HTTPS; penyimpanan background persisten di Supabase Storage; penerapan baseline migrasi serta uji PDO/pooler/Container dan Google sebenarnya. Upload background lokal saat ini khusus pengembangan. Kode Docker tidak mengirim database, kunci, .env atau gambar peserta lokal ke image. Belum dinyatakan siap publik hanya karena file deployment tersedia.

## Tujuan yang ditentukan pengguna

- GitHub: https://github.com/pranaa123/luckydraw_liberteam.
- Vercel: kapsul/tim `photobooth`, proyek `luckydraw-liberteam`; belum mempunyai produksi saat ditentukan.
- Supabase: https://supabase.com/dashboard/project/mjqkrtrjrctdqnbzbbwb.

Git lokal aplikasi baru mempunyai remote origin ke repository di atas. Koneksi database cloud dan deployment belum diaktifkan. Jangan memakai project/kredensial aplikasi lama. Akun pemilik aplikasi berbeda dari kredensial GitHub/Vercel/database; password tidak disimpan dalam dokumentasi atau migrasi.
