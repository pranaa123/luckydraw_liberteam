# Pembaca Google Sheets privat

Keputusan pengguna: gunakan akun layanan khusus aplikasi, spreadsheet dibagikan sebagai Viewer, lalu operator memasukkan link. Tidak memerlukan Apps Script atau spreadsheet publik. Kunci duplikasi tetap mengikuti switch operator; identitas baris sinkronisasi tidak menggantikan aturan tersebut.

## Identitas yang sudah disiapkan

- Google Cloud project: `luckydraw-liberteam`, number `203795669606`.
- Email Viewer: `sheets-reader@luckydraw-liberteam.iam.gserviceaccount.com`.
- Sheets API, Drive API, IAM, IAM Credentials dan STS aktif. Tidak ada billing/komputasi baru yang diaktifkan oleh pengaturan ini.
- Workload Identity Pool: `luckydraw-vercel`, provider `vercel`, lokasi `global`.
- Issuer: `https://oidc.vercel.com/kapsul-photobooth`; audience token Vercel: `https://vercel.com/kapsul-photobooth`.
- Kondisi provider membatasi owner_id `team_5XCB6S7d2lXOYacNsiSsLJZY`, project_id `prj_A1SLJkMkMo58eUXy7MNMgcP7vJw5`, serta environment production/preview/development.
- Akun layanan tidak mempunyai role administrator proyek. Binding `roles/iam.workloadIdentityUser` hanya untuk identitas proyek Vercel tersebut. Tidak dibuat kunci privat service account.

Pertukaran identitas Vercel → STS → IAM Credentials berhasil diuji. Scope pembaca: spreadsheets.readonly dan drive.metadata.readonly. Runtime berada di Modules/Imports/Google/Reader. GOOGLE_READER_EMAIL dan GOOGLE_READER_AUDIENCE merupakan konfigurasi non-rahasia; token runtime datang dari header x-vercel-oidc-token, bukan kunci privat permanen.

## Alur dan batas pembacaan

Periksa link tidak membuat sumber: server mengembalikan metadata, lima contoh baris dan inspeksi bersegel 10 menit terikat pemilik/acara/skema. Hubungkan memvalidasi versi koneksi dan pemetaan, lalu mengganti satu sumber secara atomik. Koneksi lama dan peserta dipertahankan bila pemeriksaan gagal; pergantian sumber tidak menghapus peserta lama.

ReaderSheet memakai versi Drive untuk melewati data ketika tidak berubah. Ketika berubah, hanya kolom terpetakan dan identitas yang diperiksa, maksimal 200 baris per proses. API Sheets baca tidak menyediakan log perubahan per baris. Timestamp/ID stabil terpisah dari duplikasi. Snapshot saat file berubah tidak mengeliminasi baris hilang; pemindaian stabil berikutnya menyelesaikannya. ID kosong/ganda menahan penerapan potongan tersebut. Jadwal, lock pending draw, lease, validasi ulang dan merge tiga arah dipakai bersama jalur terdahulu.

Backend fixture menguji 450 baris/tiga halaman, perubahan versi snapshot, ID ganda lintas halaman, permission error, idle versi saja, penggantian atomik dan pemetaan ulang tanpa peserta ganda. Browser fixture menguji Viewer/link tanpa Apps Script, satu kartu koneksi, batal tanpa record dan undian saat Google lambat. Sheet privat pengguna tetap memerlukan share Viewer dari pemiliknya.

## Keamanan dan pengembangan

Kredensial CLI, token jangka pendek dan hasil uji berada hanya di `.cache/` yang diabaikan Git, Docker dan Vercel. Jangan mengambil konfigurasi/kredensial aplikasi lama. Pengambilan seluruh environment Vercel ditolak review otomatis karena cakupannya berlebihan; gunakan endpoint token khusus proyek bila perlu menyegarkan token pengembangan. Token, client secret dan kunci tidak boleh masuk source, audit, respons list atau BroadcastChannel.

Referensi resmi: [Service account dan berbagi sheet](https://developers.google.com/workspace/guides/create-credentials), [Vercel OIDC ke Google](https://vercel.com/docs/oidc/gcp), [Google Sheets API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get).
