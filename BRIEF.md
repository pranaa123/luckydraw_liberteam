# Brief aplikasi doorprize baru

Dokumen ini menyimpan kebutuhan pengguna dan klarifikasi yang telah disepakati dalam percakapan. Aplikasi dikembangkan lokal, terpisah dari aplikasi yang sudah ada. Seluruh perubahan hanya di `doorprize-baru/`.

## Teknologi dan prinsip

- PHP dengan kerangka dan struktur modular, database SQL, UI Tailwind.
- Pondasi awal menggunakan PHP 8.3 modular dengan core tipis tanpa dependensi framework runtime, PostgreSQL, serta Tailwind yang dibuild lokal.
- Aplikasi operator berjalan dalam satu halaman.
- Data dan alur harus jelas, ringkas, tidak berbelit; bahasa konsisten.
- Backend mudah dibaca, penamaan jelas, relasi ringkas, sesuai dengan frontend.
- Pengguna menegaskan kembali bahwa kerapian dan struktur backend hingga frontend merupakan batasan utama pada setiap tahap. Tiap fitur memiliki tanggung jawab, alur data, dan modul yang jelas. Controller, service, repository, template, dan interaksi frontend tidak dicampur dalam satu berkas besar. Komponen bersama digunakan ulang dengan penamaan dan kontrak data yang konsisten, tanpa menambah lapisan yang tidak diperlukan.
- Kecepatan sangat penting, terutama pengundian dan sinkronisasi import. Target pengguna di bawah 1 detik. Kecepatan integrasi Google Sheets tetap perlu diuji karena bergantung pada layanan Google.
- UI terasa khas, teratur, konsisten, berukuran nyaman, tanpa ruang kosong berlebihan atau pemaksaan memenuhi ruang.
- Preferensi warna terbaru: dominan putih dengan aksen biru. Tombol Mulai dan Sahkan memakai hijau, Eliminasi memakai merah, dan aksi lain memakai warna netral atau biru sesuai fungsi. Hindari tema dominan gelap.
- Gunakan ikon jika sudah cukup jelas; hindari tulisan dan penjelasan yang tidak diperlukan.
- Login dengan kemampuan mengingat pengguna sehingga tidak perlu login berulang kali.
- Usahakan tampilan efektif dalam satu layar jika memungkinkan, tetapi bukan keharusan.
- List panjang menggunakan paginasi atau scroll yang sesuai agar panel tidak terus memanjang.
- Ukuran komponen mengikuti kebutuhan; jangan memaksakan tombol atau kotak mengisi seluruh ruang. Kotak jumlah nama dibuat ringkas. Grup tombol dan jumlah nama terpusat pada preview. Mulai undian selebar gabungan tiga tombol di bawahnya, yang sama lebar dan sejajar. Semua tombol sama tinggi; gunakan ikon dan teks tanpa badge tambahan di tombol Mulai.
- Aksi edit dan hapus memakai ikon pensil dan × secara konsisten pada peserta, hadiah, dan isian tambahan. Kosongkan hasil undian tetap memakai ikon tempat sampah beserta teks Kosongkan.
- Jika ada kebutuhan yang tidak sinkron atau membingungkan, tanyakan kepada pengguna, jangan mengambil keputusan diam-diam.

## Operator dan output presentasi

