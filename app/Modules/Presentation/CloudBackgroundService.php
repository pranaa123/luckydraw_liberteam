<?php

declare(strict_types=1);

namespace App\Modules\Presentation;

use App\Core\ApiError;
use App\Modules\Events\EventContext;

final class CloudBackgroundService
{
    private readonly BackgroundRepository $records;
    private readonly BackgroundStorage $storage;

    public function __construct(private readonly EventContext $event)
    {
        $this->records = new BackgroundRepository($event);
        $this->storage = new BackgroundStorage();
    }

    public function save(array $input): array
    {
        if (($input['action'] ?? '') === 'prepare') {
            $mime = $input['mime'] ?? '';
            $size = $input['size'] ?? 0;
            $extension = ['image/png'=>'png','image/jpeg'=>'jpg','image/webp'=>'webp'][$mime] ?? null;
            if (!$extension || !is_int($size) || $size < 1 || $size > BackgroundAsset::MAX_BYTES) throw new ApiError('Pilih gambar PNG, JPG, atau WebP, maksimal 20 MB.');
            $path = '/assets/backgrounds/' . bin2hex(random_bytes(16)) . '.' . $extension;
            $this->records->prepare($path, $size, $mime);
            return ['path'=>$path, 'upload_url'=>$this->storage->prepare($this->event->id, $path)];
        }
        if (($input['action'] ?? '') !== 'complete') throw new ApiError('Aksi tidak dikenal.');
        $path = BackgroundAsset::validate($input['path'] ?? null);
        if (!$path || !($record = $this->records->get($path))) throw new ApiError('Gambar tidak ditemukan.', 404);
        // GET dan validasi dilakukan di luar transaksi database; objek tidak dapat di-upsert.
        $bytes = $this->storage->bytes($this->event->id, $path);
        $image = BackgroundAsset::image($bytes);
        if (strlen($bytes) !== (int) $record['expected_size'] || $image['mime'] !== $record['expected_mime']) throw new ApiError('Gambar tidak sesuai dengan upload yang disiapkan.');
        $this->records->complete($path);
        return ['path'=>$path, ...$image];
    }
}
