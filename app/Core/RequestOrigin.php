<?php

declare(strict_types=1);

namespace App\Core;

/** Origin cloud berasal dari konfigurasi server, bukan header proxy kiriman klien. */
final class RequestOrigin
{
    public static function assertSameOrigin(): void
    {
        $host = $_SERVER['HTTP_HOST'] ?? '';
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
        if (Environment::get('APP_ENV', 'local') === 'local') {
            $scheme = !empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http';
            $allowed = [$scheme . '://' . $host];
        } else {
            $allowed = [rtrim(Environment::get('APP_URL'), '/')];
            $deployment = Environment::get('VERCEL_URL');
            if (preg_match('/^[a-z0-9.-]+\.vercel\.app$/D', $deployment)) $allowed[] = 'https://' . $deployment;
        }
        if ($host === '' || !in_array($origin, $allowed, true) || parse_url($origin, PHP_URL_HOST) . (parse_url($origin, PHP_URL_PORT) ? ':' . parse_url($origin, PHP_URL_PORT) : '') !== $host) {
            throw new ApiError('Asal permintaan tidak diizinkan.', 403);
        }
    }
}
