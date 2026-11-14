<dialog id="excel-dialog" class="record-dialog excel-dialog" aria-labelledby="excel-title">
    <div class="dialog-heading"><h2 id="excel-title">Import Excel</h2><button type="button" id="excel-close" class="button button-quiet button-icon" aria-label="Tutup import"><?= $icon('delete') ?></button></div>
    <div class="excel-body form-stack">
        <div class="excel-filebar"><label>Pilih berkas .xlsx<input id="excel-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"></label><button type="button" class="button button-secondary" id="excel-template"><?= $icon('upload') ?>Unduh template</button></div>
        <p class="field-hint">Maksimal 20 MB · 100.000 baris. Template mengikuti isian undian Anda.</p>
        <fieldset id="excel-mapping-controls" class="form-stack" hidden>
            <div class="settings-grid"><label>Sheet<select id="excel-sheet"></select></label><label>Baris header<input id="excel-header" type="number" min="1" max="1048575" step="1"></label></div>
            <div><h3>Pemetaan kolom</h3><div id="excel-mapping" class="excel-mapping"></div></div>
            <div><h3>Kunci duplikasi</h3><div id="excel-keys" class="duplicate-keys"></div><p class="field-hint">Semua kunci harus terisi dan sama. Huruf besar/kecil diabaikan. Tanpa kunci, pemeriksaan nonaktif.</p></div>
        </fieldset>
        <p id="excel-status" class="field-hint" role="status"></p>
        <p id="excel-error" class="form-error" role="alert" hidden></p>
        <section id="excel-preview" hidden aria-label="Pratinjau import">
            <div id="excel-summary" class="excel-summary"></div>
            <p id="excel-impact" class="field-hint"></p>
            <div id="excel-preview-table" class="table-scroll"></div>
            <div class="list-pagination"><button type="button" id="excel-previous" class="button button-secondary">Sebelumnya</button><span id="excel-page" class="field-hint"></span><button type="button" id="excel-next" class="button button-secondary">Berikutnya</button></div>
        </section>
    </div>
    <div class="excel-footer"><button type="button" class="button button-secondary" id="excel-inspect" disabled>Pratinjau</button><button type="button" class="button button-save" id="excel-commit" hidden>Import peserta</button></div>
</dialog>
