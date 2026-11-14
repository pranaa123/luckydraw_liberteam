# Arsitektur dasar

## Alur request

```text
public/index.php → bootstrap → route → controller modul → view / respons
```

Core hanya menangani infrastruktur bersama. Controller mengoordinasikan request; logika bisnis berikutnya diletakkan dalam service modul dan query SQL dalam repository modul. Jangan menambah lapisan jika belum ada kebutuhannya. Penamaan internal memakai bahasa Inggris yang konsisten; teks pengguna memakai bahasa Indonesia.

Operator dan output adalah dua route terpisah. Operator berpindah panel di browser. Modul peserta, hadiah, isian dan Persiapan dimuat saat dibutuhkan; data dipakai kembali selama sesi halaman. Setelah mutasi peserta hanya halaman aktif dan ringkasannya dibaca ulang, sedangkan hadiah/isian diperbarui dari hasil mutasi. Perubahan isian menginvalidasi daftar peserta. Tidak ada polling daftar. Preview menggunakan route output yang sama. DrawState memuat snapshot awal lalu menyiarkan perubahan putaran/hasil lewat BroadcastChannel. Renderer tidak mengakses daftar peserta.

`public/assets/modules/output-controller.js` mengelola izin dan pemilihan layar. Daftar layar diperbarui melalui event perangkat, bukan polling. Modul ini tidak memiliki akses ke data peserta atau transaksi undian.

`presentation-session.js` mengelola pasangan panggung/operator. Urutannya wajib: panggil fullscreen pada iframe visual langsung dari klik operator, lalu tempatkan jendela operator pada layar asal. Jangan membuka popup output dahulu lalu meminta fullscreen di popup; cara tersebut kehilangan aktivasi pengguna dan membutuhkan izin fullscreen khusus. Alur fullscreen lebih dahulu mengikuti Window Management multi-screen experience.

Ketika output sudah fullscreen, klik Tampilkan berikutnya hanya memakai pasangan aktif. Setelah Esc atau ketika target berubah, operator mendelegasikan hak klik melalui `postMessage` dengan opsi `delegate: 'fullscreen'` ke panggung yang sama. Panggung langsung menggunakan ScreenDetailed dari cache perangkat dan memanggil Fullscreen API, tanpa request jaringan atau izin fullscreen otomatis. Jangan menambahkan await pengambilan data sebelum memakai delegasi yang berumur terbatas.

Mode panggung menyembunyikan seluruh kontrol operator, termasuk setelah Esc. `postMessage` memeriksa origin dan hubungan jendela; BroadcastChannel hanya membantu memulihkan pasangan setelah operator di-refresh, tanpa polling. Fullscreen diperiksa melalui Fullscreen API, bukan disimpulkan dari ukuran jendela. Dukungan utama adalah Chrome desktop modern dengan Window Management, fullscreen companion window, dan fullscreen capability delegation.

Preview dan panggung menggunakan template output yang sama. Implementasi undian berikutnya harus mengirim status visual yang sama ke keduanya, tanpa membutuhkan pembacaan ulang peserta.

## Batas modul

| Modul | Tanggung jawab |
| --- | --- |
| Auth | Identitas, login, sesi persisten, pemeriksaan akses |
| Events | Informasi acara, isian tambahan, visual |
| Operator | Merangkai kontrol dan navigasi, bukan menjalankan transaksi bisnis |
| Presentation | Render visual dari status output, bukan pemilik daftar peserta |
| Participants | Detail, status, filter, kelayakan, edit massal dan aturan duplikasi |
| Prizes | Stok, urutan, pemilihan, background berdasarkan hadiah |
| Draws | Pemilihan peserta, pembagian hadiah, pengesahan dan eliminasi satu putaran |
| Imports | Excel/staging/pratinjau/commit, sumber Google, cursor/lease, konflik dan sinkronisasi bertahap |
| History | Audit operator, daftar pemenang, laporan PDF |

## Kerapian implementasi setiap tahap

- Tetapkan modul pemilik dan alur request → validasi → aturan bisnis/transaksi → query → respons → pembaruan UI sebelum menambah perilaku.
- Pertahankan controller/API untuk koordinasi, service untuk aturan bisnis/transaksi, repository untuk SQL, dan template untuk tampilan. Infrastruktur bersama tetap berada dalam core yang tipis. Jangan membangun lapisan hanya untuk memperbanyak pemisahan berkas.
- Di frontend, pisahkan pengendali fitur, akses API, komponen/formulir bersama, dan render presentasi sesuai kebutuhan nyata. `operator.js` tetap merangkai navigasi dan modul. Jangan memperluas `management-controller.js` menjadi penampung undian, import, laporan, atau seluruh perilaku aplikasi; pisahkan pengelolaan peserta/hadiah/isian ketika perilakunya berkembang.
- Gunakan penamaan field/status/payload yang konsisten di seluruh alur. Komponen yang sama memakai token CSS, ikon, ukuran, dan pola interaksi yang sama. Hindari salinan logika atau styling yang hanya berbeda karena letak fitur.
- Rapikan tanggung jawab yang bercampur pada bagian yang sedang diubah sebelum menambah fitur di atasnya. Perbarui dokumentasi dan jalankan pemeriksaan yang relevan terhadap perubahan perilaku.

