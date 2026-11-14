# Status fitur terhadap brief

Status diperbarui: 14 November 2026. Acuan: `BRIEF.md`, implementasi PHP/JavaScript/SQL, serta pengujian pengelolaan data dan browser.

**Fondasi, Persiapan, pengelolaan data, mesin undian, filter, edit massal, hasil adaptif, hadiah/stok dan riwayat aktivitas tersedia dengan penyimpanan lokal persisten. Preview/output tersinkron tanpa polling.** Animasi terus acak sampai Stop; nama terpilih baru muncul setelah Stop. Import Excel beserta template terformat, pemetaan/pratinjau dan aturan duplikasi sudah tersedia. Google Sheets dengan konektor sekali pasang dan sinkronisasi bertahap juga tersedia. Daftar pemenang historis dan PDF tersedia; login email/password, sesi 30 hari dan akses pemilik tersedia.

## Sudah tersedia

| Bagian | Implementasi saat ini | Batas |
| --- | --- | --- |
| Struktur proyek | PHP 8.3 modular, core tipis, route, konfigurasi sendiri, sumber/build Tailwind lokal | Cloud belum diuji |
| Antarmuka operator | Navigasi satu halaman, preview sticky, kontrol undian aktif dan sama tinggi, Mulai selebar tiga tombol bawah, filter bertingkat, pilihan/edit massal, layout responsif | Koneksi nyata membutuhkan pemasangan konektor |
| Warna dan komponen | Dominan putih, aksen biru, tombol hijau/merah sesuai fungsi | Konsistensi perlu diteruskan saat komponen baru dibuat |
| Standby dan animasi | Glyph terus acak dengan flip per huruf sampai Stop, mengikuti pengaturan dan putaran nyata; hasil muncul saat Stop | Reduced motion mengganti glyph tanpa flip |
| Persiapan | Edit/simpan acara, canvas/area/posisi pixel, warna/gambar, font dan penulisan; sinkronisasi konfigurasi tanpa polling | Draft harus disimpan agar bertahan setelah refresh |
| Hadiah | CRUD, urutan, background, alokasi manual/acak, stok hanya saat Sahkan | Snapshot hadiah dipakai pada laporan |
| Pemilihan layar | Izin Window Management, pilihan monitor, fullscreen langsung dari operator, kontrol operator terpisah | Dukungan utama Chrome desktop modern dan layar Extend; perlu izin layar/popup |
| Kelangsungan output | Memakai kembali pasangan jendela, operator dapat berganti menu/refresh, Esc dan aktivasi kembali, pergantian target, penanganan layar terputus/izin berubah | Pengujian terdahulu memakai layar virtual Chrome; monitor fisik belum diverifikasi |
| Penyimpanan | Skema PostgreSQL privat, indeks/constraint, repository/service, CRUD peserta/hadiah/isian, transaksi/audit, pemeriksaan versi | Identitas terverifikasi, RLS per pemilik dan sesi dalam database; koneksi cloud belum diuji |
| Pengembangan lokal | PHP portabel terhubung ke PGlite persisten, dukungan konfigurasi PDO PostgreSQL native, pemeriksaan PHP/SQL/CRUD serta QA browser | Runtime portabel khusus pengembangan; PDO native belum diuji pada komputer ini |

## Belum diterapkan

### Penyimpanan dan identitas operator

- [x] Database khusus aplikasi baru untuk pengembangan lokal, terpisah dari aplikasi lama.
- [x] Repository/service dan endpoint baca/simpan peserta, hadiah, serta isian tambahan.
- [x] Peserta, hadiah, dan isian tambahan tetap tersimpan setelah refresh/restart.
- [x] Penyimpanan informasi acara dan pengaturan visual, termasuk versi pengaturan terpisah dari mutasi peserta/hadiah.
- [x] Login email/password, logout, sesi persisten 30 hari/ingat login.
- [x] Pemeriksaan akses pemilik acara, role aplikasi terbatas dan policy RLS untuk semua tabel acara/staging/background.

### Persiapan, tampilan dan isian

