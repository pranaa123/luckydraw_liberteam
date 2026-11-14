# Doorprize baru

Pondasi aplikasi PHP 8.3 modular, PostgreSQL, dan Tailwind CSS. Proyek ini berdiri sendiri di folder `doorprize-baru`; tidak memakai kode, dependensi, konfigurasi, atau database aplikasi lama.

## Jalankan lokal

Jalankan perintah dari direktori ini:

```sh
npm ci
npm run build
npm run dev
```

Buka **http://127.0.0.1:8091**. Pada browser desktop yang mendukung Window Management, klik **Pilih layar**, berikan izin layar, pilih monitor eksternal, lalu klik **Tampilkan**. Visual langsung fullscreen pada layar pilihan dan kontrol operator ditempatkan di layar utama. Tidak perlu menggeser jendela atau mengklik fullscreen pada output. Izinkan popup agar jendela operator dapat dibuka. Pilihan layar diingat selama sesi; izin yang sudah diberikan diperiksa kembali ketika operator dimuat ulang.

Alur ini memanggil fullscreen langsung dari klik operator, sebelum membuka kontrol operator. Tidak membutuhkan izin fullscreen otomatis tanpa interaksi. Jika pemilihan layar tidak didukung atau izinnya ditolak, **Buka output** tetap tersedia untuk penempatan manual. Hubungkan monitor dalam mode Extend untuk memisahkan layar operator dan output.

Klik Tampilkan berulang, pergantian target, dan reload operator tidak memuat ulang visual yang masih berjalan. Esc mengakhiri fullscreen tetapi panggung tetap berisi visual, bukan kontrol operator. Klik Tampilkan pada operator untuk fullscreen kembali. Tombol Operator pada panggung di luar fullscreen dapat membuka kembali kontrol. Layar yang terputus mengharuskan operator memilih ulang; aplikasi tidak otomatis membuka output pada layar lain.

`npm run dev` menggunakan PHP 8.3 dan PostgreSQL portabel (PGlite) melalui Node.js jika koneksi database native belum dikonfigurasi. Data peserta, hadiah, isian tambahan, dan pengaturan acara disimpan di **`storage/database`**, tetap tersedia setelah refresh dan restart server. Background asli disimpan di **`public/assets/backgrounds`**. Tidak perlu memasang PHP/PostgreSQL secara global untuk pengembangan ini. Gunakan Node.js 22 atau lebih baru.

Menu **Persiapan** mengatur informasi acara, canvas, area nama, background dan font. Preview mengikuti rasio canvas. Ukuran area dan jaraknya dibatasi otomatis oleh canvas; posisi menggunakan slider horizontal/vertikal dengan 0 di tengah. Ukuran area berubah dari pusatnya. Mengubah dimensi canvas membuat area mengikuti ukuran penuh pada sumbu tersebut. Slider nonaktif pada 0 ketika tidak ada ruang geser; visual tetap tampil. **Default** pada kartu canvas mengembalikan canvas/area awal tanpa mengubah pengaturan lain; klik **Simpan** untuk mempertahankannya. Background menyediakan **Memenuhi canvas** atau **Tampil utuh**. Perubahan langsung terlihat pada preview/output; klik **Simpan** agar bertahan setelah refresh. **Muat ulang** mengembalikan pengaturan tersimpan. Perubahan visual memakai kanal konfigurasi kecil, tidak memuat daftar peserta dan tidak melakukan polling. SVG mempertahankan koordinat canvas dan ketajaman teks, sedangkan background diunggah tanpa diperkecil.

Pada **Hadiah**, gunakan panah naik/turun untuk menyimpan urutan; hadiah dengan stok nol tetap di bawah. Background per hadiah dapat ditautkan pada Persiapan. Putaran dengan satu jenis hadiah memakai background khusus; beberapa jenis memakai background utama.

