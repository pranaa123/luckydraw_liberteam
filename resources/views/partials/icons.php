<?php

declare(strict_types=1);

$icon = static function (string $name, string $class = 'icon'): string {
    $paths = [
        'lock' => '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2"/>',
        'logout' => '<path d="M9 5H4v14h5m5-14 7 7-7 7m7-7H9"/>',
        'spark' => '<path d="m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6Z"/>',
        'play' => '<path d="m9 5 11 7-11 7Z"/>',
        'users' => '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/><circle cx="9" cy="7" r="4"/>',
        'gift' => '<path d="M3 8h18v4H3zM5 12v9h14v-9M12 8v13"/><path d="M12 8H7.5A2.5 2.5 0 1 1 10 5.5L12 8Zm0 0h4.5A2.5 2.5 0 1 0 14 5.5L12 8Z"/>',
        'settings' => '<path d="M4 7h9m4 0h3M4 17h3m4 0h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/>',
        'history' => '<path d="M3 11a9 9 0 1 1 2.7 7M3 4v7h7m2-4v5l3 2"/>',
        'screen' => '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8m-4-4v4m3-12 3-3m-4 0h4v4"/>',
        'check' => '<path d="m5 12 4 4L19 6"/>',
        'remove' => '<circle cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
        'clear' => '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
        'edit' => '<path d="m16 3 5 5-12 12-6 1 1-6Z"/><path d="m14 5 5 5"/>',
        'delete' => '<path d="m6 6 12 12M18 6 6 18"/>',
        'upload' => '<path d="M12 16V3m-5 5 5-5 5 5M3 16v5h18v-5"/>',
        'link' => '<path d="m10 13 4-4m-5 6-2 2a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 2 2-2a4 4 0 0 1 6 6l-4 4a4 4 0 0 1-6 0"/>',
        'plus' => '<path d="M12 5v14M5 12h14"/>',
        'expand' => '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
        'arrow' => '<path d="M5 12h14m-5-5 5 5-5 5"/>',
        'filter' => '<path d="M4 5h16l-6 7v6l-4 2v-8Z"/>',
    ];

    return '<svg class="' . App\Core\View::escape($class) . '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' . ($paths[$name] ?? $paths['spark']) . '</svg>';
};
