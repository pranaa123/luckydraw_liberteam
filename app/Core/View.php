<?php

declare(strict_types=1);

namespace App\Core;

final class View
{
    public static function render(string $template, array $data = []): void
    {
        extract($data, EXTR_SKIP);
        require BASE_PATH . '/resources/views/' . $template . '.php';
    }

    public static function escape(string|int|null $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
