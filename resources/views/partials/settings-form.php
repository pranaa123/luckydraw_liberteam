<form id="settings-form" class="settings-form">
    <div class="settings-savebar"><span id="settings-state" class="field-hint" role="status">Memuat pengaturan…</span><div class="flex gap-2"><button type="button" class="button button-secondary" id="settings-reload">Muat ulang</button><button type="submit" class="button button-save" id="settings-save" disabled>Simpan</button></div></div>
    <p id="settings-error" class="form-error mb-3" role="alert" hidden></p>
    <fieldset id="settings-controls" disabled>
        <section class="card form-stack">
            <div class="card-heading"><h3>Informasi acara</h3><label class="switch"><input type="checkbox" name="show_event_info" aria-label="Tampilkan informasi acara"><span></span></label></div>
            <div class="settings-grid settings-event-names">
                <label>Nama client<input type="text" name="client_name" maxlength="200" placeholder="Opsional"></label>
                <label>Nama acara<input type="text" name="event_name" maxlength="200" placeholder="Opsional"></label>
            </div>
            <label>Waktu acara<input type="datetime-local" name="event_at"></label>
        </section>
        <section class="card form-stack" id="canvas-settings" data-canvas-defaults="<?= \App\Core\View::escape(json_encode(\App\Modules\Events\CanvasGeometry::DEFAULTS, JSON_THROW_ON_ERROR)) ?>">
            <div class="card-heading"><h3>Canvas dan area nama</h3><button type="button" id="canvas-default" class="button button-secondary">Default</button></div>
            <div class="settings-grid"><label>Lebar canvas (px)<input type="number" name="canvas_width" min="1" max="32768" step="1" required></label><label>Tinggi canvas (px)<input type="number" name="canvas_height" min="1" max="32768" step="1" required></label></div>
            <div class="settings-grid"><label>Lebar area nama (px)<input type="number" name="area_width" min="1" max="1920" step="1" required><span id="area_width-limit" class="field-hint"></span></label><label>Tinggi area nama (px)<input type="number" name="area_height" min="1" max="1080" step="1" required><span id="area_height-limit" class="field-hint"></span></label></div>
            <div class="settings-grid">
                <div class="canvas-axis"><div class="canvas-axis-heading"><label for="canvas-area-x">Horizontal</label><output id="area_x-value" for="canvas-area-x">0 px</output></div><div class="canvas-slider"><input type="range" id="canvas-area-x" name="area_offset_x" min="-192" max="192" value="0" step="0.5"></div><span id="area_x-limit" class="field-hint"></span></div>
                <div class="canvas-axis"><div class="canvas-axis-heading"><label for="canvas-area-y">Vertikal</label><output id="area_y-value" for="canvas-area-y">0 px</output></div><div class="canvas-slider"><input type="range" id="canvas-area-y" name="area_offset_y" min="-216" max="216" value="0" step="0.5"></div><span id="area_y-limit" class="field-hint"></span></div>
            </div>
            <label class="check-row"><input type="checkbox" id="inspect-name-area">Batas area pada preview</label>
        </section>
        <section class="card form-stack">
            <h3>Background</h3>
            <div class="settings-grid"><label>Jenis background<select name="background_type"><option value="color">Warna</option><option value="image">Gambar</option></select></label><label>Warna dasar<input type="color" name="background_color"></label></div>
            <div id="image-background-settings" class="form-stack" hidden>
                <label>Penempatan gambar<select name="background_fit"><option value="cover">Memenuhi canvas</option><option value="contain">Tampil utuh</option></select></label>
                <label>Background utama<input type="file" id="main-background-file" accept="image/png,image/jpeg,image/webp"></label>
                <div id="main-background-preview" class="background-row" hidden><img id="main-background-image" alt="Background utama" width="80" height="50"><span class="field-hint">Background utama</span><button type="button" class="button button-secondary button-icon delete-action" id="remove-main-background" aria-label="Lepaskan background utama"><?= $icon('delete') ?></button></div>
                <p class="field-hint">PNG, JPG, WebP · maksimal 20 MB. Gambar disimpan dengan resolusi aslinya.</p>
                <div class="background-assignments form-stack"><h3>Background per hadiah</h3><label>Hadiah<select id="background-prize" aria-label="Hadiah penentu background"></select></label><label>Gambar hadiah<input type="file" id="prize-background-file" accept="image/png,image/jpeg,image/webp"></label><div id="prize-background-list" class="record-list"></div></div>
            </div>
        </section>
        <section class="card form-stack">
            <h3>Font output</h3>
            <label>Warna font<input type="color" name="font_color"></label>
            <div class="settings-grid"><label>Gaya font<select name="font_style"><option value="sans-serif">Sans-serif</option><option value="serif">Serif</option><option value="slab-serif">Slab serif</option><option value="script">Script</option></select></label><label>Penulisan<select name="text_case"><option value="uppercase">Uppercase</option><option value="lowercase">Lowercase</option><option value="sentence">Sentence style</option></select></label></div>
        </section>
    </fieldset>
</form>