- Operator menentukan jumlah total nama yang akan dimunculkan.
- Hasil undian menyesuaikan ukuran dan jarak agar memaksimalkan area secara rapi.
- Output presentasi dapat fullscreen di monitor/proyektor lain, seperti penggunaan slideshow atau aplikasi visual.
- Operator tetap bebas mengoperasikan aplikasi tanpa mengganggu output presentasi. Jangan mengharuskan operator membuka halaman tayangan secara manual.
- Alur utama output: Pilih layar → pilih monitor eksternal → Tampilkan, langsung fullscreen tanpa menggeser jendela atau mengklik lagi pada output. Pengguna menegaskan fullscreen harus langsung dari operator. Pada browser desktop dengan Window Management, gunakan fullscreen langsung dari klik lalu buka/tempatkan operator di layar asal; tidak membutuhkan izin fullscreen otomatis khusus. Izin layar dan popup tetap diperlukan. Pada browser tanpa dukungan pemilihan layar, tetap sediakan pembukaan output biasa.
- Pemilihan layar memakai event perubahan perangkat, tanpa polling. Klik Tampilkan berulang dan reload operator tidak memuat ulang output aktif. Jika layar pilihan berubah atau terputus, minta pemilihan ulang, jangan otomatis menayangkan ke layar operator.
- Preview kecil di bagian atas tetap terlihat saat scroll. Tombol kontrol berada di bawah preview.
- Visual standby bertuliskan "Bersiap untuk mengundi".
- Tombol Mulai memicu pengundian dan berubah menjadi Stop.
- Selama pengacakan, hanya ada satu baris besar sebagai visual animasi. Revisi terbaru memakai nama peserta yang tersedia secara acak cepat dan bervariasi dengan gerak halus sampai Stop.
- Referensi awal: split-flap tanpa kotak. Revisi terbaru mengganti huruf buatan dengan nama peserta utuh; nama panjang diperkecil sendiri agar muat satu baris.
- Koreksi sebelumnya berupa glyph digantikan permintaan terbaru: nama peserta asli berganti cepat, halus dan bervariasi sampai dihentikan. Hasil pemenang baru ditentukan pada Stop.
- Setelah Stop, tampilkan seluruh nama hasil undian sesuai jumlah yang ditentukan, dengan tata letak adaptif.
- Tombol pengesahan mengesahkan seluruh nama yang sedang tampil sebagai pemenang.
- Tombol eliminasi mengeliminasi seluruh nama yang sedang tampil dari daftar layak undi.
- Tombol mengosongkan undian membersihkan hasil dari layar jika undian tidak sah.
- Peserta yang sempat tampil tetapi tidak disahkan sebagai pemenang tetap layak diundi, kecuali dieliminasi.

## Filter undian

- Filter bertingkat berdasarkan isian undian dan nilai komponennya.
- Setiap filter dapat diaktifkan melalui switch, lalu nilainya dapat dicentang.
- Mendukung pemilihan lebih dari satu nilai dan opsi Pilih semua pada setiap list filter.
- Implementasi memakai OR untuk nilai dalam satu isian dan AND antarisian aktif. Pilih semua mencakup seluruh nilai, termasuk yang belum dimuat; nilai tertentu dapat dikecualikan. Pilihan kosong pada isian aktif tidak meloloskan peserta. Nilai lanjutan mengikuti pilihan isian sebelumnya. Pencocokan filter mengikuti nilai asli, terpisah dari normalisasi duplikasi.

- Filter di Undian memakai dropdown bertingkat yang sama dengan Peserta, tanpa kartu lebar permanen di bawah. Letaknya dekat jumlah nama dan informasi peserta tersedia.
- Predikat filter yang efektif ditandai tombol biru, jumlah kelompok aktif dan ikon × untuk menghapus semua filter sekali klik. Pilih semua tanpa pengecualian tidak dianggap membatasi peserta. Tanda aktif tetap terlihat ketika dropdown ditutup.
- Hapus filter undian dikunci selama putaran pending. Mengosongkan layar hasil tidak mengembalikan filter draft yang sudah dihapus. Buka/tutup dropdown tidak membaca ulang data.

## Pengaturan hadiah saat mengundi

- Switch Dengan hadiah / Tanpa hadiah.
- Jika dengan hadiah, ada switch Random / Tentukan hadiah.
- Mode tentukan hadiah menyiapkan opsi hadiah teratas atau memungkinkan pemilihan hadiah dan jumlah berdasarkan total nama yang akan ditampilkan.
- Satu putaran boleh membagikan beberapa jenis hadiah, misalnya sebagian peserta mendapat hadiah A dan sebagian hadiah B.
- Mode random memilih dari hadiah yang stoknya tersedia.
- Stok berkurang hanya setelah pemenang disahkan.
- Mengosongkan hasil atau mengeliminasi peserta tidak mengurangi stok hadiah.
- Hadiah dengan stok 0 otomatis turun ke bagian paling bawah dan jumlahnya tidak dapat diinput.

## Persiapan dan informasi umum

- Informasi opsional: nama client, nama acara, dan waktu acara.
- Ada switch untuk menampilkan atau menyembunyikan informasi tersebut pada visual.
- Informasi berada di atas dan tidak memakan banyak tempat.

## Pengaturan tampilan output

