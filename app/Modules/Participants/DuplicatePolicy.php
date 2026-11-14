<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Core\ApiError;

final class DuplicatePolicy
{
    public static function keys(mixed $input, array $fields): array
    {
        if (!is_array($input) || !array_is_list($input)) throw new ApiError('Kunci duplikasi tidak valid.');
        $allowed = ['name', ...array_map(static fn ($field) => 'field_' . $field['slot'], $fields)];
        foreach ($input as $key) if (!in_array($key, $allowed, true)) throw new ApiError('Isian kunci duplikasi sudah berubah. Muat ulang pengaturan.', 409);
        return array_values(array_intersect($allowed, $input));
    }

    public static function decode(mixed $value): array
    {
        return is_array($value) ? $value : json_decode($value, true, 512, JSON_THROW_ON_ERROR);
    }
}