- [x] Edit/simpan nama client, nama acara, waktu, serta switch tampilkan di visual.
- [x] Canvas SVG dengan ukuran input, terlepas dari ukuran preview operator.
- [x] Ukuran area nama/pixel serta batas input dinamis mengikuti canvas; slider pusat horizontal/vertikal dan guide.
- [x] Preview mengikuti rasio portrait/panorama; dimensi canvas mengisi area penuh per sumbu, pengetikan tidak merusak area, dan Default canvas terpisah dari pengaturan/data lain.
- [x] Background tampil utuh/memenuhi canvas tanpa mengubah rasio.
- [x] Warna background dan upload PNG/JPG/WebP dengan file/resolusi asli.
- [x] Tautan background per hadiah dan pemicu dari undian nyata: satu jenis memakai background khusus; beberapa jenis memakai background utama.
- [x] Warna font seluruh output, empat gaya font, dan uppercase/lowercase/sentence style.
- [x] Tambah/edit/hapus maksimal tiga isian tambahan; Nama tetap menjadi isian wajib.
- [x] Label tambahan dipakai pada formulir manual dan tabel peserta. Penghapusan membersihkan nilai slot peserta, mempertahankan snapshot hasil.
- [x] Isian tambahan/snapshot label dipakai pada hasil undian.
- [x] Isian tambahan dipakai pada filter undian/daftar peserta dan edit massal.
- [x] Isian tambahan dipakai pada template, pemetaan dan import Excel.
- [x] Isian tambahan dipakai pada laporan PDF.
- [x] Preview/output mengikuti konfigurasi secara langsung, termasuk lintas jendela, tanpa memuat peserta atau melakukan polling.
- [x] Sinkronisasi status/hasil nyata lintas jendela, pemulihan setelah refresh/restart, tanpa polling.

### Hadiah dan pengaturan putaran

- [x] Tambah/edit/hapus hadiah, jumlah total, ringkasan jenis dan sisa unit.
- [x] Pemindahan urutan hadiah; stok nol tetap di kelompok bawah.
- [x] Switch dengan/tanpa hadiah dan random/tentukan hadiah yang aktif.
- [x] Penentuan jumlah tiap hadiah berdasarkan jumlah nama per putaran.
- [x] Beberapa jenis hadiah dalam satu putaran dan pembagian acak dari stok tersedia.
- [x] Stok nol tampil di bawah pada daftar hadiah.
- [x] Stok nol tidak bisa dialokasikan dalam pengundian.
- [x] Pengurangan stok hanya saat pengesahan; eliminasi atau kosongkan hasil tidak mengurangi stok.
- [x] Nama hadiah tampil otomatis saat mode hadiah aktif.

### Peserta, filter dan duplikasi

- [x] Input peserta satu per satu; toolbar Tambah peserta di kiri, kedua tombol import di kanan.
- [x] Daftar peserta nyata dengan kolom sesuai isian dan ringkasan status dari database.
- [x] Edit detail dan status Tersedia/Tereliminasi; hapus peserta yang belum dirujuk hasil undian. Status Pemenang/Duplikat disiapkan untuk proses masing-masing, tidak dapat ditetapkan secara manual.
- [x] Status Pemenang melalui pengesahan seluruh hasil.
- [x] Penetapan otomatis status Duplikat melalui aturan duplikasi.
- [x] Pencarian awalan nama, filter status/isian, pilihan lintas halaman/seluruh hasil dengan pengecualian, edit massal status/nama/isian; versi/skema dan status terlindungi divalidasi atomik.
- [x] Paginasi peserta berbasis ID, 50 baris per halaman, dengan area scroll.
- [x] Filter undian bertingkat berdasarkan isian/nilai, switch aktif, multi centang dan Pilih semua; nilai lanjutan mengikuti pilihan sebelumnya, opsi dipaginasi.
- [x] Kunci duplikasi mengikuti kombinasi isian yang dipilih operator.
- [x] Pencocokan tanpa membedakan huruf besar/kecil.
- [x] Pemilihan satu entri dengan data paling rapi dari kelompok duplikat.
- [x] Perhitungan ulang kelayakan/duplikasi ketika data atau aturan yang terkait berubah.