- Ukuran canvas menggunakan input, tidak dibatasi ukuran layar PC operator; kualitas output harus tetap baik.
- Ukuran area nama hasil undian diatur dalam pixel.
- Posisi area dapat diatur atas/bawah dan kiri/kanan.
- Dropdown background: warna atau gambar.
- Jika gambar dipilih, tampilkan input gambar background utama.
- Ada input background tambahan opsional yang dikaitkan dengan hadiah dalam daftar hadiah.
- Background khusus hadiah berlaku jika hanya jenis hadiah tersebut yang aktif dalam putaran.
- Jika beberapa jenis hadiah aktif dalam satu putaran, gunakan background utama.
- Warna font berlaku untuk seluruh teks pada output visual.
- Dropdown gaya font: serif, sans-serif, slab serif, script.
- Dropdown penulisan: uppercase, lowercase, sentence style.

## Isian undian

- Nama sebagai isian default.
- Mendukung maksimal 10 isian tambahan di luar Nama (klarifikasi pengguna terbaru).
- Nama hadiah tampil otomatis ketika switch hadiah di halaman operator aktif; bukan bagian pengaturan isian tambahan.

## Daftar hadiah

- Input nama hadiah dan jumlahnya, mendukung jumlah sesuai kebutuhan pengguna.
- Tampilkan informasi jumlah jenis hadiah dan total hadiah jika sudah diinput.
- Urutan hadiah dapat dipindah; urutan input tidak menentukan urutan pengundian.

## Peserta dan import

- Peserta dapat ditambahkan satu per satu melalui tombol Tambah peserta di kiri. Tombol Import Excel dan Google Sheets berada di kanan pada baris toolbar yang sama jika ruang memungkinkan.
- Peserta, hadiah, dan isian tambahan mendukung tambah, edit, serta hapus dengan penyimpanan database. Isian Nama tetap wajib. Penghapusan isian tambahan juga membersihkan nilai slot tersebut pada peserta, dengan konfirmasi; snapshot hasil undian tetap dipertahankan. Peserta/hadiah yang sudah tercatat dalam undian tidak dapat dihapus.
- Import Excel dan sediakan template.
- Pembacaan kolom nama dan header tambahan mengikuti pengaturan isian undian.
- Import online melalui Google Sheets, termasuk sumber respons Google Forms, dengan sinkronisasi otomatis tanpa refresh manual oleh operator.
- Pemetaan kolom spreadsheet ke isian undian harus otomatis sejauh memungkinkan, ringkas, dan jelas bagi operator.
- Mendukung penentuan waktu penutupan update daftar peserta bila diperlukan dan pemutusan koneksi sinkronisasi.
- Tampilkan ringkasan jumlah peserta layak undi dan duplikasi ditemukan.
- Tabel peserta berisi nama, isian tambahan sesuai pengaturan, status, dan aksi edit sederhana dengan ikon pensil di kanan.
- Edit dapat mengubah detail dan status peserta.
- Mendukung filter, pemilihan peserta, dan pengeditan massal, termasuk perubahan status sekaligus.
- Status disatukan sebagai kelompok pertama pada filter bertingkat di menu Peserta, bersama Nama/isian. Tidak ada dropdown status terpisah. Mendukung switch, multi-status dan Pilih semua agar tetap satu fitur filter yang bersih.
- Tombol Filter peserta berada tepat di samping searchbar, dalam satu baris termasuk pada layar kecil. Panel filter berupa dropdown ringkas di dekat tombol, otomatis menyesuaikan ruang layar.
- Edit massal berupa ikon pensil saja, tepat di kiri tombol Filter peserta dalam baris searchbar yang sama. Label aksesibilitas dan tooltip tetap tersedia.
- Status: Tersedia (layak undi), Duplikat (tidak layak), Tereliminasi (tidak layak), Pemenang (tidak diikutkan undian).

## Aturan duplikasi

- Operator mengaktifkan switch/centang pada isian yang menjadi kunci pencocokan; bisa lebih dari satu.
- Jika hanya satu isian aktif, hanya isian itu menentukan duplikasi.
- Jika dua atau lebih aktif, seluruh isian terpilih harus cocok bersama untuk dianggap duplikat.
- Jika salah satu kunci terpilih kosong, peserta tersebut dilewati oleh pemeriksaan duplikasi; seluruh kunci wajib terisi untuk dibandingkan. Keputusan ini dikonfirmasi pengguna.
- Huruf besar/kecil tidak membedakan data: input sama tetap dianggap cocok.
- Pertahankan satu entri dengan kualitas data paling rapi dari kelompok duplikat.
- Contoh pengguna: "Alam" lebih rapi daripada "alam", "aLam", "al@m", atau "a_am".
- Klarifikasi: contoh tersebut menjelaskan kualitas data, bukan instruksi untuk otomatis menyamakan simbol atau melakukan pencocokan samar. Penentuan duplikasi tetap berdasarkan isian yang diaktifkan operator.