## Akses data dan performa

- Persiapan: `SettingsService` memvalidasi informasi/visual dan versi, `SettingsRepository` memuat/menyimpan kolom pengaturan, `VisualSettings` memvalidasi koordinat/pilihan. `settings_version` terpisah dari versi global acara sehingga mutasi peserta/hadiah tidak membuat formulir acara bentrok tanpa alasan.
- Background: `BackgroundAsset` menerima raster maksimal 20 MB, memeriksa format/dimensi, lalu memberi nama acak di `public/assets/backgrounds`. File asli dipertahankan; tidak dikirim ke kanal konfigurasi. Tautan background hadiah memakai `prizes.background_path` dan versi hadiah; delta background disimpan bersama pengaturan/audit dalam satu transaksi.
- Frontend: `SettingsController` mengelola form/draft/save; `PresentationState` memuat konfigurasi sekali dan mengirim paket kecil melalui BroadcastChannel; `PresentationView` memakai SVG viewBox serta teks native, sehingga output tidak diraster dari preview kecil. Clock paket menangani respons awal yang datang terlambat; versi database mencegah draft lama menimpa hasil simpan baru.
- `PrizeStore` berbagi cache hadiah antara Persiapan dan daftar hadiah; `PrizeController` menangani render/urutan. Reorder memperbarui dua record berparameter di dalam lock acara, bukan memuat ulang seluruh list. `ManagementController` tetap mengelola editor bersama dan peserta/isian.
- Input visual digabung per frame animasi. Tidak ada query per keystroke/frame; QA browser memeriksa bahwa pengaturan tidak memuat peserta dan tidak menambah request data saat nilai berubah.
- Animasi hanya mengikuti draw aktif dari DrawState. Tombol Coba animasi dan kanal AnimationState sudah dihapus. `shuffle-model.js` menghasilkan glyph dari seed/waktu yang sama tanpa target nama, siklus reveal atau fase selesai; jitter memberi tempo berbeda tiap huruf. Seed ini bukan sumber pemilihan pemenang.
- `ShuffleAnimation` merender satu baris glyph HTML dalam SVG foreignObject agar transformasi rotateX tetap tajam mengikuti viewBox. Jumlah glyph/ukuran disesuaikan area; node dan metrik font didaur ulang. Satu requestAnimationFrame hanya berjalan saat terlihat dan aktif; reduced motion mengganti glyph tanpa flip setiap 800 ms. Tidak ada akses API/penyimpanan dari renderer, dan tidak ada paket per frame. Stop membatalkan frame/timer dan menyembunyikan glyph sebelum hasil SVG ditampilkan.

- Halaman dasar tidak membuka koneksi database atau mengambil daftar data.
- Endpoint modul hanya mengambil kolom dan halaman data yang diperlukan. Jangan menggunakan `SELECT *` untuk list aplikasi.
- Gunakan paginasi berbasis ID untuk list panjang dan query terindeks sesuai filter.
- Cache harus memiliki cakupan acara dan versi; invalidasi bagian terkait saat data berubah.
- Sinkronisasi memakai identitas baris, hash konten, dan cursor sejauh didukung sumber. Perubahan aturan deduplikasi dapat membutuhkan perhitungan ulang terarah; jangan dilakukan setiap aksi operator.
- Animasi huruf dijalankan lokal di browser. Kirim perubahan status output, bukan seluruh daftar peserta per frame.
- Snapshot hasil disimpan agar laporan tetap konsisten meskipun detail peserta berubah kemudian.
- Kecepatan di bawah 1 detik merupakan target yang harus diukur pada implementasi nyata, bukan hasil yang sudah terbukti di fondasi.

## Aturan transaksi untuk tahap implementasi

- Satu acara memiliki paling banyak satu putaran berstatus pending.
- Setiap putaran memiliki kunci idempotensi agar pengulangan request tidak membuat undian baru.
- Pengesahan mengunci dan memvalidasi peserta serta stok, mengubah seluruh hasil menjadi pemenang, mengurangi stok, menyelesaikan putaran, dan mencatat audit dalam satu transaksi.
- Eliminasi berlaku untuk seluruh hasil aktif, tanpa mengurangi stok.
- Mengosongkan hasil tidak mengubah peserta menjadi pemenang atau mengurangi stok.
- Status, stok, serta audit tidak boleh bergantung pada cache atau nilai yang dikirim frontend tanpa validasi.
- Semua referensi hasil wajib berasal dari acara yang sama; skema sudah memiliki foreign key gabungan untuk aturan ini.