### Import

- [x] Import Excel, template Excel dan pembacaan header sesuai isian.
- [x] Hubungkan Google Sheets/hasil Google Forms.
- [x] Pemetaan kolom Excel otomatis/manual, pilihan sheet/baris header, pratinjau 50 baris per halaman.
- [x] Pemetaan kolom Google Sheets.
- [x] Sinkronisasi otomatis, pemrosesan perubahan bertahap dan penanganan kegagalan.
- [x] Jadwal tutup update peserta dan pemutusan sinkronisasi.
- [x] Deduplikasi serta ringkasan hasil import pada alur nyata.

### Pengundian dan visual dinamis

- [x] Penentuan jumlah nama yang aktif dan validasi peserta/hadiah tersedia.
- [x] Pemilihan acak seragam peserta available melalui pool berindeks, tanpa hasil berulang dalam satu putaran.
- [x] Filter bertingkat dalam pemilihan peserta; pool berfilter dicache dan dirawat per perubahan peserta.
- [x] Mulai berubah menjadi Stop dan menjalankan putaran nyata.
- [x] Animasi split-flap satu baris besar tanpa kotak, glyph terus acak dengan tempo berbeda dan dukungan reduced motion; kontrol uji/nyata tersinkron antarjendela tanpa request data selama animasi.
- [x] Hubungkan animasi dengan putaran nyata dan hasilnya; tombol Coba animasi telah dihapus, animasi hanya mengikuti putaran nyata.
- [x] Koreksi terbaru: glyph terus acak hingga Stop tanpa siklus membentuk nama. Start tidak membaca nama untuk kebutuhan visual.
- [x] Stop menampilkan seluruh nama/isian/hadiah dengan ukuran/jarak adaptif.
- [x] Sahkan semua hasil, eliminasi semua hasil, dan kosongkan hasil.
- [x] Peserta yang tidak disahkan tetap layak undi kecuali dieliminasi.
- [x] Transaksi pengesahan/status/stok/audit, idempotensi dan penanganan respons hilang setelah commit.
- [x] Pengiriman perubahan ke preview/panggung tanpa pembacaan ulang seluruh peserta.

### Riwayat dan laporan

- [x] Audit mutasi peserta, hadiah, isian, pengaturan dan urutan hadiah tersimpan atomik dengan perubahan datanya.
- [x] Audit proses undian.
- [x] Tampilan riwayat aktivitas tersimpan dengan cursor/paginasi dan area scroll.
- [x] Daftar pemenang historis lengkap.
- [x] Export PDF A4 landscape dengan font minimal 12.
- [x] Informasi umum ringkas di setiap halaman PDF.
- [x] Kolom nama, isian tambahan, hadiah, lalu urutan undi.
- [x] Nomor halaman/total halaman di setiap lembar.

### Verifikasi dan hosting

- [x] Uji lokal 50.000+ peserta/100 hasil: Mulai 81 ms, Stop 77 ms, Sahkan 15 ms pada runtime/mesin pengujian.
- [x] Uji filter/edit massal dan cache tidak valid; pada 50.000+ peserta/100 hasil, pembentukan filter pertama 235 ms, ulang 11 ms, Stop 115 ms. Pengukuran khusus runtime lokal ini, bukan jaminan semua perangkat/hosting.
- [ ] Uji waktu respons pada perangkat/hosting dan data acara nyata; Google Sheets nyata masih perlu pemasangan konektor dan pengujian akun pengguna.
- [x] Uji integrasi CRUD, validasi, versi, struktur isian, rollback audit, isolasi acara, paginasi, kunci direktori database, dan persistensi setelah runtime dibuka ulang.
- [x] Uji browser formulir tambah/edit/hapus, validasi, refresh, toolbar, tombol seragam, dan overflow pada lebar 390–1920px.
- [x] Uji transaksi undian, pool, snapshot, stok/status, retry, restart di tiga fase; browser 6/20 hasil, background, refresh, respons hilang, request paralel, riwayat dan mobile. PDO native/konkurensi native belum diverifikasi.
- [x] Uji import Excel, duplikasi, Google Sheets melalui fixture, konflik/penutupan dan kontrol undian saat jaringan lambat.
- [x] Uji laporan aktual: API/snapshot/keyset, worker/download browser, PDF A4/font/header/footer dan mobile.
- [x] Uji backend/browser login, sesi 30 hari, restart, CSRF, logout lintas jendela, pemulihan pending dan isolasi akun/RLS.
- [ ] Uji presentasi pada monitor/proyektor fisik, termasuk operasi operator selama tayangan dinamis.
- [x] Jalur Vercel Container PHP, environment/enkripsi, baseline migrasi Supabase dan verifikasi PostgreSQL kosong/RLS.
- [ ] Build Docker/PDO pooler, verifikasi HTTPS/owner di hosting, Supabase Storage dan deployment Vercel/Supabase nyata. Belum ada perubahan layanan cloud.

