<?php

declare(strict_types=1);

use App\Core\View;

require __DIR__ . '/partials/icons.php';
$tabs = ['draw' => ['Undian', 'spark'], 'participants' => ['Peserta', 'users'], 'prizes' => ['Hadiah', 'gift'], 'settings' => ['Persiapan', 'settings'], 'history' => ['Riwayat', 'history']];
?>
<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <?php require __DIR__ . '/partials/auth-meta.php'; ?>
    <title><?= View::escape($appName) ?> — Operator</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/assets/app.css">
    <script type="module" src="/assets/operator.js"></script>
</head>
<body class="operator-body">
    <a class="skip-link" href="#workspace">Langsung ke pengaturan</a>
    <header class="app-header">
        <a href="/" class="brand" aria-label="Doorprize, halaman utama"><span class="brand-icon"><?= $icon('spark') ?></span><span><?= View::escape($appName) ?><small>RUANG OPERATOR</small></span></a>
        <nav class="navigation" aria-label="Menu utama" role="tablist">
            <?php foreach ($tabs as $key => [$label, $symbol]): ?>
                <button type="button" role="tab" id="tab-<?= $key ?>" aria-controls="panel-<?= $key ?>" aria-selected="<?= $key === 'draw' ? 'true' : 'false' ?>" tabindex="<?= $key === 'draw' ? '0' : '-1' ?>" data-tab="<?= $key ?>" class="nav-tab"><?= $icon($symbol) ?><span><?= $label ?></span></button>
            <?php endforeach; ?>
        </nav>
        <div class="account-controls"><span class="local-badge"><span class="status-dot"></span>Lokal</span><button type="button" id="auth-logout" class="button button-quiet button-icon" aria-label="Keluar" title="Keluar"><?= $icon('logout') ?></button></div>
    </header>

    <main class="workspace">
        <section class="preview-column" aria-label="Preview dan kontrol undian">
            <div class="preview-shell"><iframe src="/output?preview=1" title="Preview output presentasi" class="preview-frame"></iframe><div class="preview-footer"><span>PREVIEW OUTPUT</span><span id="preview-resolution">1920 × 1080</span></div></div>
            <div class="control-panel">
                <div class="output-toolbar draw-filter-toolbar">
                    <div class="output-controls"><button type="button" class="button button-quiet" id="choose-output-screen" hidden>Pilih layar</button><select id="output-screen" class="screen-select" aria-label="Layar tujuan output" hidden></select><button type="button" class="button button-quiet" id="open-output"><?= $icon('screen') ?><span id="open-output-label">Buka output</span></button></div>
                    <div class="filter-dropdown">
                        <details class="draw-filter-card filter-menu" id="draw-filter-menu">
                            <summary><?= $icon('filter') ?><span>Filter peserta</span><span class="filter-count" data-filter-count hidden></span></summary>
                            <div id="draw-filters" class="card filter-dropdown-panel"></div>
                        </details>
                        <button type="button" class="button button-secondary button-icon filter-clear" data-clear-filters aria-label="Hapus filter peserta undian" title="Hapus filter" hidden><?= $icon('delete') ?></button>
                    </div>
                </div>
                <div class="draw-status-row"><span class="draw-status" id="draw-session-status" data-state="loading" role="status"><span class="status-dot" aria-hidden="true"></span><span id="visual-status">Menghubungkan…</span></span></div>
                <div class="draw-controls-container">
                    <div class="draw-controls-layout">
                        <div class="draw-buttons">
                            <button type="button" class="button button-primary start-button" id="draw-start" disabled><?= $icon('play') ?><span>Mulai undian</span></button>
                            <div class="action-row">
                                <button type="button" class="button button-secondary button-success" id="draw-confirm" disabled><?= $icon('check') ?>Sahkan</button>
                                <button type="button" class="button button-secondary button-danger" id="draw-eliminate" disabled><?= $icon('remove') ?>Eliminasi</button>
                                <button type="button" class="button button-secondary button-clear" id="draw-clear" disabled aria-label="Kosongkan undian" title="Batalkan undian tanpa mengesahkan atau mengeliminasi peserta dan tanpa mengurangi hadiah"><?= $icon('clear') ?>Kosongkan</button>
                            </div>
                        </div>
                        <div class="draw-quantity">
                            <div class="card quantity-card"><label for="winner-count">Jumlah nama</label><input id="winner-count" type="number" value="1" min="1" disabled></div>
                            <div class="draw-capacity-summary"><span id="draw-capacity" class="field-hint">Menghubungkan…</span><button type="button" class="button button-quiet button-icon" id="draw-reload" aria-label="Muat ulang kontrol undian" title="Muat ulang kontrol undian"><?= $icon('history') ?></button></div>
                        </div>
                    </div>
                </div>
                <p class="draw-lock-notice" id="draw-lock-notice" role="status" hidden><?= $icon('lock') ?><span id="draw-lock-reason"></span></p>
                <p id="draw-pending-message" class="draw-status-message" role="status" hidden></p>
            </div>
            <p id="output-message" role="status" class="feedback" hidden></p>
            <p id="draw-feedback" role="status" class="feedback" hidden></p>
        </section>

        <section class="workspace-panel" id="workspace" aria-label="Pengaturan operator">
            <p id="management-feedback" class="feedback" role="status" hidden></p>

            <div role="tabpanel" id="panel-draw" aria-labelledby="tab-draw" data-panel="draw" tabindex="0">
                <div class="panel-heading"><div><p class="eyebrow">01 / UNDIAN</p><h2>Atur momen berikutnya.</h2></div><?= $icon('spark', 'heading-icon') ?></div>
                <div class="card"><div class="card-heading"><h3>Hadiah undian</h3><label class="switch"><input type="checkbox" id="draw-with-prizes" disabled aria-label="Dengan hadiah"><span></span></label></div><p class="subtle-text" id="draw-prize-description">Tanpa hadiah</p><div class="round-prize-mode" id="draw-prize-mode" hidden><span id="draw-prize-mode-label">Hadiah acak</span><label class="switch"><input type="checkbox" id="draw-random-prizes" checked aria-label="Hadiah acak"><span></span></label></div><div id="draw-prize-list" class="round-prize-list" hidden></div><p id="draw-allocation-summary" class="field-hint" hidden></p></div>
                <div id="draw-result-list" class="card" hidden></div>
                <div class="footnote"><span>ALUR UNDIAN</span><p>Mulai <span>→</span> Stop <span>→</span> Sahkan atau eliminasi</p></div>
            </div>

            <div role="tabpanel" id="panel-participants" aria-labelledby="tab-participants" data-panel="participants" tabindex="0" hidden>
                <div class="panel-heading"><div><p class="eyebrow">02 / PESERTA</p><h2>Daftar yang siap diundi.</h2></div><?= $icon('users', 'heading-icon') ?></div>
                <div class="participant-toolbar"><button class="button button-secondary" type="button" data-open-editor="participant"><?= $icon('plus') ?>Tambah peserta</button><div class="import-actions"><button class="button button-secondary" type="button" id="participants-import-excel"><?= $icon('upload') ?>Import Excel</button><button class="button button-secondary" type="button" id="participants-google-sheets"><?= $icon('link') ?>Google Sheets</button></div></div>
                <div id="google-source-list" class="google-source-list" aria-label="Sumber Google Sheets" hidden></div>
                <div class="participant-query-bar">
                    <input type="search" id="participant-search" placeholder="Cari awalan nama…" aria-label="Cari awalan nama peserta">
                    <button type="button" id="participants-bulk-edit" class="button button-secondary button-icon participant-bulk-button" aria-label="Edit massal" title="Edit massal" disabled><?= $icon('edit') ?></button>
                    <div class="filter-dropdown">
                        <details class="participant-filter-card filter-menu" id="participant-filter-menu">
                            <summary><?= $icon('filter') ?><span>Filter peserta</span><span class="filter-count" data-filter-count hidden></span></summary>
                            <div id="participant-filters" class="card participant-filter-panel filter-dropdown-panel"></div>
                        </details>
                        <button type="button" class="button button-secondary button-icon filter-clear" data-clear-filters aria-label="Hapus filter peserta" title="Hapus filter" hidden><?= $icon('delete') ?></button>
                    </div>
                </div>
                <div id="participant-summary" class="flex flex-wrap gap-2 mb-5"><?php foreach ($statuses as $status): ?><span class="quiet-badge"><?= View::escape($status->label()) ?> · 0</span><?php endforeach; ?></div>
                <div class="participant-selection-bar"><span id="participant-matched" class="field-hint">0 hasil</span><button type="button" id="participants-select-all" class="button button-quiet" disabled>Pilih semua hasil</button><span id="participants-selected" class="field-hint">0 dipilih</span><button type="button" id="participants-clear-selection" class="button button-quiet button-icon" aria-label="Hapus pilihan" title="Hapus pilihan" disabled><?= $icon('delete') ?></button></div>
                <div id="participant-list"></div>
                <div class="list-pagination" id="participant-pagination" hidden><button type="button" class="button button-secondary" id="participants-previous">Sebelumnya</button><span id="participant-page" class="field-hint"></span><button type="button" class="button button-secondary" id="participants-next">Berikutnya</button></div>
            </div>

            <div role="tabpanel" id="panel-prizes" aria-labelledby="tab-prizes" data-panel="prizes" tabindex="0" hidden>
                <div class="panel-heading"><div><p class="eyebrow">03 / HADIAH</p><h2>Siapkan kejutan.</h2></div><?= $icon('gift', 'heading-icon') ?></div>
                <button class="button button-secondary mb-5" type="button" data-open-editor="prize"><?= $icon('plus') ?>Tambah hadiah</button>
                <p id="prize-summary" class="subtle-text mb-3"></p>
                <div id="prize-list" class="record-list"></div>
                <p class="subtle-text mt-4">Stok berkurang setelah pemenang disahkan.</p>
            </div>

            <div role="tabpanel" id="panel-settings" aria-labelledby="tab-settings" data-panel="settings" tabindex="0" hidden>
                <div class="panel-heading"><div><p class="eyebrow">04 / PERSIAPAN</p><h2>Sesuaikan panggung.</h2></div><?= $icon('settings', 'heading-icon') ?></div>
                <?php require __DIR__ . '/partials/settings-form.php'; ?>
                <div class="card"><h3>Isian undian</h3><div class="field-summary"><span>Nama</span><span class="quiet-badge">Wajib</span></div><div id="field-list" class="record-list"></div><button type="button" class="button button-quiet mt-3" data-open-editor="field"><?= $icon('plus') ?>Tambah isian</button><p class="field-hint mt-2">Maksimal 3 isian tambahan.</p></div>
                <div class="card form-stack"><h3>Aturan duplikasi</h3><div id="duplicate-keys" class="duplicate-keys"></div><p class="field-hint">Semua kunci harus terisi dan sama. Huruf besar/kecil diabaikan. Tanpa kunci, pemeriksaan nonaktif.</p><div class="flex flex-wrap gap-2"><button type="button" id="duplicate-reload" class="button button-secondary">Muat ulang</button><button type="button" id="duplicate-save" class="button button-save" disabled>Simpan aturan</button></div><p id="duplicate-message" class="field-hint" role="status"></p></div>
                <section class="card form-stack"><h3>Acara baru</h3><p class="field-hint">Kosongkan semua data dan kembalikan pengaturan ke awal.</p><div><button type="button" class="button button-secondary button-danger" id="event-reset-open" disabled><?= $icon('delete') ?>Reset acara</button></div></section>
            </div>

            <div role="tabpanel" id="panel-history" aria-labelledby="tab-history" data-panel="history" tabindex="0" hidden>
                <div class="panel-heading"><div><p class="eyebrow">05 / RIWAYAT</p><h2>Setiap proses tercatat.</h2></div><?= $icon('history', 'heading-icon') ?></div>
                <?php require __DIR__ . '/partials/winners.php'; ?>
            </div>
        </section>
    </main>
    <?php require __DIR__ . '/partials/import-dialog.php'; ?>
    <?php require __DIR__ . '/partials/google-dialog.php'; ?>
    <?php require __DIR__ . '/partials/event-reset-dialog.php'; ?>
    <template id="record-actions-template"><div class="record-actions"><button type="button" class="button button-secondary button-icon" data-record-action="edit" aria-label="Edit" title="Edit"><?= $icon('edit') ?></button><button type="button" class="button button-secondary button-icon delete-action" data-record-action="delete" aria-label="Hapus" title="Hapus"><?= $icon('delete') ?></button></div></template>
    <template id="prize-order-template"><div class="prize-order"><button type="button" data-prize-order="up" aria-label="Naikkan hadiah"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 15 6-6 6 6"/></svg></button><button type="button" data-prize-order="down" aria-label="Turunkan hadiah"><svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></button></div></template>
    <dialog id="record-editor" class="record-dialog" aria-labelledby="editor-title">
        <form id="record-form" class="form-stack">
            <div class="dialog-heading"><h2 id="editor-title"></h2><button type="button" class="button button-quiet button-icon" data-close-dialog aria-label="Tutup"><?= $icon('delete') ?></button></div>
            <div id="editor-fields" class="form-stack"></div>
            <p id="editor-error" class="form-error" role="alert" hidden></p>
            <div class="dialog-actions"><button type="button" class="button button-secondary" data-close-dialog>Batal</button><button type="submit" class="button button-save" id="editor-save">Simpan</button></div>
        </form>
    </dialog>
    <dialog id="record-delete" class="record-dialog" aria-labelledby="delete-title">
        <form id="delete-form" class="form-stack">
            <div class="dialog-heading"><h2 id="delete-title">Hapus data?</h2><button type="button" class="button button-quiet button-icon" data-close-dialog aria-label="Tutup"><?= $icon('delete') ?></button></div>
            <p id="delete-description" class="subtle-text"></p>
            <p id="delete-error" class="form-error" role="alert" hidden></p>
            <div class="dialog-actions"><button type="button" class="button button-secondary" data-close-dialog>Batal</button><button type="submit" class="button button-secondary button-danger" id="delete-save"><?= $icon('delete') ?>Hapus</button></div>
        </form>
    </dialog>
    <dialog id="participant-bulk-dialog" class="record-dialog" aria-labelledby="bulk-title"><form id="participant-bulk-form" class="form-stack"><div class="dialog-heading"><h2 id="bulk-title">Edit peserta</h2><button type="button" id="participant-bulk-close" class="button button-quiet button-icon" aria-label="Tutup"><?= $icon('delete') ?></button></div><label for="bulk-field">Ubah</label><select id="bulk-field"></select><label for="bulk-value">Nilai baru</label><div id="bulk-value-host"></div><p id="bulk-error" class="form-error" role="alert" hidden></p><div class="dialog-actions"><button type="submit" class="button button-save" id="bulk-save">Simpan</button></div></form></dialog>
    <button type="button" class="button operator-return" id="return-to-operator"><?= $icon('screen') ?>Operator</button>
</body>
</html>