Pada **Undian**, atur jumlah nama dan mode hadiah, lalu **Mulai → Stop → Sahkan / Eliminasi / Kosongkan**. Semua hasil disimpan saat Stop; pengesahan mengubah peserta menjadi pemenang serta mengurangi stok atomik. Eliminasi mengeluarkan seluruh hasil dari kelayakan tanpa mengurangi stok. Kosongkan membersihkan layar; hasil yang belum disahkan tetap layak. Setelah disahkan, hasil tetap terlihat sampai dikosongkan atau putaran baru dimulai. Data peserta/hadiah/isian dan pengaturan tersimpan dikunci selama putaran pending; navigasi dan preview pengaturan visual tetap bisa digunakan.

**Filter peserta** pada Undian dan Peserta menggunakan dropdown ringkas dengan switch per isian. Tombol biru dan angka menandai filter efektif; klik **×** di sampingnya untuk menghapus filter sekali klik. Pilih semua tanpa pengecualian tidak menambah penanda aktif. Dropdown dapat ditutup dengan klik luar atau Escape tanpa mengubah pilihan. Nilai dalam satu isian memakai OR; beberapa isian aktif memakai AND. **Pilih semua** mencakup seluruh nilai tanpa memuat seluruh daftar, dan nilai tertentu bisa dikecualikan. Isian aktif tanpa pilihan menghasilkan nol peserta. Pencarian nilai memakai awalan; nilai lanjutan mengikuti filter sebelumnya. Pilihan filter undian terakhir disimpan saat Mulai, dan hanya peserta yang cocok yang dapat terpilih.

Pada **Peserta**, gunakan pencarian awalan nama dan satu **Filter peserta**. Status menjadi kelompok pertama, disusul Nama/isian; seluruhnya memakai switch, multi-centang dan Pilih semua. Checkbox mempertahankan pilihan antarhalaman; **Pilih semua hasil** memilih keseluruhan hasil filter tanpa mengunduh semua ID. Checkbox baris dapat mengecualikan peserta dari pilihan seluruh hasil. **Edit massal** mengubah status, nama atau satu isian untuk pilihan tersebut. Status Pemenang/Duplikat tetap dilindungi; perubahan ditolak seluruhnya bila pilihan/skema sudah berubah. Semua mutasi dicatat dalam riwayat.

Hasil dan animasi nyata tersinkron antarjendela melalui paket perubahan, tanpa polling. Refresh/restart memulihkan putaran yang sedang berjalan/hasil tersimpan. Selama pengacakan, satu baris glyph terus berubah dengan flip per huruf dan tempo bervariasi, tanpa siklus membentuk nama. Nama terpilih baru ditampilkan setelah Stop. Mulai tidak membaca sampel nama untuk kebutuhan visual.

**Riwayat → Pemenang** menampilkan hasil yang sudah disahkan, 50 pemenang per halaman. Klik **Export PDF** untuk mengunduh A4 landscape dengan font minimal 12, informasi acara dan halaman/total di setiap lembar. Nama/isian/hadiah memakai snapshot undian; nilai/label lama tetap benar sesudah data diedit. **Aktivitas** mempertahankan audit operator dengan paginasi tersendiri.

Satu direktori database hanya boleh dibuka oleh satu proses server. Untuk pengujian di port lain, gunakan direktori database QA terpisah seperti contoh di bawah. Jangan menghapus `storage/database` jika ingin mempertahankan data.

Untuk mengubah port:

```sh
PORT=8092 npm run dev
```

## Build dan pemeriksaan

```sh
npm run build
npm run check
```

