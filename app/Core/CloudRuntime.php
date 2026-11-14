<?php

declare(strict_types=1);

namespace App\Core;

use App\Modules\Presentation\BackgroundStorage;

final class CloudRuntime
{
    public static function validate(array $config): void
    {
        if ($config['environment'] === 'local') return;
        if (!in_array($config['environment'], ['preview','production'], true)) throw new \RuntimeException('Lingkungan aplikasi tidak dikenal.');
        $url = Environment::get('APP_URL');
        if (!preg_match('~^https://[a-z0-9.-]+$~D', $url)
            || !str_starts_with($config['database']['dsn'], 'pgsql:')
            || !str_contains($config['database']['dsn'], 'sslmode=require')
            || $config['database']['user'] === '' || $config['database']['password'] === ''
            || strlen(base64_decode(Environment::get('APP_ENCRYPTION_KEY'), true) ?: '') !== 32
            || !BackgroundStorage::cloud() || Environment::get('SUPABASE_SECRET_KEY') === '') {
            throw new \RuntimeException('Konfigurasi cloud belum lengkap.');
        }
        BackgroundStorage::origin();
    }
}