## Urutan lanjutan yang disarankan

1. Undian, Excel/template, aturan duplikasi dan Google Sheets sudah tersedia di lokal.
2. Pasang konektor pada spreadsheet pengguna dan uji koneksi Google sebenarnya.
3. Login/sesi, identitas/akses pemilik dan CSRF sudah tersedia lokal; lengkapi Supabase Storage dan verifikasi HTTPS sebelum publikasi.
4. Daftar pemenang/PDF tersedia; lanjut uji perangkat nyata, monitor fisik, PDO/pooler dan deployment Vercel/Supabase.

Urutan ini adalah rekomendasi, bukan perubahan kebutuhan atau instruksi untuk langsung mengimplementasikan semuanya.

## Validasi import Excel

Template mempunyai sheet Peserta kosong dan Panduan terpisah, judul putih/biru, zebra, filter, header beku, format teks untuk nomor/ID dan validasi isian. Mendukung .xlsx maksimal 20 MB, 100.000 baris, 256 kolom dan 50 sheet; ZIP dibatasi 128 MB hasil dekompresi/4.096 entri. Formula dibaca hanya dari hasil tersimpan, tidak dijalankan. Data dibaca worker lokal dan dikirim bertahap; dataset pratinjau belum mengubah peserta. Baris tidak valid terlihat dan dilewati pada commit. Nomor numerik yang sudah kehilangan nol/ketelitian di sumber tidak dapat dipulihkan; gunakan format teks pada template.

Kunci hanya dibandingkan jika seluruh kunci terisi. Trim dan huruf kecil dipakai untuk pencocokan tepat, tanpa substitusi simbol atau fuzzy matching. Nama rapi lalu kelengkapan menentukan keeper; seri memilih ID/baris terdahulu. Winner/tereliminasi tetap dilindungi dan menjadi jangkar. Perubahan detail/manual/massal merekonsiliasi hanya kelompok kunci lama/baru; perubahan aturan menghitung ulang satu kali. Import memakai batch/chunk idempotent, snapshot versi/skema, transaksi, audit dan pool kelayakan atomik.

Pengujian: check-imports mencakup template 1–4 kolom, tipe sel, kunci kosong, AND/case, kualitas, status terlindungi, CRUD/massal, pembatalan, versi, retry dan audit. Uji 5.000 baris pada runtime lokal dengan kunci nama + isian: staging/pratinjau 677 ms (termasuk retry yang disengaja dalam tes), commit 928 ms; waktu file parse/jaringan/UI di luar angka tersebut. Hasil khusus mesin QA, bukan jaminan semua ukuran file/hosting. Chrome menguji worker di bawah CSP, XLSX aktual, nol di depan, header berpindah, formula, paginasi, pembaruan kapasitas undian dan tampilan 390 px. Monitor eksternal fisik dan Excel/LibreOffice desktop belum diuji pada tahap ini.

## Validasi Google Sheets

