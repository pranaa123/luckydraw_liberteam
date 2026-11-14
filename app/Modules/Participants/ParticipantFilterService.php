<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Core\ApiError;
use App\Core\Input;
use App\Modules\Events\FieldRepository;
use App\Modules\Events\EventContext;

final class ParticipantFilterService
{
    public const ACTIONS = ['options', 'count'];
    public function __construct(private readonly EventContext $event) {}

    public function list(): array
    {
        $fields = (new FieldRepository($this->event))->all();
        return [...(new ParticipantQueryRepository($this->event))->metadata(), 'field_schema' => ParticipantFilter::schema($fields),
          'fields' => [['key' => 'name', 'label' => 'Nama'], ...array_map(static fn ($field) => ['key' => 'field_' . $field['slot'], 'label' => $field['label']], $fields)]];
    }

    public function save(string $action, array $input): array
    {
        $fields = (new FieldRepository($this->event))->all();
        $filters = ParticipantFilter::normalize($input['filters'] ?? [], $fields);
        $records = new ParticipantQueryRepository($this->event);
        if ($action === 'count') {
            $summary = $records->summary(['filters' => $filters, 'statuses' => ['available'], 'search' => '']);
            return [...$records->metadata(), 'count' => (int) ($summary[0]['count'] ?? 0)];
        }
        $key = $input['field'] ?? '';
        $allowed = ['name', ...array_map(static fn ($field) => 'field_' . $field['slot'], $fields)];
        if (!in_array($key, $allowed, true) || !in_array($input['scope'] ?? '', ['all', 'available'], true)) throw new ApiError('Daftar filter tidak valid.');
        $after = $input['after'] ?? null;
        if ($after !== null && (!is_string($after) || strlen($after) > 200)) throw new ApiError('Halaman nilai filter tidak valid.');
        $query = ParticipantQuery::normalize(['filters' => $input['filters'] ?? [], ...(array_key_exists('status_filter', $input) ? ['status_filter' => $input['status_filter']] : [])], $fields);
        $rows = $records->options($key, $query, $input['scope'], Input::text($input, 'search', 200, false), $after);
        return [...$records->metadata(), 'items' => array_column(array_slice($rows, 0, 50), 'value'), 'next' => count($rows) > 50 ? $rows[49]['value'] : null];
    }
}