- Build menghasilkan CSS lokal dan bundle ExcelJS/lisensinya di `public/assets/vendor/exceljs`; tidak memakai CDN.
- `npm run watch` memperbarui CSS selama pengembangan tampilan.
- Pemeriksaan menjalankan PHP 8.3 dan PostgreSQL sementara di memori. Tidak menyentuh database lokal lain atau Supabase.
- Pemeriksaan pengelolaan data memakai direktori sementara tersendiri dan menguji tambah/edit/hapus, validasi, isolasi acara, paginasi, transaksi/audit, versi data, serta persistensi setelah runtime dibuka ulang. Database sehari-hari tidak dipakai.
- Pemeriksaan Persiapan menguji versi pengaturan terpisah, waktu lokal, validasi canvas, upload, rollback background hadiah, urutan, dan persistensi setelah restart.
- Pemeriksaan undian menguji pemilihan unik/layak, hadiah, stok, idempotensi, rollback, pool rapat, isolasi, snapshot dan pemulihan pada tahap berputar/hasil/disahkan setelah restart. Uji lokal 50.000+ peserta dengan 100 hasil mencatat Mulai 81 ms, Stop 77 ms, Sahkan 15 ms; hasil ini khusus runtime/mesin pengujian, bukan jaminan hosting.

Uji browser undian: jalankan server dengan `PORT=8096 DOORPRIZE_DEV_DATABASE_PATH=.cache/draws-qa-baru npm run dev`, lalu `npm run check:draws:browser`. Gunakan direktori database QA baru untuk setiap pengulangan. Uji mencakup hasil 6/20 nama, hadiah/background, stok/status, refresh, respons hilang setelah commit, request paralel, riwayat/paginasi dan tampilan mobile. File uji dihapus setelah selesai; screenshot di `.cache/draws-qa/`.
- `npm run check:browser` menguji fullscreen langsung dari klik operator tanpa izin fullscreen otomatis khusus, operator terpisah, pergantian monitor, penggunaan ulang jendela, refresh operator, Esc dan aktivasi kembali, layar terputus, izin, dan fallback. Server lokal harus berjalan. Gunakan `CHROME_BIN` jika Chrome berada di lokasi lain. Pengujian memakai layar virtual Chrome dan belum menggantikan pemeriksaan monitor fisik.
- Node.js dipakai untuk build, pemeriksaan dan runtime portabel lokal. PHP aplikasi tidak membutuhkan Node.js di produksi; ExcelJS berjalan sebagai asset browser di worker saat template/import digunakan.

Untuk QA browser formulir, jalankan server terpisah dengan database uji kosong:

```sh
PORT=8092 DOORPRIZE_DEV_DATABASE_PATH=.cache/management-database npm run dev
```

Lalu di terminal lain, dari direktori yang sama:

```sh
npm run check:management:browser
PORT=8092 npm run check:browser
```

QA formulir menambahkan dan menghapus data contoh, jadi gunakan database uji tersendiri. Mulai dari database uji kosong. Screenshot disimpan di `.cache/management-qa/desktop.png`.

Untuk QA Persiapan, gunakan database uji kosong yang berbeda di port 8093:

```sh
PORT=8093 DOORPRIZE_DEV_DATABASE_PATH=.cache/settings-database npm run dev
```

Lalu jalankan `npm run check:settings:browser`. Pengujian mencakup preview/output lintas jendela, upload dan background hadiah, serta memastikan perubahan visual tidak membuat request data atau memuat peserta. Screenshot berada di `.cache/settings-qa/`. Data/file uji bukan bagian database sehari-hari; gunakan database QA baru untuk setiap pengulangan.

Uji animasi: jalankan server QA pada port 8095 dengan database khusus, lalu `npm run check:animation:browser`. Pemeriksaan mencakup glyph yang terus berubah tanpa fase membentuk nama, batas area, sinkronisasi/refresh, Stop, reduced motion, tampilan mobile dan tidak adanya request API selama animasi. Screenshot output berada di `.cache/animation-qa/output.png`. Pengujian memakai putaran nyata pada database QA terpisah; tombol Coba animasi dan jalur uji visual terpisah sudah dihapus.

## Struktur

