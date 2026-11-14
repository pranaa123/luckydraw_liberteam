<?php

declare(strict_types=1);

$config = require dirname(__DIR__) . '/bootstrap/app.php';

// Cloud hanya berjalan jika seluruh konfigurasi runtime persisten tersedia.
try { App\Core\CloudRuntime::validate($config); } catch (Throwable $error) {
    error_log($error->getMessage());
    http_response_code(503);
    header('Content-Type: text/plain; charset=utf-8');
    echo 'Aplikasi masih dalam tahap pengembangan lokal.';
    exit;
}

header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
$storageOrigin = App\Modules\Presentation\BackgroundStorage::cloud() ? ' ' . App\Modules\Presentation\BackgroundStorage::origin() : '';
header("Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:" . $storageOrigin . "; connect-src 'self'" . $storageOrigin . "; frame-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'");

try {
    $path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
    if (str_starts_with($path, '/assets/backgrounds/')) {
        if (!in_array($_SERVER['REQUEST_METHOD'] ?? 'GET', ['GET','HEAD'], true)) throw new App\Core\ApiError('Metode tidak diizinkan.', 405);
        $session = (new App\Modules\Auth\AuthService($config))->requireSession();
        $event = new App\Modules\Events\EventContext(new App\Core\Database($config['database'], $session->userId), $session->userId);
        (new App\Modules\Presentation\BackgroundAsset($event))->serve($path);
        exit;
    }
    (new App\Core\Router(require BASE_PATH . '/routes/web.php'))->dispatch(
        $_SERVER['REQUEST_METHOD'] ?? 'GET',
        $_SERVER['REQUEST_URI'] ?? '/',
    );
} catch (App\Core\ApiError $error) {
    http_response_code($error->status);
    header('Content-Type: text/plain; charset=utf-8');
    echo $error->getMessage();
} catch (Throwable $error) {
    error_log((string) $error);
    http_response_code(500);
    header('Content-Type: text/plain; charset=utf-8');
    echo $config['debug'] ? (string) $error : 'Aplikasi belum dapat memproses permintaan.';
}
