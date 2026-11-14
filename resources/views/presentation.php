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
    <?php require __DIR__ . '/partials/auth-meta.php'; ?>
    <title><?= View::escape($appName) ?> — Output</title>
    <link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
    <link rel="stylesheet" href="/assets/app.css">
    <script type="module" src="/assets/presentation.js"></script>
</head>
<body class="presentation-body<?= $isPreview ? ' is-preview' : '' ?>">
    <main class="presentation-canvas" aria-label="Output presentasi">
        <svg id="visual-stage" class="visual-stage" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1920 1080" preserveAspectRatio="xMidYMid meet" role="img" aria-labelledby="stage-title">
            <title id="stage-title">Bersiap untuk mengundi</title>
            <rect id="stage-background" width="1920" height="1080" fill="#ffffff"/>
            <image id="stage-image" width="1920" height="1080" preserveAspectRatio="xMidYMid slice" visibility="hidden"/>
            <g id="stage-information" visibility="hidden"><text id="stage-event-name"/><text id="stage-event-details"/></g>
            <text id="stage-brand" x="960" y="145" text-anchor="middle" font-size="24" fill="#172b4d">Doorprize</text>
            <text id="standby-text" x="960" y="540" dominant-baseline="central" text-anchor="middle" font-size="76" font-weight="700" fill="#172b4d"><tspan id="standby-line-one">Bersiap untuk </tspan><tspan id="standby-line-two">mengundi</tspan></text>
            <foreignObject id="shuffle-area" x="192" y="216" width="1536" height="648" visibility="hidden" aria-hidden="true"><div xmlns="http://www.w3.org/1999/xhtml" id="shuffle-line" class="shuffle-line"></div></foreignObject>
            <defs><clipPath id="result-clip"><rect id="result-clip-area" x="192" y="216" width="1536" height="648"/></clipPath></defs>
            <g id="draw-results" clip-path="url(#result-clip)"></g>
            <rect id="name-area-guide" x="192" y="216" width="1536" height="648" fill="none" stroke="#2563eb" stroke-width="3" stroke-dasharray="12 10" visibility="hidden"/>
        </svg>
    </main>
    <?php if (!$isPreview): ?>
        <button type="button" class="button fullscreen-button" id="fullscreen"><?= $icon('expand') ?><span>Fullscreen</span></button>
        <p id="fullscreen-message" role="status" class="fullscreen-message" hidden></p>
    <?php endif; ?>
</body>
</html>