DrawService menjalankan aturan tersebut melalui transaksi/lock acara; DrawRepository memuat SQL. Start menyimpan putaran rolling, alokasi hadiah, definisi isian dan seed visual tanpa membaca nama peserta. Kolom sample_names dipertahankan untuk kompatibilitas data lama dan diisi array kosong pada putaran baru. Stop memakai random_int dan sampel Floyd tanpa pengembalian, mengambil slot terpilih dan menyimpan snapshot hasil. Sahkan/Eliminasi memvalidasi peserta ulang; Sahkan juga memvalidasi/mengurangi stok, lalu memperbarui status/pool/versi/audit atomik. Kunci idempotensi Start terikat pada pengaturan permintaan; resolusi memakai status putaran agar retry tidak mengubah stok dua kali atau menghapus layar putaran lebih baru. Hasil confirmed tetap tampil sampai Clear atau Start berikutnya.

Migrasi `003_draw_engine.sql` menambahkan metadata putaran, pointer display_draw_id dan participant_pool. Pool memiliki slot rapat berindeks (event_id, position), dibentuk satu kali untuk data lama. Trigger menambahkan peserta available dan menukar slot terakhir saat peserta keluar dari kelayakan. Pembacaan kapasitas mengambil slot terakhir; Mulai/Stop tidak melakukan scan nama, ORDER BY random(), OFFSET acak atau pembacaan ulang seluruh ID. Pool tetap mengikuti status dalam transaksi yang sama. Migrasi 001–003 dijalankan otomatis oleh runtime lokal; PDO native memerlukan penerapan migrasi secara berurutan.

DrawController/RoundPrizes mengelola kontrol dan pembagian hadiah; DrawPresentation/result-layout merender nama/isian/hadiah dalam SVG dengan grid yang dihitung dari area dan metrik font. Respons membawa delta peserta/hadiah; halaman peserta yang sudah dimuat diperbarui dari delta. Bila respons hilang, satu GET memulihkan snapshot dan hanya cache terkait yang diinvalidasi. Versi putaran/data menolak paket lama. HistoryService/HistoryRepository menyajikan audit 50 baris dengan cursor ID; HistoryController memuat saat menu dibuka/perubahan terkait, tanpa polling.

Koreksi animasi pengguna sudah diterapkan: huruf terus acak tanpa fase membentuk nama hingga Stop. Pemilihan pemenang memakai random_int di server, terpisah dari seed/glyph visual.

## Filter dan edit massal

Filter dan daftar peserta memakai modul Participants. `ParticipantFilter` menormalkan kunci/nilai yang diizinkan, OR dalam satu isian dan AND antarisian. Mode include menyimpan pilihan; exclude menyimpan pengecualian sehingga Pilih semua tidak memerlukan pembacaan semua nilai. Include kosong tidak meloloskan peserta, exclude kosong meloloskan seluruh nilai. Nilai kosong direpresentasikan sebagai string kosong; pencocokan mengikuti nilai asli. Ini terpisah dari aturan normalisasi duplikasi.

`ParticipantQuery` menyatukan predikat filter, status dan awalan nama. `ParticipantQueryRepository` mengambil halaman 51 baris/nilai (50 ditampilkan, satu penanda halaman berikutnya). Query daftar memakai POST baca agar banyak pilihan tidak dimasukkan ke URL; pembacaan halaman/versi/ringkasan memakai snapshot repeatable read. Ringkasan dipakai kembali saat pindah halaman dan diperbarui bila versi peserta berubah. `ParticipantFilterService` memberi metadata isian serta halaman opsi yang mengikuti pilihan isian sebelumnya. Tidak ada pengunduhan seluruh nama atau polling.

Status berada dalam FilterControl menu Peserta sebagai kelompok pertama dengan opsi enum lokal, menggunakan switch, multi-centang dan Pilih semua yang sama. ParticipantController mengirim status_filter (mode include/exclude dan values) terpisah dari predikat isian. ParticipantQuery menormalkannya ke status yang diizinkan; pilihan aktif yang kosong menghasilkan AND false. Kontrak statuses lama tetap didukung. Opsi isian berikutnya turut dibatasi status aktif, dan pilihan seluruh hasil untuk edit massal memakai predikat status yang sama. Filter undian tetap memilih peserta available.

