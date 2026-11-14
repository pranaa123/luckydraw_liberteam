<?php

declare(strict_types=1);

$config = require dirname(__DIR__) . '/bootstrap/app.php';
if ($config['environment'] !== 'local') throw new RuntimeException('Persiapan database hanya untuk pengembangan lokal.');
$database = (new App\Core\Database($config['database']))->connection();
$installed = $database->query("SELECT 1 FROM pg_namespace WHERE nspname = 'doorprize'")->fetchColumn();
if (!$installed) $database->exec(file_get_contents(BASE_PATH . '/database/schema.sql'));
foreach (['database/migrations', 'supabase/migrations'] as $directory) {
    $files = glob(BASE_PATH . '/' . $directory . '/*.sql'); sort($files);
    foreach ($files as $file) $database->exec(file_get_contents($file));
}
echo "Skema database lokal siap.\n";