## Riwayat dan laporan

- Catat aktivitas operator saat mengedit peserta dan melakukan proses undian.
- Export daftar pemenang ke PDF A4 landscape, ukuran font minimal 12.
- Informasi umum yang terisi tampil ringkas pada setiap halaman laporan.
- Kolom laporan: nama, isian undian sesuai pengaturan, hadiah yang diterima, dan terakhir urutan undi.
- Setiap lembar memiliki nomor halaman / total halaman.

## Tambahan prinsip performa dan kesederhanaan

- Pengguna menekankan alur yang mulus, sederhana, kuat, dan minim proses yang tidak diperlukan.
- Hindari membaca seluruh data terus-menerus selama aplikasi berjalan.
- Query mengambil hanya baris dan kolom yang dibutuhkan, dengan indeks dan paginasi yang sesuai.
- Perubahan memperbarui data dan bagian UI yang terdampak, tanpa memuat ulang semua daftar atau halaman.
- Gunakan data sementara/cache sesuai kebutuhan dengan pembaruan atau invalidasi saat data sumber berubah; jangan membiarkan data usang memengaruhi hasil undian.
- Animasi huruf berjalan di browser tanpa membaca ulang daftar peserta atau memanggil backend setiap frame.
- Sinkronisasi online memproses perubahan secara bertahap sejauh didukung sumber, bukan mengimpor ulang seluruh data pada setiap aksi operator. Detail mekanisme Google Sheets belum ditentukan.
- Kelayakan peserta, perubahan status, dan pengurangan stok tetap divalidasi secara konsisten dalam transaksi terkait.
- Prinsip kerja pengembangan: baca berkas atau bagian yang relevan saja dan hindari pembacaan ulang seluruh proyek tanpa kebutuhan.

## Target layanan dan akun pemilik — 14 November 2026

- Repository aplikasi baru: https://github.com/pranaa123/luckydraw_liberteam.
- Vercel: **Kapsul Photobooth** (slug terverifikasi `kapsul-photobooth`), proyek `luckydraw-liberteam`. Domain yang diminta `luckydraw-liberteam.vercel.app`; belum ada produksi saat tujuan awal ditentukan.
- Supabase khusus aplikasi baru: https://supabase.com/dashboard/project/mjqkrtrjrctdqnbzbbwb (project ref `mjqkrtrjrctdqnbzbbwb`).
- Identitas login menggunakan email. Akun pemilik disiapkan secara lokal; identitas login dan kredensial tidak dicatat di repository. Hanya hash password yang disimpan dalam database privat.
- Tahap ini menyediakan satu akun pemilik tanpa pendaftaran umum. Sesi persisten 30 hari, logout membatalkan sesi dan menutup visual terkait. Data workspace lokal dipertahankan untuk akun pemilik awal.
- Target layanan sudah ditetapkan; Git lokal aplikasi baru dan remote origin telah disiapkan secara terpisah. Koneksi database cloud dan preview Container telah diverifikasi; rincian terbaru di docs/DEPLOYMENT.md. Jangan mengambil konfigurasi/kredensial aplikasi lama.

## Status implementasi