`ParticipantBulkService` memvalidasi skema, kolom/status yang boleh diubah, dan pilihan. Pilihan ID membawa versi tiap record. Pilihan seluruh hasil membawa predikat, pengecualian ID dan participants_version; perubahan data setelah pemilihan membatalkan mutasi sebelum menulis. `ParticipantBulkRepository` memuat SQL hitung/pemeriksaan/update dan mengembalikan jumlah perubahan, bukan daftar ID. Perubahan status Pemenang/Duplikat tetap dilindungi, dan seluruh pembaruan/audit atomik di bawah lock acara. Baris yang nilainya sama tidak ditulis ulang.

Migrasi `004_participant_filters.sql` menambahkan indeks nilai/awalan, participants_version, konfigurasi draw_filters dan draw_filter_pool. `DrawFilterPoolRepository` membentuk pool dari ID cocok hanya saat kriteria efektif berubah. Setelah itu trigger mempertahankan slot rapat hanya untuk peserta yang status/nama/isiannya berubah. Pilih semua tanpa pengecualian menggunakan pool utama. participants_version dinaikkan sekali per statement dari transition table, bukan satu kali per peserta. Stop mengambil slot acak dari pool yang sesuai dan memvalidasi predikat pada baris terpilih. Penghapusan isian membersihkan filter aktif terkait dan membangun ulang cache bila perlu; snapshot putaran lama tetap disimpan. Migrasi 001–004 harus diterapkan berurutan pada PDO native.

draw_filter_pool adalah cache turunan internal dengan RLS dan key unik; ia tidak memakai FK peserta per baris agar pembentukan cache besar tetap ringan. Isi cache dibentuk dari peserta kanonik dan dirawat trigger di bawah lock acara. Kelayakan/relasi acara/predikat selalu diperiksa kembali saat Stop melalui join peserta kanonik; jumlah hasil yang tidak sesuai membatalkan transaksi. FK kanonik participants, participant_pool dan draw_entries tetap dipertahankan. Pengujian mencakup cache rusak yang harus ditolak, serta batas waktu pembentukan pertama, penggunaan ulang dan Stop pada 50.000+ peserta.

Frontend: `ParticipantController` memiliki tabel/paginasi/pilihan/edit massal, `ManagementController` memiliki editor satu record bersama dan isian. `FilterControl` dipakai ulang pada daftar dan `DrawFilters`, termasuk switch, Pilih semua, nilai berikutnya, pencarian awalan dan cursor opsi. Input digabung dengan debounce dan respons lama ditolak menurut generasi request. Pilihan lintas halaman disimpan sebagai ID/versi atau predikat seluruh hasil dengan pengecualian; pilihan checkbox tidak merender ulang tabel sehingga scroll/fokus dipertahankan. `DrawFilters` menghitung kelayakan draft tanpa membangun pool; kriteria terakhir dipersistenkan saat Mulai. Delta undian memperbarui tabel tanpa filter langsung, sementara halaman berfilter yang terdampak dimuat ulang secara terbatas. Opsi terbuka diperbarui hanya saat data peserta berubah.

## Pengembangan dan hosting

Pengembangan lokal tetap menjadi tahap pertama. PHP native adalah runtime aplikasi yang direncanakan. PHP WebAssembly dan PostgreSQL WebAssembly hanya alat pengembangan; `scripts/local-database.mjs` menyambungkan query PHP ke PGlite melalui `post_message_to_js`, tanpa endpoint SQL di browser. Database lokal persisten berada di `storage/database`; satu proses mengunci direktorinya selama runtime aktif. Pengujian memakai database sementara terpisah. Jika koneksi native dikonfigurasi, repository yang sama memakai PDO PostgreSQL. Jembatan portabel tidak menjadi backend produksi.

`JsonApi` memeriksa sesi, scope halaman, CSRF, origin yang sama, JSON dan batas payload. AuthController mengoordinasikan login/logout; AuthService menjalankan verifikasi bcrypt, pembatasan percobaan dan sesi; AuthRepository menyimpan SQL pada skema privat doorprize_auth. Satu lookup terindeks memeriksa sesi + akun enabled; tidak ada pembacaan peserta untuk autentikasi. Cookie HttpOnly/SameSite=Lax diingat 30 hari. Token cookie hanya disimpan sebagai SHA-256; CSRF diturunkan dari token dan tidak menggantikan cookie. Tidak ada pendaftaran umum. Akun awal memakai UUID workspace lama agar data tetap utuh. EventContext menggantikan LocalEvent, memilih acara berdasarkan user terverifikasi dan mengisi actor audit yang sama. Database menerapkan role doorprize_app + claim owner melalui SET LOCAL, hanya selama transaksi; query tunggal memakai transaksi singkat, operasi Google HTTP tetap di luar transaksi. Snapshot read-only ditentukan pada BEGIN sebelum claim diterapkan. RLS memeriksa owner pada events; tabel anak mengikuti event_id, staging baris/chunk melalui import_batches. Background diperiksa registry acara dan disajikan lewat PHP, bukan file publik langsung. Scope sesi juga menjadi namespace kanal/jendela/Web Locks. Logout/401/kedaluwarsa membersihkan seluruh halaman terkait, sedangkan pending draw tetap di database. Sesi diperiksa ulang saat halaman terlihat kembali/BFCache, tanpa polling. CloudRuntime memvalidasi konfigurasi cloud, TLS database, origin HTTPS dan Storage privat sebelum melayani request.

