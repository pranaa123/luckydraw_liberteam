<?php

declare(strict_types=1);

use App\Core\Environment;

define('BASE_PATH', dirname(__DIR__));

spl_autoload_register(static function (string $class): void {
    if (!str_starts_with($class, 'App\\')) {
        return;
    }

    $file = BASE_PATH . '/app/' . str_replace('\\', '/', substr($class, 4)) . '.php';
    if (is_file($file)) {
        require $file;
    }
});

Environment::load(BASE_PATH . '/.env');
$config = require BASE_PATH . '/config/app.php';
date_default_timezone_set($config['timezone']);

return $config;
