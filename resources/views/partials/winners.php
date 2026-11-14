<div class="history-switch" role="tablist" aria-label="Riwayat acara">
    <button type="button" role="tab" id="history-show-winners" aria-controls="history-winners" aria-selected="true" tabindex="0" data-history-view="winners">Pemenang</button>
    <button type="button" role="tab" id="history-show-activity" aria-controls="history-activity" aria-selected="false" tabindex="-1" data-history-view="activity">Aktivitas</button>
</div>
<section id="history-winners" role="tabpanel" aria-labelledby="history-show-winners">
    <div class="winner-toolbar">
        <p id="winner-summary" class="subtle-text" role="status">Belum dimuat</p>
        <div class="winner-actions">
            <button type="button" class="button button-secondary" id="winners-reload">Muat ulang</button>
            <button type="button" class="button button-save" id="winners-export" disabled><?= $icon('upload') ?><span>Export PDF</span></button>
            <button type="button" class="button button-secondary button-icon" id="winners-export-cancel" aria-label="Batalkan export PDF" title="Batalkan export PDF" hidden><?= $icon('delete') ?></button>
        </div>
    </div>
    <p id="winners-feedback" class="field-hint" role="status" hidden></p>
    <div class="table-scroll"><table class="winner-table"><thead><tr><th scope="col">Nama</th><th scope="col">Isian tambahan</th><th scope="col">Hadiah</th><th scope="col">Undian ke</th></tr></thead><tbody id="winner-list"></tbody></table></div>
    <div class="list-pagination"><button type="button" class="button button-secondary" id="winners-previous" disabled>Sebelumnya</button><span id="winners-page" class="field-hint"></span><button type="button" class="button button-secondary" id="winners-next" disabled>Berikutnya</button></div>
</section>
<section id="history-activity" role="tabpanel" aria-labelledby="history-show-activity" hidden>
    <div id="history-list" class="history-list card"></div>
    <div class="list-pagination"><button type="button" class="button button-secondary" id="history-previous" disabled>Sebelumnya</button><span id="history-page" class="field-hint"></span><button type="button" class="button button-secondary" id="history-next" disabled>Berikutnya</button></div>
</section>