Vercel Container dan Supabase khusus aplikasi baru sudah terhubung serta diverifikasi melalui preview cloud. Jangan memakai proyek Supabase atau konfigurasi Vercel aplikasi lama.

## Excel dan aturan duplikasi

Migrasi 005 menambahkan duplicate_keys/rule_version, fungsi key/quality, indeks kelompok, trigger key serta import_batches/import_chunks/import_rows dengan RLS. Terapkan 001–005 berurutan pada PDO native. Runtime portabel menerapkannya otomatis dan idempotent saat mulai. Tidak ada perubahan skema/database aplikasi lama.

GET /api/imports memberi metadata kecil. Worker membaca satu workbook lokal, mendeteksi sheet/header lalu memproyeksikan hanya kolom terpetakan. Baris dikirim maksimal 200/45 KB per chunk; JsonApi tetap membatasi 64 KB. Header/nomor ID dan isi sel menjadi teks; rumus hanya membaca cache hasil. Server memvalidasi ulang schema, mapping, panjang, nama dan urutan baris. Staging mengizinkan issue agar operator dapat melihat baris gagal sebelum commit.

Create/chunk memakai UUID + hash permintaan dan urutan potongan; retry identik tidak menambah baris. Preview mengunci acara/batch dan memakai temporary table ON COMMIT DROP untuk meranking data baru serta kelompok lama yang relevan. Bila aturan berubah, preview menilai data lama sekali dengan kunci yang diusulkan. Ia hanya mengubah staging. Simpan participants_version/rule_version/preview_revision; commit memeriksa semuanya serta pending draw. Commit mengubah aturan bila disepakati di preview, menambah source/participants, merekonsiliasi kelompok, memperbarui pool/versi/audit dalam satu transaksi. Retry commit mengembalikan summary tersimpan tanpa audit/insert kedua. Staging dihapus setelah commit; metadata batch disimpan untuk idempotensi. Draft yang lebih dari sehari dibersihkan saat create pada acara yang sama. Baris peserta/pool kanonik tetap memakai FK; ANALYZE setelah insert besar membantu rencana indeks pada perubahan kelayakan.

DuplicateRepository memakai key hash SHA-256 dari array nama kunci + nilai trim/lower yang semuanya terisi. Key NULL berarti tidak diperiksa. Data quality memprioritaskan nama bersih/proper case lalu jumlah isian terisi; ID paling kecil memecahkan seri. Status winner/eliminated dipertahankan dan didahulukan sebagai jangkar. Reconcile memilih satu available dan sisanya duplicate dengan duplicate_of_id. Menghapus keeper melepas referensi lalu memilih ulang kelompok lama. Edit tunggal membawa kunci lama/baru; massal memakai temporary workset ID/kunci, bukan memuat semua peserta ke PHP. Perubahan aturan adalah satu-satunya operasi rutin yang menghitung seluruh kelompok ulang.

ImportController memiliki sesi dialog agar respons lama tidak menimpa pembukaan baru; ImportMapping, ImportPreview, DuplicateRuleEditor dan ExcelClient memisahkan UI/parsing. records-changed memperbarui halaman/ringkasan peserta yang relevan dan snapshot kapasitas undian. Bundle ExcelJS tidak dibaca saat animasi atau setiap frame.

ExcelJS dipin 4.4.0, disalin bersama lisensi oleh build-assets. `npm audit` pada tahap ini melaporkan advisory UUID GHSA-w5hq-g745-h8pq (dua entri dependency, moderate). Jalur rentan adalah API v3/v5/v6 dengan buffer yang diberikan pemanggil; ExcelJS hanya memakai uuid.v4 pada dua cf-rule-ext-xform. Aplikasi tidak mengekspos API UUID tersebut ke input import. Tidak menjalankan audit fix --force yang menurunkan versi ExcelJS; tinjau kembali saat upgrade. Sumber: https://github.com/exceljs/exceljs dan https://github.com/advisories/GHSA-w5hq-g745-h8pq.

