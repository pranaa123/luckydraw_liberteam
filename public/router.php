<?php

declare(strict_types=1);

// Hanya aset publik yang boleh diteruskan ke server bawaan PHP.
$path = rawurldecode(parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/');
$file = realpath(__DIR__ . $path);
$assetRoot = realpath(__DIR__ . '/assets');
if (!str_starts_with($path, '/assets/backgrounds/') && $file !== false && $assetRoot !== false && str_starts_with($file, $assetRoot . DIRECTORY_SEPARATOR) && is_file($file)) {
    return false;
}

require __DIR__ . '/index.php';
