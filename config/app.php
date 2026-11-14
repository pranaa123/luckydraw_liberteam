<?php

declare(strict_types=1);

use App\Core\Environment;

return [
    'name' => Environment::get('APP_NAME', 'Doorprize'),
    'environment' => Environment::get('APP_ENV', 'local'),
    'debug' => Environment::get('APP_DEBUG', 'false') === 'true',
    'timezone' => Environment::get('APP_TIMEZONE', 'Asia/Makassar'),
    'database' => [
        'dsn' => Environment::get('DB_DSN'),
        'user' => Environment::get('DB_USER'),
        'password' => Environment::get('DB_PASSWORD'),
    ],
];