## Google Sheets dan portabilitas

GoogleSourceService memiliki setup/config/jadwal/kontrol sumber/resolve; GoogleSyncService memiliki reserve → HTTP → apply. Semua SQL ada pada GoogleSourceRepository/GoogleRowRepository; GoogleRowPlan menjalankan three-way merge; GoogleRowService menulis data/pool secara atomik di bawah lock acara. GoogleAddress membatasi URL/redirect HTTPS Google, GoogleProtocol memvalidasi identitas/header/cursor dan memproyeksikan hanya kolom terpetakan. SecretVault memakai AES-GCM, APP_ENCRYPTION_KEY pada cloud dan fallback key lokal privat.

Lease, revision, metadata, cursor dan baseline per-row disimpan pada PostgreSQL. HTTP tidak memegang transaksi/lock acara. Setelah jaringan, validasi ulang lease/config, skema isian, pending draw, header dan deadline. Per batch maksimal 200 perubahan, ulang cursor/ID/hash tidak menggandakan peserta. Empty delta langsung berhenti sebelum akses participants/pool. Draft sumber tidak memasukkan data. Initial snapshot menahan Mulai; existing pending draw menahan penerapan perubahan. Row UUID stabil memungkinkan update/deletion. Snapshot ulang karena struktur menandai seen_snapshot lalu mengeliminasi yang hilang; hanya source terkait yang diperiksa sekali pada tahap itu.

Merge: source field tidak berubah mempertahankan nilai operator. Jika source dan operator sama-sama mengubah field yang sama dengan nilai berbeda, simpan incoming + conflict. Resolve memakai versi row/config; gunakan remote tidak melewati validasi/status proteksi. Invalid baru tidak membuat participant; invalid update mempertahankan record valid sebelumnya. Hapus manual melepaskan FK source-row dan memasang locally_removed. Delete sumber mengeliminasi available/duplicate, winner tetap; anchor dedup tetap melindungi eliminasi/pemenang dari pendaftaran ulang.

GoogleSync/GoogleController/GoogleDialog/GoogleIssues terpisah dari ManagementController. Form pemetaan dipakai ulang melalui ImportMapping dengan prefix data-google-field. Status sumber diperbarui pada node yang sama agar fokus tidak terlepas. Metadata kecil dijadwalkan hanya ketika ada sumber aktif; Web Locks, BroadcastChannel dan revision mencegah respons lama/HTTP ganda antarjendela. Renderer output/is-output-host tidak mengambil sumber. ParticipantController membaca ulang halaman/ringkasan aktif hanya saat participant delta berubah.

Konektor Apps Script memakai kolom UUID dan sheet log/index tersembunyi. Trigger form/edit mencatat range sebelum bekerja; drain maksimal 200 serta tail append memulihkan kegagalan, tanpa memindai isi semua peserta pada idle. Delete/struktur mengubah epoch, edit header mengubah hash. Google tidak menjalankan trigger bagi API/script: penulis dapat memanggil catatPerubahanDoorprize. Kode disajikan pada setup operator; tidak dijalankan alat pengembangan pada Google pengguna.

Vercel memakai Container PHP sesuai dokumentasi resmi; tidak memerlukan vercel-php komunitas. Supabase memakai PostgreSQL privat lewat PDO/pooler. Baseline lengkap dan migrasi Sheets dibuat CLI dalam supabase/migrations; paket tersebut diuji langsung pada PostgreSQL kosong, semua 16 tabel acara RLS dan FK tenant valid, serta ulang migrasi mempertahankan data. Runtime lokal tetap PGlite; HTTP job adapter hanya untuk antrean WASM, tidak menjadi storage/daemon produksi. Lihat DEPLOYMENT.md; Auth/owner/CSRF, Storage privat dan HTTPS/PDO/pooler/Container sudah diuji di cloud. BackgroundController mengoordinasikan upload, CloudBackgroundService memvalidasi alur prepare/complete, BackgroundRepository memuat SQL, dan BackgroundStorage memanggil API Storage. RequestOrigin memakai origin server yang ditentukan, tanpa mempercayai header proxy klien.

## Canvas dinamis

CanvasGeometry memisahkan default/validasi geometri dari VisualSettings. Lebar/tinggi area tidak melebihi canvas; jarak maksimal sama dengan ukuran canvas dikurangi area. Acuan disimpan sebagai area_anchor_x=left/right dan area_anchor_y=top/bottom; area_x/area_y merupakan jarak pixel dari acuan tersebut. Data lama memperoleh acuan left/top melalui default, sehingga tetap kompatibel. Tidak ada migrasi SQL baru: tambahan konfigurasi berada pada visual_settings JSONB yang sama.