```text
app/
  Core/               Environment, router, view, koneksi database malas
  Modules/
    Auth/             Login email, sesi persisten, logout dan pemeriksaan akses
    Events/           Workspace, isian, informasi/visual acara, validasi dan audit
    Operator/         Halaman operator
    Presentation/     Output presentasi dan validasi/upload background
    Participants/     CRUD, query/filter, pool filter, paginasi dan edit massal
    Prizes/           CRUD hadiah, jumlah, urutan dan background terkait
    Draws/            Status dan transaksi undian
    Imports/          Excel, pratinjau, serta Google Sheets bertahap
    History/          Aktivitas, snapshot pemenang, paginasi laporan
bootstrap/            Autoload dan konfigurasi awal
config/               Konfigurasi aplikasi
database/schema.sql   Skema PostgreSQL awal dan migrasi upgrade lokal
public/               Satu-satunya direktori yang boleh disajikan web server
resources/            Sumber Tailwind dan template PHP
routes/               Pendaftaran route
scripts/              Preview dan pemeriksaan pengembangan
storage/logs/         Ruang log lokal jika dibutuhkan
```

## Database

Skema ada di `database/schema.sql`, dalam namespace privat `doorprize`. Migrasi `001_field_version.sql` dan `002_settings_version.sql` menambahkan versi isian dan versi pengaturan secara terpisah. Runtime portabel menyiapkan skema dan migrasi secara otomatis dalam database lokal khusus aplikasi baru. Jangan menjalankannya pada database aplikasi lama.

Untuk memakai PostgreSQL native, buat database khusus aplikasi baru dan gunakan PHP native dengan ekstensi `pdo_pgsql`. Salin `.env.example` menjadi `.env` di direktori ini, lalu isi `DB_DSN`, `DB_USER`, dan `DB_PASSWORD`. Jalankan `php scripts/setup-database.php`, lalu `npm run dev`. Koneksi PDO baru dibuat ketika modul membutuhkan database. Memilih koneksi native tidak memindahkan data dari database portabel secara otomatis.

Jembatan SQL portabel hanya berada di alat pengembangan Node.js; service dan repository bisnis tetap memakai PHP. Browser tidak mendapatkan endpoint SQL mentah. Request perubahan dibatasi ke JSON dari origin lokal yang sama. Mutasi mengunci acara dan memeriksa versi record; perubahan ditulis bersama audit dalam satu transaksi. Menghapus isian membersihkan nilai slot pada peserta, tanpa mengubah snapshot hasil undian.

Login email/password memakai sesi acak 30 hari dalam database privat `doorprize_auth`. Password memakai bcrypt dan token cookie hanya disimpan sebagai SHA-256; cookie HttpOnly/SameSite=Lax, Secure pada HTTPS/produksi. EventContext memakai pemilik terverifikasi. Role `doorprize_app` dan RLS membatasi seluruh data acara/staging/background per pemilik; claim hanya hidup dalam satu transaksi, cocok dengan pooler. Skema tidak dibuka ke Data API.

## Batas tahap ini

Navigasi satu halaman, preview standby, jendela output, dan tombol fullscreen sudah bekerja. Peserta bisa diinput manual, diedit, dan dihapus; hadiah dan maksimal tiga isian tambahan juga dapat dikelola dan tersimpan. Daftar peserta memakai paginasi 50 baris. Pensil/× digunakan konsisten untuk edit/hapus. Nama adalah isian wajib yang tidak dapat dihapus.

Persiapan, undian, filter, edit massal dan riwayat aktivitas tersedia. Background mendukung PNG/JPG/WebP maksimal 20 MB, canvas maksimal 32768 px per sisi, area nama wajib berada di dalam canvas. Hadiah dapat diurutkan; jumlah total mempertahankan unit yang sudah terpakai dan stok berkurang hanya saat Sahkan. Peserta/hadiah yang sudah dirujuk hasil undian tidak dapat dihapus. Import Excel/template/pratinjau dan aturan duplikasi tersedia. Google Sheets melalui konektor sekali pasang tersedia. Daftar pemenang historis dan PDF tersedia. Login, logout, sesi persisten dan akses pemilik tersedia.