- Folder khusus telah dibuat.
- Brief dan klarifikasi telah dicatat.
- Struktur dasar PHP, skema PostgreSQL privat, build Tailwind, navigasi operator satu halaman, preview standby, serta output terpisah dan tombol fullscreen sudah dibuat.
- Pemilihan monitor, fullscreen langsung dari klik operator, operator terpisah, penggunaan ulang pasangan jendela, serta penanganan izin dan layar terputus sudah ditambahkan. Alur lama yang membuka popup output sebelum fullscreen sudah diganti. Sudah diuji dengan layar virtual Chrome tanpa memberikan izin fullscreen otomatis khusus; monitor fisik belum diuji.
- Runtime PHP portabel kini terhubung ke PostgreSQL portabel (PGlite) melalui jembatan internal khusus pengembangan. Data disimpan di `storage/database`, terpisah dari aplikasi lama. PHP native mendukung PDO PostgreSQL bila `DB_DSN` dikonfigurasi. Workspace lokal awal dipertahankan sebagai acara milik akun pemilik setelah autentikasi diaktifkan.
- Tambah, edit, dan hapus peserta/hadiah/isian tambahan sudah terhubung ke database; termasuk paginasi peserta, ringkasan status/stok, audit mutasi, transaksi, dan pemeriksaan versi untuk menolak perubahan dari formulir lama.
- Informasi acara beserta switch tampil, canvas/area nama/posisi pixel, warna/gambar background, font/penulisan, serta background per hadiah sudah dapat diedit dan disimpan. Preview/output mengikuti perubahan tanpa polling. Visual memakai SVG dan file background asli, tidak mengambil raster dari preview operator. Perubahan draft baru bertahan setelah Simpan.
- Hadiah dapat dipindah naik/turun dan stok nol tetap berada di bawah. Undian mengaktifkan background khusus untuk satu jenis hadiah dan background utama untuk beberapa jenis.
- Animasi nama peserta mengikuti putaran nyata, pengaturan visual dan tersinkron dengan output. Maksimal 512 nama layak diambil sekali melalui indeks pool saat Mulai, tanpa scan seluruh daftar atau request per frame. Tombol Coba animasi tetap dihapus.
- Mesin undian sudah terhubung: jumlah nama, Mulai/Stop, hasil adaptif beserta isian, Sahkan/Eliminasi/Kosongkan, hadiah manual/acak, stok saat pengesahan dan audit. Status/pool/stok diproses atomik dan hasil pulih setelah refresh/restart. Riwayat aktivitas tersedia dengan paginasi.
- Nama peserta berganti terus sampai Stop, lalu menampilkan seluruh nama terpilih dengan tata letak adaptif.
- Filter bertingkat tersedia pada undian dan daftar peserta, dengan switch, multi nilai, Pilih semua, pengecualian serta paginasi nilai. Daftar peserta mendukung pencarian awalan nama, filter status, pilihan lintas halaman/seluruh hasil dan edit massal status/nama/isian. Status Pemenang/Duplikat tetap dikelola proses terkait. Filter undian terakhir disimpan saat Mulai dan indeksnya diperbarui secara bertahap saat data berubah.
- Import Excel/Google Sheets, aturan duplikasi, daftar pemenang historis lengkap dan PDF sudah tersedia. Login email/password, logout, sesi 30 hari, CSRF dan RLS pemilik sudah diimplementasikan.
- Database pengembangan lokal sudah tersedia. Koneksi Supabase dan preview cloud PHP sudah diuji; database lokal dipertahankan terpisah. Target GitHub, Vercel dan Supabase khusus aplikasi baru sudah ditetapkan pada catatan di atas.

## Klarifikasi integrasi Google Sheets

- Target deployment tetap Vercel untuk aplikasi PHP dan Supabase untuk PostgreSQL. Pengembangan/pengujian tetap lokal, tidak memakai proyek/kredensial aplikasi lama.
- Pengguna menyetujui pemasangan konektor sekali pada spreadsheet, kemudian sinkronisasi otomatis tanpa membaca seluruh sheet berulang.
- Baris sumber yang dihapus menjadikan peserta Tereliminasi; Pemenang tetap dipertahankan.
- Edit operator dipertahankan jika bertabrakan dengan perubahan pada isian yang sama dari Sheets; tandai konflik untuk diperiksa.

## Penyempurnaan canvas, isian, dan data contoh

