<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Modules\Events\EventContext;

final class ParticipantBulkRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function count(string $where, array $parameters): int
    {
        return (int) $this->event->database->query("SELECT count(*)::int AS count FROM doorprize.participants p WHERE p.event_id = ? {$where}", [$this->event->id, ...$parameters])[0]['count'];
    }

    public function hasProtectedStatus(string $where, array $parameters): bool
    {
        return (bool) $this->event->database->query("SELECT p.id FROM doorprize.participants p WHERE p.event_id = ? {$where} AND p.status IN ('winner', 'duplicate') LIMIT 1", [$this->event->id, ...$parameters]);
    }

    public function update(array $changes, string $where, array $parameters): int
    {
        $sets = []; $values = []; $differences = [];
        foreach ($changes as $key => $value) {
            if (!in_array($key, [...ParticipantFilter::KEYS, 'status'], true)) throw new \LogicException('Kolom edit massal tidak valid.');
            $sets[] = "{$key} = ?"; $values[] = $value; $differences[] = "p.{$key} IS DISTINCT FROM ?::text";
        }
        $set = implode(', ', $sets); $different = implode(' OR ', $differences);
        return (int) $this->event->database->query("WITH changed AS (
          UPDATE doorprize.participants p SET {$set}, version = p.version + 1, updated_at = now()
          WHERE p.event_id = ? {$where} AND ({$different}) RETURNING 1
        ) SELECT count(*)::int AS count FROM changed", [...$values, $this->event->id, ...$parameters, ...$values])[0]['count'];
    }

    public static function selectedIds(array $items): array
    {
        return [' AND EXISTS (SELECT 1 FROM jsonb_to_recordset(?::jsonb) AS selected(id bigint, version bigint) WHERE selected.id = p.id AND selected.version = p.version)', [json_encode($items, JSON_THROW_ON_ERROR)]];
    }

    public static function selectedQuery(array $query, array $excluded): array
    {
        [$where, $parameters] = ParticipantQuery::sql($query);
        if ($excluded) { $where .= ' AND p.id NOT IN (SELECT value::bigint FROM jsonb_array_elements_text(?::jsonb))'; $parameters[] = json_encode($excluded, JSON_THROW_ON_ERROR); }
        return [$where, $parameters];
    }
}
