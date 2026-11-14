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

Pertukaran token Vercel → STS Google → IAM Credentials berhasil diuji. Scope token pembaca: `spreadsheets.readonly` dan `drive.metadata.readonly`. Ini baru verifikasi identitas; pembacaan/sinkronisasi spreadsheet nyata dan adapter aplikasi belum diaktifkan. Konektor Apps Script yang ada tetap berfungsi selama transisi.

## Keputusan sinkronisasi yang masih ditunggu

API Sheets baca saja tidak menyediakan catatan baris yang berubah. Usulan yang ditanyakan kepada pengguna: periksa versi file, lewati isi peserta bila versi tetap; ketika berubah, periksa kolom terpakai per maksimal 200 baris, terapkan delta saja. Jangan mengganti mekanisme lama sebelum kompromi ini disepakati. Untuk edit/hapus/sortir yang aman diperlukan identitas baris stabil, misalnya Timestamp/ID unik; jangan diam-diam memakai nomor baris atau nama sebagai identitas.

Spreadsheet contoh privat telah diminta untuk uji baca nyata. Data peserta aplikasi dan undian tidak boleh bergantung pada keberhasilan jaringan Google; gagal baca tidak boleh memicu penghapusan/eliminasi atau menimpa edit operator.

## Keamanan dan pengembangan

Kredensial CLI, token jangka pendek dan hasil uji berada hanya di `.cache/` yang diabaikan Git, Docker dan Vercel. Jangan mengambil konfigurasi/kredensial aplikasi lama. Pengambilan seluruh environment Vercel ditolak review otomatis karena cakupannya berlebihan; gunakan endpoint token khusus proyek bila perlu menyegarkan token pengembangan. Token, client secret dan kunci tidak boleh masuk source, audit, respons list atau BroadcastChannel.

Referensi resmi: [Service account dan berbagi sheet](https://developers.google.com/workspace/guides/create-credentials), [Vercel OIDC ke Google](https://vercel.com/docs/oidc/gcp), [Google Sheets API](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/get).