- Posisi editor menggunakan slider horizontal/vertikal dari titik tengah: 0 di tengah, negatif ke kiri/atas, positif ke kanan/bawah. Dropdown acuan dihapus dari UI. Konfigurasi lama tetap terbaca tanpa berpindah.
- Lebar/tinggi area berupa pixel dan berubah dari pusat area; posisi dibatasi agar seluruh area selalu di dalam canvas. Dimensi canvas yang diubah mengisi ukuran area maksimal dan memusatkan posisi pada sumbu tersebut.
- Batas slider mengikuti ruang tersisa. Area penuh membuat slider nonaktif pada 0, bukan menghilangkan visual. Dimensi ganjil tetap tepat di tengah melalui ketelitian posisi setengah pixel.
- Default canvas mengembalikan 1920×1080, area 1536×648 dan kedua slider 0. Reset hanya draft geometri dan perlu Simpan; tidak mengubah acara/font/background/isian/hadiah/peserta. Muat ulang kembali ke nilai tersimpan.
- Background dapat dipilih tampil utuh atau memenuhi canvas; rasio gambar dipertahankan.
- Hierarki teks Nama/tambahan 1/2/3 adalah 100%/50%/25%/25%. Switch masing-masing hanya untuk isian tambahan; Nama selalu tampil. Isian tersembunyi tidak menyisakan baris kosong dan tidak mengubah ukuran relatif isian lain.
- Switch hanya memengaruhi output, bukan data, filter, aturan duplikasi, atau hadiah. Perubahan menjadi draft visual hingga Simpan.
- Tambahkan 500 peserta fiktif lokal melalui batch import yang dapat diulang tanpa menggandakan hasil. Ikuti isian yang ada, tanpa mengganti peserta/label/aturan. Variasi mencakup kapitalisasi, spasi, kunci kosong, kecocokan sebagian dan simbol; status Duplikat tetap mengikuti aturan operator.

## Batas ukuran teks dan transisi hasil

- Area undian membatasi penempatan dan menjadi bagian perhitungan acuan. Nama mempunyai batas ukuran nyaman dari visual pengacakan, diturunkan otomatis menurut jumlah pemenang dan ruang sel; tidak diperbesar sekadar untuk memenuhi area.
- Nama terpilih muncul halus setelah Stop. Transisi cukup singkat dan ringan; tidak mengulang saat edit visual atau pengesahan. Hierarki isian tetap 100%/50%/25%/25%.

- Nama hasil selalu satu baris utuh. Skala otomatis mengikuti jumlah pemenang dan area, dengan ukuran pengacakan sebagai batas kenyamanan. Mayoritas nama memakai ukuran seragam; nama yang jauh lebih panjang menyesuaikan ukurannya sendiri. Tidak memakai wrapping, ellipsis atau menghilangkan nama. Operator cukup mengubah jumlah pemenang, tanpa slider ukuran wajib.
- Teks Bersiap untuk mengundi tampil proporsional, satu baris terpusat, bold 700 dengan ukuran lebih besar (68% acuan glyph) dan batas font/area aktual. Tidak mengecil karena jumlah pemenang bertambah. Rasio isian dan transisi halus tetap dipertahankan.
- Preview lokal dapat dibuka di browser PC melalui http://127.0.0.1:8091/.


## Daftar pemenang dan PDF

- Menu Riwayat memisahkan Pemenang dan Aktivitas dalam dua tab ringkas; daftar pemenang 50 per halaman dan scroll.
- Hanya putaran yang disahkan masuk daftar/laporan. Nama, nilai/label isian, dan hadiah memakai snapshot undian; edit data sesudahnya tidak mengubah histori. Urutan mengikuti putaran kemudian posisi dalam putaran; kolom terakhir Undian ke adalah nomor putaran.
- Export satu klik menghasilkan PDF A4 landscape dengan seluruh teks minimal 12 pt, informasi umum tersimpan dan nomor halaman/total berulang pada setiap lembar. Hadiah kosong memakai tanda —. Isian tersembunyi pada visual tetap disertakan.
- Jika skema isian berubah antarputaran, PDF menggunakan tabel dengan label asli masing-masing agar data historis tetap jelas. Nama/nilai panjang boleh membungkus pada laporan agar font tidak dikecilkan di bawah 12.
- Modul PDF/font lokal dimuat hanya saat export dan berjalan di worker; pengambilan data hanya pemenang, bertahap 500 per request dengan batas snapshot tetap. Undian/operator tidak ditahan selama pembuatan laporan. Tidak ada migrasi/deployment cloud pada tahap ini.

## Status putaran dan kontrol operator — 14 November 2026

