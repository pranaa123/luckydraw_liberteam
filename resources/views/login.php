<?php
declare(strict_types=1);
use App\Core\View;
require __DIR__ . '/partials/icons.php';
?>
<!doctype html>
<html lang="id">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="color-scheme" content="light">
    <title><?= View::escape($appName) ?> — Masuk</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/assets/app.css">
    <script type="module" src="/assets/modules/login-controller.js"></script>
</head>
<body class="login-body">
    <main class="login-card">
        <div class="brand"><span class="brand-icon"><?= $icon('spark') ?></span><span><?= View::escape($appName) ?><small>RUANG OPERATOR</small></span></div>
        <h1>Masuk ke ruang operator.</h1>
        <form id="login-form">
            <label for="login-email">Email</label>
            <input id="login-email" name="email" type="email" autocomplete="username" required maxlength="254" autofocus>
            <label for="login-password">Password</label>
            <input id="login-password" name="password" type="password" autocomplete="current-password" required maxlength="72">
            <p class="field-hint">Sesi masuk diingat selama 30 hari.</p>
            <p id="login-feedback" class="feedback" role="alert" hidden></p>
            <button class="button button-primary" type="submit" id="login-submit">Masuk <?= $icon('arrow') ?></button>
        </form>
    </main>
</body>
</html>