`npm run check` mencakup filter/edit massal: AND/OR, nilai kosong, Pilih semua/kecuali, cursor, versi/skema, status terlindungi, pool incremental dan performa 50.000+ peserta. Uji browser: jalankan `PORT=8098 DOORPRIZE_DEV_DATABASE_PATH=.cache/filter-qa-baru npm run dev`, lalu `npm run check:filters:browser`. Gunakan database QA baru setiap pengulangan. Screenshot di `.cache/filters-qa/`. Pengujian mencakup pilihan lintas halaman, seluruh hasil/pengecualian, status/isian, undian terfilter, refresh, scroll, mobile dan tidak adanya polling saat animasi.

Uji lokal filter 50.000+ peserta/100 hasil: pembentukan pertama 235 ms, penggunaan ulang 11 ms, Stop 115 ms. Ini pengukuran pada runtime/mesin pengujian. Cache turunan tetap divalidasi terhadap peserta kanonik saat Stop; pengujian cache tidak valid memastikan hasil dibatalkan.

`APP_ENV` selain `local` tetap menghasilkan respons 503 sampai penyimpanan background cloud dan pengujian deployment selesai. Belum ada deployment Vercel atau perubahan Supabase.

Lihat [BRIEF.md](BRIEF.md) untuk kebutuhan lengkap dan [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) untuk aturan pengembangan.

## Import Excel

Di menu Peserta, klik **Import Excel → Unduh template**. Template mengikuti Nama dan maksimal tiga isian tambahan; sheet Peserta siap diisi mulai baris 7, sheet Panduan berisi contoh terpisah. Judul, tabel zebra/filter, header beku dan format teks menjaga kerapian serta nol di depan nomor/ID.

Pilih .xlsx, periksa sheet/header dan pemetaan otomatis, pilih kunci duplikasi lalu **Pratinjau → Import peserta**. Pratinjau menampilkan Tersedia/Duplikat/Tidak valid dengan paginasi; baris tidak valid dilewati dan jumlahnya jelas sebelum menyimpan. Kunci harus semuanya terisi dan cocok tanpa membedakan huruf besar/kecil; tanpa kunci tidak ada deduplikasi. Ubah aturan yang sudah tersimpan melalui **Persiapan → Aturan duplikasi**. Data baru yang lebih rapi bisa menggantikan keeper lama; status Pemenang/Tereliminasi tetap dilindungi.

Batas: .xlsx 20 MB/100.000 baris/256 kolom/50 sheet, bukan format lama .xls. Rumus hanya menggunakan hasil tersimpan. Google Sheets mempunyai alur koneksi tersendiri. Import diproses worker dan chunk, bukan pembacaan seluruh peserta berulang; penyimpanan dan audit atomik/idempotent.

`npm run check:imports` menguji template dan backend pada database memori. Untuk browser, jalankan server QA dengan direktori kosong sendiri, misalnya `PORT=8098 DOORPRIZE_DEV_DATABASE_PATH=.cache/import-qa-01 npm run dev`, lalu `npm run check:imports:browser`. Ganti direktori QA saat mengulang; jangan memakai storage/database. Origin alternatif: `DOORPRIZE_TEST_ORIGIN=http://127.0.0.1:8099 npm run check:imports:browser`. Screenshot dan workbook uji disimpan di .cache/imports-qa. Hentikan server QA setelah selesai. `IMPORT_BENCH_ROWS=5000 npm run check:imports` memperbesar fixture pengukuran; hasil bergantung pada mesin/runtime.

## Google Sheets

Di Peserta, klik **Google Sheets**, tempel tautan spreadsheet lalu **Siapkan konektor**. Tautan dengan gid memilih tab tersebut; tautan berbagi tanpa gid memilih tab pertama dan mengingat ID tabnya. Buka panduan sekali pasang, salin kode ke Apps Script spreadsheet, jalankan **pasangDoorprize**, lalu deploy sebagai Web app: jalankan sebagai Me dan akses Anyone. Spreadsheet tetap privat; endpoint memeriksa kunci konektor yang dibuat aplikasi.

