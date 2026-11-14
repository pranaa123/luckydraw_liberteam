<?php

declare(strict_types=1);

namespace App\Core;

/** Kredensial sumber tidak menjadi bagian respons list, audit, atau asset publik. */
final class SecretVault
{
    private function key(): string
    {
        $configured = Environment::get('APP_ENCRYPTION_KEY');
        if ($configured !== '') {
            $key = base64_decode($configured, true);
            if ($key === false || strlen($key) !== 32) throw new ApiError('APP_ENCRYPTION_KEY harus berupa 32 byte dalam base64.', 503);
            return $key;
        }
        if (Environment::get('APP_ENV', 'local') !== 'local') throw new ApiError('Kunci enkripsi aplikasi belum dikonfigurasi.', 503);
        $directory = BASE_PATH . '/storage/keys';
        if (!is_dir($directory) && !mkdir($directory, 0700, true) && !is_dir($directory)) throw new ApiError('Kunci penyimpanan lokal belum dapat dibuat.', 503);
        $path = $directory . '/local.key';
        $handle = @fopen($path, 'x');
        if ($handle !== false) { chmod($path, 0600); fwrite($handle, random_bytes(32)); fclose($handle); }
        $key = file_get_contents($path);
        if ($key === false || strlen($key) !== 32) throw new ApiError('Kunci penyimpanan lokal tidak valid.', 503);
        return $key;
    }

    public function encrypt(string $value): string
    {
        $nonce = random_bytes(12); $tag = '';
        $encrypted = openssl_encrypt($value, 'aes-256-gcm', $this->key(), OPENSSL_RAW_DATA, $nonce, $tag, 'doorprize-google-v1');
        if ($encrypted === false) throw new ApiError('Kredensial belum dapat disimpan.', 503);
        return base64_encode($nonce . $tag . $encrypted);
    }

    public function decrypt(string $value): string
    {
        $bytes = base64_decode($value, true);
        if ($bytes === false || strlen($bytes) < 29) throw new ApiError('Kredensial sumber tidak valid. Hubungkan ulang.', 409);
        $plain = openssl_decrypt(substr($bytes, 28), 'aes-256-gcm', $this->key(), OPENSSL_RAW_DATA, substr($bytes, 0, 12), substr($bytes, 12, 16), 'doorprize-google-v1');
        if ($plain === false) throw new ApiError('Kredensial sumber tidak dapat dibuka. Periksa kunci aplikasi.', 503);
        return $plain;
    }
}
