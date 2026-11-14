<?php

declare(strict_types=1);

namespace App\Modules\Presentation;

use App\Core\ApiError;

final class BackgroundAsset
{
    public const MAX_BYTES = 20 * 1024 * 1024;

    public function __construct(private readonly \App\Modules\Events\EventContext $event) {}

    public function owned(mixed $path): ?string
    {
        $path = self::validate($path);
        if ($path !== null && !$this->event->database->query('SELECT path FROM doorprize.background_assets WHERE event_id=? AND path=?', [$this->event->id,$path])) {
            throw new ApiError('Gambar background tidak ditemukan. Upload kembali gambar tersebut.');
        }
        return $path;
    }

    public function serve(string $path): void
    {
        if (!$this->owned($path)) throw new ApiError('Gambar tidak ditemukan.', 404);
        $bytes = file_get_contents(BASE_PATH . '/public' . $path);
        header('Content-Type: ' . ['png'=>'image/png','jpg'=>'image/jpeg','webp'=>'image/webp'][pathinfo($path, PATHINFO_EXTENSION)]);
        header('Content-Length: ' . strlen($bytes));
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'HEAD') echo $bytes;
    }

    public static function validate(mixed $path): ?string
    {
        if ($path === null || $path === '') return null;
        if (!is_string($path) || !preg_match('~^/assets/backgrounds/[a-f0-9]{32}\.(png|jpg|webp)$~D', $path)
            || !is_file(BASE_PATH . '/public' . $path)) {
            throw new ApiError('Gambar background tidak ditemukan. Upload kembali gambar tersebut.');
        }
        return $path;
    }

    public function upload(array $files): array
    {
        $file = $files['background'] ?? null;
        if (!is_array($file) || ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
            || !is_string($file['tmp_name'] ?? null) || !is_uploaded_file($file['tmp_name'])) {
            throw new ApiError('Pilih gambar PNG, JPG, atau WebP, maksimal 20 MB.');
        }
        $bytes = file_get_contents($file['tmp_name'], false, null, 0, self::MAX_BYTES + 1);
        if ($bytes === false || strlen($bytes) > self::MAX_BYTES) throw new ApiError('Ukuran gambar maksimal 20 MB.', 413);
        $image = @getimagesizefromstring($bytes);
        $extensions = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp'];
        if (!$image || !isset($extensions[$image['mime'] ?? '']) || $image[0] > 32768 || $image[1] > 32768) {
            throw new ApiError('Gunakan gambar PNG, JPG, atau WebP dengan ukuran maksimal 32768 pixel per sisi.');
        }
        $directory = BASE_PATH . '/public/assets/backgrounds';
        if (!is_dir($directory) && !mkdir($directory, 0755, true) && !is_dir($directory)) throw new \RuntimeException('Direktori gambar belum dapat dibuat.');
        $path = '/assets/backgrounds/' . bin2hex(random_bytes(16)) . '.' . $extensions[$image['mime']];
        if (file_put_contents(BASE_PATH . '/public' . $path, $bytes, LOCK_EX) !== strlen($bytes)) {
            @unlink(BASE_PATH . '/public' . $path);
            throw new \RuntimeException('Gambar belum dapat disimpan.');
        }
        try {
            $this->event->database->query('INSERT INTO doorprize.background_assets(path,event_id) VALUES (?,?)', [$path,$this->event->id]);
        } catch (\Throwable $error) {
            @unlink(BASE_PATH . '/public' . $path);
            throw $error;
        }
        return ['path' => $path, 'width' => $image[0], 'height' => $image[1], 'mime' => $image['mime']];
    }
}
