<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Core\ApiError;
use App\Core\Input;

final class ParticipantQuery
{
    private const STATUSES = ['available', 'duplicate', 'eliminated', 'winner'];
    public static function normalize(array $input, array $fields): array
    {
        $statuses = $input['statuses'] ?? [];
        if (!is_array($statuses) || !array_is_list($statuses)) throw new ApiError('Filter status tidak valid.');
        foreach ($statuses as $status) if (!in_array($status, self::STATUSES, true)) throw new ApiError('Filter status tidak valid.');
        $enabled = array_key_exists('status_filter', $input);
        if ($enabled) {
            $group = $input['status_filter'];
            if (!is_array($group) || !in_array($group['mode'] ?? '', ['include', 'exclude'], true) || !is_array($group['values'] ?? null) || !array_is_list($group['values'])) throw new ApiError('Filter status tidak valid.');
            foreach ($group['values'] as $status) if (!in_array($status, self::STATUSES, true)) throw new ApiError('Filter status tidak valid.');
            $statuses = $group['mode'] === 'include' ? $group['values'] : array_values(array_diff(self::STATUSES, $group['values']));
        }
        return ['filters' => ParticipantFilter::normalize($input['filters'] ?? [], $fields), 'statuses' => array_values(array_unique($statuses)), 'status_enabled' => $enabled, 'search' => Input::text($input, 'search', 200, false)];
    }

    public static function sql(array $query): array
    {
        [$where, $parameters] = ParticipantFilter::sql($query['filters']);
        if ($query['statuses']) { $where .= ' AND p.status IN (SELECT value FROM jsonb_array_elements_text(?::jsonb))'; $parameters[] = json_encode($query['statuses'], JSON_THROW_ON_ERROR); }
        elseif ($query['status_enabled'] ?? false) $where .= ' AND false';
        if ($query['search'] !== '') {
            $where .= " AND lower(p.name) LIKE lower(?) ESCAPE '!'";
            $parameters[] = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $query['search']) . '%';
        }
        return [$where, $parameters];
    }
}