Tempel URL /exec, klik **Periksa konektor**, periksa pemetaan dan contoh data, lalu **Hubungkan**. Daftar sumber ringkas menyediakan jeda/lanjut, atur ulang kolom, waktu penutupan, periksa konflik dan putus koneksi. Kunci duplikasi mengikuti Persiapan. Saat sinkronisasi awal belum selesai, Mulai ditahan agar undian tidak memakai daftar yang masih sebagian.

Sesudah snapshot awal, aplikasi mengambil catatan perubahan per 200 baris, bukan memuat seluruh peserta. Konektor juga memulihkan baris tambahan yang belum tercatat trigger melalui tail dan pointer range. Jadwal diproses pada waktu server, termasuk bila respons Google datang setelah batas. Perubahan ditahan selama hasil undian masih pending, kemudian diteruskan. Operator harus tetap terbuka untuk sinkronisasi aktif; saat dibuka kembali cursor melanjutkan data. Tidak membutuhkan daemon yang terus menyala di Vercel.

Baris dihapus dari Sheets menjadikan peserta Tereliminasi, pemenang tetap dipertahankan. Perubahan pada isian lain digabung tanpa menghapus edit operator. Jika isian yang sama bertabrakan, tombol **Periksa perubahan** memberi pilihan Pertahankan lokal/Gunakan Sheets. Baris baru yang tidak valid belum dimasukkan; perubahan tidak valid pada peserta lama mempertahankan data valid terakhir dan ditandai. Hapus manual di aplikasi tidak dibuat ulang otomatis oleh sumber.

Jangan menghapus kolom ID/log tersembunyi. Sortir seluruh baris. Perubahan struktur dapat memicu pemeriksaan snapshot ulang; perubahan header memerlukan pemetaan ulang. Trigger Google tidak berjalan untuk edit oleh skrip/API lain: panggil catatPerubahanDoorprize(barisAwal,jumlahBaris) dari skrip penulis. Kecepatan jaringan/eksekusi Google bergantung pada Google; angka pengundian lokal bukan jaminan sinkronisasi internet di bawah 1 detik.

Pemeriksaan: `npm run check:google` (PHP/PostgreSQL + simulasi API Apps Script). Browser memakai fixture, bukan spreadsheet pengguna: jalankan `PORT=8098 DOORPRIZE_DEV_DATABASE_PATH=.cache/google-qa-01 DOORPRIZE_GOOGLE_FIXTURE_PATH=.cache/google-browser/state.json node --import ./scripts/google-fixture-preload.mjs scripts/dev.mjs`, lalu `npm run check:google:browser`. Gunakan database QA kosong saat mengulang; origin alternatif melalui DOORPRIZE_TEST_ORIGIN. Screenshot berada di .cache/google-browser. Koneksi Google nyata belum dijalankan tanpa pemasangan konektor/URL deployment milik pengguna.

## Jalur deployment

[DEPLOYMENT.md](docs/DEPLOYMENT.md) menjelaskan Vercel Container PHP, koneksi pooler PostgreSQL Supabase, environment, dan batas kesiapan. Dockerfile/Caddyfile mengemas aplikasi baru saja. Paket supabase/migrations mempunyai baseline lengkap 001–005 lalu migrasi Sheets; `npm run check:supabase-schema` memverifikasi instalasi pada PostgreSQL kosong, RLS dan penerapan ulang tanpa kehilangan data. Login/owner/CSRF tersedia lokal; background persisten di Supabase Storage dan pengujian HTTPS/PDO/pooler/Container masih perlu diselesaikan sebelum publikasi; guard produksi tetap aktif. Belum ada deploy atau perubahan proyek cloud.