CanvasControls memiliki satu baseline per sesi edit angka agar input sementara (misalnya 3 saat mengetik 3840) tidak menghilangkan ukuran area sebelumnya. Editor memakai slider pergeseran dari pusat. centeredGeometry menyelesaikan acuan lama sekali ke left/top, centerOffsets menghitung pergeseran signed, dan read mengirim jarak left/top kompatibel ke API. Tidak ada dropdown arah pada UI. editGeometry mengubah ukuran dari pusat dan membatasi posisi; perubahan dimensi canvas mereset area ke ukuran maksimal dan pusat pada sumbu terkait. Posisi memakai ketelitian 0,5 px agar dimensi ganjil tepat di tengah. Batas slider simetris mengikuti separuh ruang tersisa; ruang nol menonaktifkan slider, bukan renderer. CanvasPreview hanya menerima paket visual dan mengatur variabel CSS rasio/tinggi; tidak mengambil data. Frame portrait/panorama mengikuti canvas tetapi dibatasi tinggi agar kontrol operator tetap terlihat.

PresentationView memanggil resolveNameArea sekali untuk mengubah jarak menjadi koordinat absolut SVG. Konfigurasi absolut yang sama diteruskan ke standby, guide, animasi dan hasil/clip, sehingga anchor tidak ditafsir ulang oleh renderer lain. background_fit memakai SVG meet untuk contain atau slice untuk cover, berlaku juga saat background hadiah aktif. SVG canvas tetap meet terhadap monitor fisik agar rasio tidak terdistorsi; preview ringkas tidak menjadi sumber raster output.

Default canvas dibaca dari metadata CanvasGeometry::DEFAULTS pada view. Reset merupakan draft geometri saja, tanpa API, perubahan data peserta/hadiah, informasi acara, font atau background. Simpan memakai settings_version/audit yang sama; Muat ulang memulihkan nilai tersimpan. Uji mencakup 1008 kombinasi JS/PHP, batas min/maks, anchor, pengetikan, portrait/panorama/8K, fullscreen hasil, background fit, Default scoped dan penyimpanan/reload tanpa query pada perubahan visual.


FieldVisibilityControls memisahkan switch output dari CRUD isian. Event field-list-rendered membawa maksimal tiga metadata untuk menambahkan switch; nilai show_field_1/2/3 mengikuti SettingsController/PresentationState dan settings_version yang sama. Default semua true; tidak perlu migrasi tabel. result-layout menyaring isian tersembunyi sebelum menghitung grid/tinggi, dengan ukuran dasar bersama dan rasio slot 0,5/0,25/0,25. Lebar detail ikut membatasi ukuran dasar agar teks panjang tetap masuk tanpa merusak hierarki.

Fixture peserta hanya berada di scripts/sample-participants.mjs dan seed-sample-participants.mjs. Seed lokal menyiapkan 500 baris fiktif, menyimpan identitas/seed batch, lalu memakai create/chunk/preview/commit dari Imports. Pengulangan commit ditangani server; tidak ada endpoint seed produksi atau SQL bypass. Aturan/skema disalin dari metadata saat batch dibuat dan harus tetap sama sebelum commit.


output-typography.js berbagi metrik glyph dan acuan Nama dengan ShuffleAnimation; advance font dicache per measure context/font. resultSizeLimit = reference / count^0,25 menurunkan batas Nama menurut jumlah. result-layout mengukur hanya entries terpilih sekali: lebar maksimal nama/isian/hadiah per blok dan tinggi relatif isian yang terlihat. Kandidat grid memakai lebar terbesar dari blok normal (lebar ≤ median bawah × 1,6); skor 80% ukuran umum + 20% rata-rata ukuran blok menjaga keterbacaan mayoritas. Blok yang masih terlalu lebar diperkecil sendiri, termasuk rasio detail/hadiahnya. Nama selalu satu text node, tanpa wrapping/ellipsis; tidak ada slider ukuran wajib atau perubahan query peserta.

DrawPresentation menyimpan Map node per participant_id dan memperbarui hanya teks/atribut yang berubah. resultKey mengikuti draw.id pada fase result; transisi dijadwalkan sekali setelah perubahan ke hasil, sementara hasil awal dari recovery ditampilkan langsung. ResultEntrance memiliki Web Animations, reduced motion dan pembersihan siklus hidup. Maksimal 380 + 160 ms, tanpa timer/query/loop frame JS. Perubahan konfigurasi/pengesahan mempertahankan node dan animasi yang sedang berjalan. Clear menghapus node dan membatalkan seluruh efek.


