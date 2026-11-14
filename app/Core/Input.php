<?php

declare(strict_types=1);

namespace App\Core;

final class Input
{
    public static function text(array $input, string $key, int $limit = 200, bool $required = true): string
    {
        if (isset($input[$key]) && !is_string($input[$key])) throw new ApiError('Isian teks tidak valid.');
        $value = trim($input[$key] ?? '');
        if (($required && $value === '') || strlen($value) > $limit) throw new ApiError('Lengkapi isian teks, maksimal ' . $limit . ' karakter.');
        return $value;
    }

    public static function integer(array $input, string $key, int $minimum = 1, int $maximum = 2147483647): int
    {
        $value = $input[$key] ?? null;
        if (!is_int($value) || $value < $minimum || $value > $maximum) throw new ApiError('Isian angka tidak valid.');
        return $value;
    }
}