Uji canvas: `npm run check:canvas` memeriksa 1008 kombinasi geometri pada JS/PHP serta hierarki teks 100/50/25/25. Untuk browser, jalankan server dengan database QA kosong dan port 8098 lalu `npm run check:canvas:browser`; gunakan DOORPRIZE_TEST_ORIGIN untuk port lain. Jangan memakai port 8091/data utama. Uji browser mencakup pengetikan bertahap, max dinamis, portrait/panorama/8K, hasil fullname dalam fullscreen, fit gambar, Default → Simpan → reload, dan lebar 390 px. Screenshot di .cache/canvas-qa. Perubahan ukuran/posisi tidak menambah request API.


Isian tambahan mempunyai switch tampilan pada setiap baris di **Persiapan → Isian undian**. Nama selalu tampil. Switch tersimpan melalui **Simpan** pengaturan; tidak mengubah data/filter/duplikasi. Ukuran teks mengikuti slot: Nama 100%, tambahan pertama 50%, kedua/ketiga 25%; menyembunyikan isian tidak menyisakan baris kosong.

Data fiktif lokal: jalankan `npm run seed:sample` ketika server 8091 aktif dan tidak ada undian pending. Perintah menambahkan 500 contoh mengikuti isian dan aturan yang ada melalui import, tanpa menghapus peserta lama. Pengulangan memakai identitas batch yang sama sehingga tidak menambah ulang. Manifest/seed berada di `.cache/sample-participants/8091/batch.json`. Variasi simbol bukan otomatis duplikat; pemeriksaan tetap mengikuti kunci operator. Jangan hapus manifest jika ingin mempertahankan perlindungan pengulangan. Untuk QA, set `DOORPRIZE_SAMPLE_ORIGIN=http://127.0.0.1:8098` dengan database QA terpisah.


Nama hasil selalu satu baris, tanpa potongan atau ellipsis. Ukuran otomatis mengecil menurut jumlah pemenang, lalu grid menyesuaikan area. Mayoritas nama memakai ukuran seragam; nama yang jauh lebih panjang mendapat penyesuaian khusus agar tidak mengecilkan semua nama lain. Operator cukup memilih jumlah pemenang, tanpa mengatur font setiap putaran. Standby “Bersiap untuk mengundi” satu baris terpusat, bold 700 dan lebih besar (68% acuan glyph), tetap dibatasi ukuran area. Hierarki isian tetap 100/50/25/25 pada setiap blok.

Setelah Stop, hasil muncul dengan fade dan gerak pendek 380 ms; banyak nama memakai jeda bertahap maksimal 160 ms. Edit visual/pengesahan memakai ulang node dan tidak mengulang kemunculan. Refresh memulihkan hasil tanpa transisi ulang. Reduced motion menggunakan fade singkat tanpa pergeseran. `npm run check:results:browser` menguji perilaku ini pada server QA lokal 8098, atau gunakan `DOORPRIZE_TEST_ORIGIN` untuk port QA lain; tidak memakai 8091. Screenshot di `.cache/results-qa`.


PDF tidak membaca daftar peserta atau mengikuti switch tampil/sembunyi isian pada visual. Semua isian saat undian disertakan. Header kolom historis yang berbeda dipisah menjadi tabel tersendiri; kolom terakhir **Undian ke** adalah nomor putaran dan baris mengikuti posisi undian. PDF memakai informasi acara yang sudah disimpan saat export dimulai. Putaran pending, dieliminasi, atau dibatalkan tidak masuk laporan; Kosongkan setelah pengesahan tidak menghapus pemenang.

Engine/font PDF disalin lokal oleh `npm run build`, lalu dimuat hanya saat export di Web Worker. Download berupa berkas langsung; tidak perlu membuka dialog cetak atau mengirim data ke layanan PDF eksternal. Tombol × membatalkan export dan bisa dicoba ulang. Snapshot tetap selama mengambil halaman data, sehingga pengesahan baru tidak mengubah isi laporan yang sedang dibuat.