Standby satu baris bold 700 memakai 68% acuan glyph, tinggi maksimal 22% area dan lebar maksimal 94% area berdasarkan pengukuran SVG aktual. Parent text memakai dominant-baseline central dan koordinat pusat area; tspan melanjutkan kalimat pada baseline yang sama. Template fallback juga satu baris. Uji mencakup ukuran menurut jumlah 1–100, satu baris lengkap termasuk Unicode, nama ekstrem terpisah, standby muat area, skala kecil/8K dan tanpa request data.


## Daftar pemenang dan laporan

`GET /api/winners` mengembalikan `{items,next,snapshot,meta}` pada awal, dan tanpa meta pada halaman lanjutan. Default 50 pemenang; `export=1` memakai 500. `next` berisi draw_id/position; kirim snapshot/after_draw/after_position untuk melanjutkan. Snapshot harus ID confirmed milik acara (atau 0). Repository memakai indeks gabungan event_id/draw_id/position, tanpa OFFSET, SELECT seluruh peserta, atau join data peserta/hadiah mutable.

Snapshot maksimum confirmed + metadata/total dibaca sekali. Karena hanya satu pending per acara dan confirmed tidak diubah kembali, pengesahan berikutnya selalu berada setelah batas snapshot. Urutan putaran/posisi tetap stabil tanpa job/file/state server. Nama/nilai/hadiah dan field_definitions berasal dari snapshot Stop yang disahkan, bukan nilai master terkini.

HistoryNavigation mengatur dua panel dalam Riwayat. HistoryController hanya memuat Aktivitas ketika panel terlihat; WinnerController hanya memuat Pemenang dan menginvalidasi pada confirmed baru. Paginasi menjaga cursor/snapshot dan menolak respons usang lewat revision. ReportClient memuat worker PDF saat export; terminate membatalkan fetch/generasi dan menolak pesan lama.

winner-report-worker mengambil halaman pemenang dari snapshot yang sama, mengirim progress, lalu mengubah definisi winner-report menjadi PDF lewat pdfmake/font Roboto lokal. A4 landscape, font seluruh elemen ≥12 pt, header acara ringkas dan footer halaman/total berulang, header tabel berulang. Tabel baru dipakai jika definisi isian historis berubah. Teks panjang membungkus/berlanjut ke halaman lain, tidak mengecilkan font. Export tidak menyentuh status/stok, main thread atau file sementara server; auth/guard produksi tetap mengikuti aplikasi.


## Dropdown filter bersama

FilterControl tetap memiliki metadata, kelompok switch/Pilih semua, nilai, opsi berpaginasi dan generasi request. Ia kini EventTarget dengan statechange untuk presenter FilterDropdown. Presenter hanya menampilkan predikat efektif, warna/badge tombol, reset dan posisi popup dalam viewport; tidak memanggil API. Eksklusi kosong tidak dihitung aktif, sedangkan include kosong aktif dan menghasilkan nol peserta.

Popup fixed tidak mengubah tinggi halaman; fit dihitung saat buka/resize/scroll dengan lebar min(380, toolbar, viewport−32) dan batas tinggi yang tersedia. Ia dapat membuka ke atas, menutup via Escape/klik luar/pindah tab, dan tetap mengizinkan inspeksi ketika input filter terkunci selama pending.

Clear menaikkan generation semua kelompok, membatalkan debounce opsi, mereset nilai/search, lalu notify sekali. DrawFilters melakukan count ter-debounce yang sudah ada; ParticipantController menjalankan queryChanged yang mereset halaman dan pilihan massal. DrawFilters menjaga draft yang berbeda dari konfigurasi lama ketika Kosongkan layar diterima, lalu mengikuti konfigurasi aktual saat putaran pending dimulai. Tidak ada perubahan SQL, pool, polling atau pembacaan semua peserta.


DrawStatus memisahkan tampilan status putaran/lock notice dari aturan transaksi DrawController. Status dan alasan kunci menggunakan snapshot DrawState yang sudah dimuat, termasuk setelah refresh, tanpa polling atau query baru. Panel kontrol maksimal 620px dan grup tombol maksimal 412px; grup tombol/jumlah terpusat pada preview. Output ada di kiri dan filter di kanan toolbar, jumlah di kanan tombol atau turun kanan saat sempit. Container query hanya membungkus tombol/jumlah agar popup filter fixed tetap memakai koordinat viewport. Mulai selebar tiga tombol bawah, dengan tinggi konsisten. Kosongkan tidak menjalankan changeParticipants/consumePrizes; pengujian pembatalan berhadiah membandingkan status/versi peserta dan stok sebelum/sesudah.

Nama client/acara memakai dua kolom pada formulir Persiapan; penanda Pengembangan lokal di area kerja dihapus. Penataan ini hanya mengubah view/CSS, tanpa query atau alur penyimpanan tambahan.