Koneksi baru, kode konektor per sumber, endpoint Google HTTPS, mapping/sample, jadwal dan putus sudah tersedia. Kredensial tersimpan AES-256-GCM; metadata/audit/broadcast tidak membawa secret. Tautan tanpa gid memilih tab pertama tanpa mengasumsikan gid=0. IDs stabil/log tersembunyi membuat snapshot awal dan delta idempotent. Idle tidak membaca/menulis tabel peserta/pool; uji query memeriksanya. Pemulihan trigger menggunakan pointer range dan tail baris baru, bukan scan isi seluruh sheet berkala. Hanya perubahan struktur yang memicu resnapshot/cek identitas; header/isian berubah memerlukan pemetaan ulang.

Keputusan pengguna sudah diterapkan: delete sumber → Tereliminasi (winner tetap), edit operator pada isian yang sama → konflik, isian lain → merge. Data sumber invalid menunggu perbaikan sambil mempertahankan data valid lama; hapus lokal tidak diam-diam dibuat lagi. Sumber tidak mengaktifkan winner/eliminated. Penyelesaian konflik memakai versi baris/config di transaksi yang sama dengan pool/audit.

Backend memakai lease/version/cursor pada PostgreSQL; HTTP di luar transaksi, validasi ulang setelah HTTP, pembatasan 200 delta, backoff, deadline server dan penahanan selama pending draw. Frontend memperbarui metadata dan halaman aktif; output tidak menjalankan polling sumber. Satu operator terbuka dibutuhkan untuk aktif mengambil delta; cursor diteruskan setelah dibuka kembali.

Uji Apps Script menggunakan simulasi layanan Google: pemasangan idempotent, auth key, first tab nonzero, 450 baris snapshot, idle, UUID, trigger/tail recovery, paste besar bertahap, delete/epoch/header. Backend PHP/PostgreSQL menguji duplikasi, konflik/resolve, invalid, hapus lokal, winner, jadwal/pending/backoff/putus. Browser fixture memverifikasi alur nyata UI, leading zero, mobile 390px, update tabel/pool dan sumber ditahan saat draw. Pada respons Google yang disimulasikan 3,5 detik, fetch Start/Stop lokal sekitar 14/14 ms. Ini bukan ukuran latency Google/Vercel nyata. Koneksi Google asli, Docker, PDO native/pooler dan Supabase cloud belum diuji.

## Validasi penyempurnaan canvas

Pengaturan canvas telah diperbarui: area/offset dibatasi dinamis, slider tengah menggantikan pilihan acuan, preview mengikuti rasio dan Default scoped tersedia. Default mengembalikan geometri pabrik sebagai draft, sementara Muat ulang mengembalikan data tersimpan. Default tidak mereset background, font, acara, hadiah atau peserta. Backend menolak payload di luar batas/enum; konfigurasi lama tetap memakai left/top dan cover.

Uji 1008 kombinasi geometri lulus pada JS/PHP. Chrome menguji input bertahap 3→3840, posisi slider/konversi acuan lama tanpa loncatan, batas nol ketika area memenuhi canvas, portrait 1080×1920, panorama 3840×1080, serta 7680×4320 dengan 7 hasil undian di dalam clip pada fullscreen. Contain/cover, Default tanpa API → Simpan/reload dan mobile 390 px lulus. Pengujian Persiapan/background hadiah terdahulu juga lulus. Monitor fisik tetap belum diuji.


Isian output: switch per isian tambahan (Nama tetap tampil) dan hierarki 100/50/25/25 tersedia. Isian tersembunyi dirapatkan, rasio tetap berdasarkan slot. Fixture 500 peserta tersedia melalui import lokal dengan manifest batch untuk mencegah penambahan ulang; label/aturan operator tetap dipertahankan.


Nama hasil selalu satu baris utuh, dengan ukuran otomatis menurut jumlah pemenang dan grid area. Mayoritas nama seragam; nama ekstrem menyesuaikan ukuran sendiri. Tidak perlu slider ukuran. Standby proporsional satu baris terpusat. Kemunculan hasil memakai fade/gerak singkat sekali per putaran, dengan stagger terbatas dan reduced motion. Renderer memakai ulang node saat edit/pengesahan sehingga tidak berkedip atau mengulang transisi. Uji renderer browser mencakup 100 nama, pembatalan, reduced motion, 8K dan tidak adanya request tambahan.


