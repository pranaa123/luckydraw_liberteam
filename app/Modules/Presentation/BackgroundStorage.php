<?php

declare(strict_types=1);

namespace App\Modules\Presentation;

use App\Core\ApiError;
use App\Core\Environment;

/** Hanya server memegang secret key; browser menerima URL untuk satu objek. */
final class BackgroundStorage
{
    public static function cloud(): bool
    {
        return Environment::get('BACKGROUND_DRIVER', 'local') === 'supabase';
    }

    public static function origin(): string
    {
        $url = rtrim(Environment::get('SUPABASE_URL'), '/');
        if (!preg_match('~^https://[a-z0-9]+\.supabase\.co$~D', $url)) throw new \RuntimeException('Konfigurasi Storage belum lengkap.');
        return $url;
    }

    private function object(int $eventId, string $path): string
    {
        return rawurlencode(Environment::get('SUPABASE_BACKGROUND_BUCKET', 'doorprize-backgrounds')) . '/' . $eventId . '/' . basename($path);
    }

    public function prepare(int $eventId, string $path): string
    {
        $result = $this->request('POST', '/object/upload/sign/' . $this->object($eventId, $path), []);
        return $this->signed($result['url'] ?? '', '/object/upload/sign/');
    }

    public function downloadUrl(int $eventId, string $path): string
    {
        $result = $this->request('POST', '/object/sign/' . $this->object($eventId, $path), ['expiresIn'=>120]);
        return $this->signed($result['signedURL'] ?? '', '/object/sign/');
    }

    public function bytes(int $eventId, string $path): string
    {
        return $this->request('GET', '/object/authenticated/' . $this->object($eventId, $path), null, true);
    }

    public function remove(array $batch): void
    {
        $paths = [];
        foreach ($batch as $asset) {
            if ((int) ($asset['event_id'] ?? 0)<1 || !is_string($asset['path'] ?? null)
                || !preg_match('~^/assets/backgrounds/[a-f0-9]{32}\.(png|jpg|webp)$~D',$asset['path'])) throw new \RuntimeException('Antrean gambar tidak valid.');
            if (self::cloud()) $paths[] = (int) $asset['event_id'] . '/' . basename($asset['path']);
            else {
                $file = BASE_PATH . '/public' . $asset['path'];
                if (is_file($file) && !unlink($file)) throw new \RuntimeException('Gambar lama belum dapat dihapus.');
            }
        }
        if ($paths) $this->request('DELETE','/object/' . rawurlencode(Environment::get('SUPABASE_BACKGROUND_BUCKET','doorprize-backgrounds')),['prefixes'=>$paths]);
    }

    private function signed(string $path, string $prefix): string
    {
        if (!str_starts_with($path, $prefix) || !str_contains($path, '?token=') || preg_match('/[\r\n]/', $path)) throw new \RuntimeException('Respons Storage tidak valid.');
        return self::origin() . '/storage/v1' . $path;
    }

    private function request(string $method, string $path, ?array $input = null, bool $binary = false): array|string
    {
        $key = Environment::get('SUPABASE_SECRET_KEY');
        if ($key === '') throw new \RuntimeException('Kunci Storage belum tersedia.');
        $handle = curl_init(self::origin() . '/storage/v1' . $path);
        $bytes = '';
        $limit = $binary ? BackgroundAsset::MAX_BYTES : 65536;
        $headers = ['apikey: ' . $key, 'Content-Type: application/json'];
        // Secret key modern memakai apikey; JWT service_role lama juga perlu Bearer.
        if (!str_starts_with($key, 'sb_secret_')) $headers[] = 'Authorization: Bearer ' . $key;
        curl_setopt_array($handle, [
            CURLOPT_CUSTOMREQUEST=>$method, CURLOPT_HTTPHEADER=>$headers,
            CURLOPT_CONNECTTIMEOUT=>5, CURLOPT_TIMEOUT=>30, CURLOPT_FOLLOWLOCATION=>false,
            CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,
            CURLOPT_WRITEFUNCTION=>static function ($handle, string $chunk) use (&$bytes, $limit): int {
                if (strlen($bytes) + strlen($chunk) > $limit) return 0;
                $bytes .= $chunk;
                return strlen($chunk);
            },
        ]);
        if ($input !== null) curl_setopt($handle, CURLOPT_POSTFIELDS, json_encode($input ?: (object) [], JSON_THROW_ON_ERROR));
        $ok = curl_exec($handle);
        $status = curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);
        if ($ok === false || $status < 200 || $status >= 300) throw new ApiError('Penyimpanan gambar belum dapat diakses. Coba kembali.', 503);
        return $binary ? $bytes : json_decode($bytes, true, 32, JSON_THROW_ON_ERROR);
    }
}