- Status berada di dekat tombol utama: Siap mengundi, Sedang mengundi (biru), Menunggu keputusan (kuning), dan Disahkan. Status tersimpan yang dipulihkan setelah login/refresh tetap dijelaskan, bukan dianggap putaran baru.
- Saat putaran pending, tampilkan alasan kunci jumlah/hadiah/filter dengan ikon gembok; kontrol Sahkan/Eliminasi/Kosongkan menjelaskan langkah selanjutnya tanpa popup.
- Kontrol terpusat pada preview; Mulai/Stop selebar gabungan Sahkan, Eliminasi, Kosongkan. Ketiga tombol bawah tetap sebaris dan sama lebar pada layar kecil. Tombol Coba animasi serta jalur uji terpisah dihapus.
- Kosongkan pada pending membatalkan undian, tanpa mengesahkan hadiah, mengeliminasi peserta atau mengurangi stok. Nama tetap layak undi. Jika hasil sebelumnya sudah sah, Kosongkan hanya membersihkan visual dan tidak membatalkan pengesahan yang sudah dilakukan.

## Penataan kontrol operator dan informasi acara

- Kotak kontrol boleh lebih lebar dari tombol. Pengaturan output ada di kiri dan filter peserta undian di kanan pada toolbar sejajar di bawah preview.
- Jumlah nama berada di kanan seluruh grup Mulai/Sahkan/Eliminasi/Kosongkan, beserta ringkasan peserta tersedia. Pada ruang sempit, jumlah bergeser ke bawah kanan agar tiga tombol tetap sebaris.
- Nama client dan nama acara bersebelahan pada formulir Persiapan; pengguna mengonfirmasi perubahan ini untuk formulir, bukan visual output.
- Hilangkan penanda Pengembangan lokal dari area kerja.

## Reset untuk acara baru — 14 November 2026

Pengguna meminta reset agar aplikasi dapat digunakan benar-benar dari nol untuk acara baru. Reset mengosongkan peserta, hadiah, pemenang/hasil dan riwayat, isian tambahan, aturan duplikasi/filter, informasi acara, background dan pengaturan visual. Koneksi Google Sheets diputus tanpa menghapus data spreadsheet eksternal. Akun dan sesi login dipertahankan. Tombol diletakkan pada Persiapan, dengan ringkasan dan ketik RESET sebelum konfirmasi. Penerapan fitur tidak mereset data pengguna; tindakan dijalankan hanya ketika operator mengonfirmasinya.

## Keputusan lanjutan November 2026

- Judul bagian dibuat berbeda jelas dengan pita biru, termasuk nomor subbagian Persiapan; tetap mengikuti layout putih/biru.
- Alur utama Google Sheets disepakati akun layanan khusus aplikasi dengan akses Viewer pada sheet privat. Operator membagikan sheet ke email aplikasi dan memasukkan link; tidak perlu Apps Script. Pengaturan Cloud/keyless dan integrasi pembaca baru masih dalam pengembangan, belum dianggap aktif. Konektor lama dipertahankan selama transisi.
- Kegagalan Google tidak boleh menghapus data tersimpan; undian memakai data lokal/database dan tidak bergantung panggilan Google. Kunci duplikasi tetap mengikuti switch operator.
- Perubahan background hadiah sebelum pengundian masih dibahas. Jangan mengubah perilakunya sampai pengguna menyepakati alur.

## Koreksi alur Google Sheets

- Pengguna menegaskan hanya satu spreadsheet terkoneksi per acara. Percobaan input tidak boleh menjadi daftar sumber.
- Alur operator: bagikan Viewer ke email aplikasi → tempel link → Periksa spreadsheet → periksa pemetaan → Hubungkan. Tidak ada Apps Script pada alur utama.
- Pemeriksaan/batal tidak menyimpan sumber. Penggantian atomik setelah validasi, mempertahankan peserta dan koneksi lama jika gagal. Draft/terputus tidak tampil sebagai daftar.
- Implementasi API baca memakai cek versi setiap 15 detik, melewati isi jika versi tetap, dan memeriksa kolom terpakai per maksimal 200 baris ketika berubah. Eliminasi baris hilang hanya setelah snapshot lengkap/stabil.
- Tidak ada kewajiban memilih/menambahkan ID unik pada spreadsheet. Timestamp kosong/ganda dan baris identik harus diterima. Penanda internal dikelola aplikasi; aturan duplikasi hanya mengikuti switch operator. Impor ulang/sortir tidak menambah peserta, edit operator/pemenang dilindungi, perubahan yang ambigu memakai Periksa perubahan yang sudah ada. Backend dan frontend dirapikan pada modul pemiliknya tanpa langkah operator tambahan.