Validasi laporan: backend 50.000+ hasil memakai keyset/index, halaman dalam 6 ms pada mesin QA. Snapshot stabil saat pengesahan baru; perubahan nama/hadiah/label tidak mengubah histori. PDF Node 11 halaman A4 landscape diverifikasi seluruh font ≥12 pt, header/footer berulang, data lengkap, teks panjang dan metadata kosong. Chrome memverifikasi PDF unduhan aktual, batal/retry, cache, tab aktivitas, label historis, Unicode Latin, no polling dan lebar 390 px. Hasil ini khusus lingkungan pengujian, bukan jaminan waktu untuk semua perangkat atau ukuran export.


QA dropdown filter: tidak memperpanjang halaman, membuka/menutup tanpa query, penanda efektif dan reset pada kedua halaman, lock saat pending, restore setelah refresh, draft reset bertahan setelah Kosongkan, Escape/klik luar, pilihan massal dan batas viewport 390 px lulus. Logika AND/OR, pool undian dan proteksi status tetap mengikuti modul sebelumnya.


QA autentikasi lokal: email case-insensitive, hash password/token, cookie HttpOnly/SameSite/Lax/Secure pada HTTPS, sesi 30 hari, rotasi, logout/kedaluwarsa, pembatasan percobaan dan RLS lintas pemilik lulus. Browser menguji ingat setelah refresh, preview/output, background privat, logout lintas jendela, pending draw tetap tersimpan, BFCache dan form 360 px. Tidak ada request autentikasi pada setiap frame animasi.


Status operator kini berada dekat kontrol: biru saat berjalan, kuning saat menunggu keputusan; ikon gembok/alasan kunci terlihat pada pengaturan putaran. Grup terpusat pada preview, Mulai/Stop selebar tiga tombol bawah, dan tombol uji animasi dihapus. Kosongkan pada hasil berhadiah diuji tidak mengubah status/versi peserta maupun stok.


## Baseline Git mandiri dan performa lokal

Repository aplikasi baru dipisahkan dari Git aplikasi lama. Pemeriksaan staged files mengecualikan seluruh data lokal, identitas login, kredensial, kunci, konfigurasi rahasia, cache/log dan upload; fixture yang ikut source menggunakan data fiktif. Commit memakai email GitHub noreply.

Build dan seluruh `npm run check` lulus. Pada 50.000+ peserta/100 hasil: Mulai 9 ms, Stop 413 ms, Sahkan 26 ms; filter pertama 186 ms, penggunaan ulang 14 ms, Stop terfilter 113 ms. Seluruh operasi kontrol yang diukur memenuhi assertion <1.000 ms. Import 1.000 baris: staging/pratinjau 196 ms termasuk retry pengujian, commit 421 ms. Ini angka lokal, bukan hasil pengukuran hosting atau Google Sheets nyata.

## Reset acara

Tersedia pada Persiapan → Acara baru. Dialog ringkas memuat jumlah peserta/hadiah/pemenang, ketik RESET, dan penegasan penghapusan permanen. Data dan pengaturan baru benar-benar kosong; akun/sesi tetap, urutan undian kembali 1, tab lama ditolak dan layar output kembali standby dengan fullscreen dipertahankan. Sumber Sheets/import lama dihapus agar tidak mengisi kembali acara baru.

Uji mencakup confirmed + rolling, FK/staging/duplikasi, rollback penuh saat pembuatan acara baru gagal, isolasi pemilik, konfirmasi/versi, scope tab lama, pembersihan background, sesi tetap dan reset berulang. Lokal 1.000 peserta sekitar 43–46 ms; stress penghapusan 50.000 peserta sekitar 1,8–1,9 detik. Cloud dengan akun QA: reset 1.000 peserta dan dua request bersamaan 403 ms (satu berhasil, satu 409), cookie tetap, Storage dibersihkan dan sequence baru 1. Batas <1000 ms pada undian/filter tetap dipertahankan. Browser menguji Batal, tab/preview, kedua jalur fullscreen dan dialog 375 px. Advisor Supabase tanpa peringatan setelah migrasi.
