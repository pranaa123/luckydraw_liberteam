<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Core\ApiError;

/** Nilai OR dalam satu isian; isian yang berbeda digabung AND. */
final class ParticipantFilter
{
    public const KEYS = ['name', 'field_1', 'field_2', 'field_3'];

    public static function normalize(mixed $input, array $fields): array
    {
        if (!is_array($input) || ($input && array_is_list($input))) throw new ApiError('Filter peserta tidak valid.');
        $allowed = ['name', ...array_map(static fn ($field) => 'field_' . $field['slot'], $fields)];
        $result = [];
        foreach ($input as $key => $group) {
            if (!in_array($key, $allowed, true) || !is_array($group) || !in_array($group['mode'] ?? '', ['include', 'exclude'], true)
                || !is_array($group['values'] ?? null) || !array_is_list($group['values'])) throw new ApiError('Isian filter sudah berubah atau tidak valid. Muat ulang filter.');
            foreach ($group['values'] as $value) if (!is_string($value) || strlen($value) > 200) throw new ApiError('Nilai filter tidak valid.');
            $values = array_values(array_unique($group['values'], SORT_STRING)); sort($values, SORT_STRING);
            $result[$key] = ['mode' => $group['mode'], 'values' => $values];
        }
        ksort($result);
        return $result;
    }

    public static function effective(array $filters): array
    {
        return array_filter($filters, static fn ($group) => $group['mode'] !== 'exclude' || $group['values']);
    }

    public static function json(array $filters): string { return json_encode((object) $filters, JSON_THROW_ON_ERROR); }

    /** Kolom hanya berasal dari allowlist, nilai selalu berparameter. */
    public static function sql(array $filters, string $alias = 'p'): array
    {
        $clauses = []; $parameters = [];
        foreach (self::effective($filters) as $key => $group) {
            if (!in_array($key, self::KEYS, true)) throw new \LogicException('Kolom filter tidak valid.');
            $operator = $group['mode'] === 'include' ? 'IN' : 'NOT IN';
            $clauses[] = "COALESCE({$alias}.{$key}, '') {$operator} (SELECT value FROM jsonb_array_elements_text(?::jsonb))";
            $parameters[] = json_encode($group['values'], JSON_THROW_ON_ERROR);
        }
        return [$clauses ? ' AND ' . implode(' AND ', $clauses) : '', $parameters];
    }

    public static function schema(array $fields): string
    {
        return implode(',', array_map(static fn ($field) => $field['id'] . ':' . $field['slot'] . ':' . $field['version'], $fields));
    }
}
