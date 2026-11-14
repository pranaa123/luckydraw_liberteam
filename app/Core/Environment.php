<?php

declare(strict_types=1);

namespace App\Core;

final class Environment
{
    private static array $values = [];

    public static function load(string $path): void
    {
        if (!is_file($path)) {
            return;
        }

        foreach (file($path, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
            $line = trim($line);
            if ($line === '' || str_starts_with($line, '#') || !str_contains($line, '=')) {
                continue;
            }

            [$key, $value] = explode('=', $line, 2);
            $value = trim($value);
            if (strlen($value) >= 2 && in_array($value[0], ['"', "'"], true) && $value[0] === substr($value, -1)) {
                $value = substr($value, 1, -1);
            }
            self::$values[trim($key)] = $value;
        }
    }

    public static function get(string $key, string $default = ''): string
    {
        $value = getenv($key);
        return $value !== false ? $value : (self::$values[$key] ?? $default);
    }
}
