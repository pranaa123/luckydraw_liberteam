<dialog id="event-reset-dialog" class="record-dialog" aria-labelledby="event-reset-title">
    <form id="event-reset-form" class="form-stack">
        <div class="dialog-heading"><h2 id="event-reset-title">Mulai acara dari nol?</h2><button type="button" class="button button-quiet button-icon" data-reset-close aria-label="Tutup"><?= $icon('delete') ?></button></div>
        <p id="event-reset-summary" class="subtle-text" role="status"></p>
        <p class="subtle-text">Peserta, hadiah, pemenang, riwayat, isian tambahan, dan seluruh pengaturan acara akan dihapus. Koneksi Google Sheets diputus.</p>
        <p class="field-hint">Akun login tetap tersimpan. Tindakan ini tidak dapat dibatalkan.</p>
        <label for="event-reset-confirmation">Ketik RESET untuk melanjutkan<input id="event-reset-confirmation" type="text" autocomplete="off" spellcheck="false" maxlength="5" required></label>
        <p id="event-reset-error" class="form-error" role="alert" hidden></p>
        <div class="dialog-actions"><button type="button" class="button button-secondary" data-reset-close>Batal</button><button type="submit" class="button button-secondary button-danger" id="event-reset-submit" disabled>Reset acara</button></div>
    </form>
</dialog>