`npm run check:winners` menguji backend pada PostgreSQL memori dan memeriksa PDF aktual memakai PDF.js (ukuran kertas/font, semua halaman/data, info/footer, label historis dan teks panjang). `npm run check:winners:browser` memakai server/database QA kosong di 8098; origin alternatif melalui DOORPRIZE_TEST_ORIGIN. Uji browser membuat pemenang dummy dan memeriksa download, batal/retry, paginasi, cache/no polling, desktop dan mobile. Jangan memakai database utama 8091. Artefak di `.cache/winner-pdf` dan `.cache/winners-qa`.


Filter Undian berada dekat jumlah nama dan informasi peserta tersedia. Popup memakai lebar maksimal 380 px, scroll internal dan penempatan atas/bawah mengikuti ruang layar. Membuka/menutup popup tidak memanggil API. Reset hanya memanggil ulang hitungan/query yang diperlukan, tidak menghapus peserta. Pada Peserta, searchbar tetap berdiri sendiri; reset filter juga mengosongkan pilihan massal. Kriteria undian terakhir tetap disimpan saat Mulai; aksi Kosongkan layar mempertahankan draft filter untuk putaran berikutnya.

## Login dan target layanan

Akun pemilik lokal menggunakan email yang diberikan saat persiapan lokal, tanpa mencatat identitas/kredensialnya di repository. Masuk melalui `/login`; sesi diingat selama 30 hari. Ikon Keluar ada di kanan header. Logout mencabut sesi dan membersihkan tampilan pada operator/preview/output terkait, tanpa menghapus peserta atau putaran pending. Tidak ada pendaftaran umum. Autentikasi berjalan di PHP/PostgreSQL aplikasi, bukan layanan Supabase Auth; tidak membutuhkan koneksi internet untuk pengembangan lokal.

Persiapan akun pertama pada database portabel memakai `node scripts/setup-owner.mjs` dengan JSON `email`/`password` melalui stdin. Hanya bisa membuat akun pertama dalam APP_ENV local dan tidak mencetak kredensial. Jangan menulis password ke source/dokumen atau memakai ulang kredensial aplikasi lama. Database yang sudah berisi akun tidak ditimpa. Untuk pengujian, buat database QA terpisah dan sediakan akun fiktif dari `scripts/auth-fixture.mjs`; browser check menerima `DOORPRIZE_TEST_EMAIL`/`DOORPRIZE_TEST_PASSWORD` bila diperlukan. `npm run check:auth` menguji backend; `npm run check:auth:browser` memakai server QA port 8098.

Target tetap: GitHub `pranaa123/luckydraw_liberteam`; Vercel tim/kapsul `photobooth`, proyek `luckydraw-liberteam`; Supabase `mjqkrtrjrctdqnbzbbwb`. Repository lokal mandiri memakai remote `origin` tersebut. Koneksi database cloud dan deployment belum diaktifkan.

## Git aplikasi baru

Jalankan Git dari direktori `doorprize-baru`; direktori ini mempunyai repository tersendiri, terpisah dari aplikasi lama. Remote `origin` mengarah ke `pranaa123/luckydraw_liberteam`. Commit memakai alamat GitHub noreply agar email pribadi tidak ikut metadata publik.

Yang dilacak adalah kode, migrasi, konfigurasi contoh kosong, dependency lockfile dan asset runtime/library beserta lisensinya. `.gitignore` mengecualikan seluruh storage/database/sesi/kunci, konfigurasi `.env*` selain `.env.example`, upload background, cache, log, dependensi terpasang dan konfigurasi hosting lokal. Kredensial pada fixture pengujian adalah contoh fiktif dan bukan akun aplikasi. Periksa staged diff dan kemungkinan kredensial sebelum setiap commit/push.

`npm run check` mempertahankan assertion kurang dari 1.000 ms pada Mulai/Stop/Sahkan dan operasi filter yang diuji. Angka ini mengukur runtime lokal; hosting dan jaringan diuji tersendiri. Git tidak menambah proses pada jalur undian.
