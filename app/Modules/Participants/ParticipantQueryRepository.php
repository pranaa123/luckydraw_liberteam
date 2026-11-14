<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Modules\Events\EventContext;

final class ParticipantQueryRepository
{
    public function __construct(private readonly EventContext $event) {}
    public function metadata(): array
    {
        return $this->event->database->query('SELECT participants_version FROM doorprize.events WHERE id = ?', [$this->event->id])[0];
    }
    public function page(array $query, int $after): array
    {
        [$where, $values] = ParticipantQuery::sql($query);
        return $this->event->database->query("SELECT p.id, p.name, p.field_1, p.field_2, p.field_3, p.status, p.version FROM doorprize.participants p WHERE p.event_id = ? {$where} AND p.id > ? ORDER BY p.id LIMIT 51", [$this->event->id, ...$values, $after]);
    }
    public function summary(array $query): array
    {
        [$where, $values] = ParticipantQuery::sql($query);
        return $this->event->database->query("SELECT p.status, count(*)::int AS count FROM doorprize.participants p WHERE p.event_id = ? {$where} GROUP BY p.status", [$this->event->id, ...$values]);
    }
    public function options(string $key, array $query, string $scope, string $search, ?string $after): array
    {
        [$where, $values] = ParticipantQuery::sql($query);
        $column = "COALESCE(p.{$key}, '')";
        if ($scope === 'available') $where .= " AND p.status = 'available'";
        if ($search !== '') { $where .= " AND lower({$column}) LIKE lower(?) ESCAPE '!'"; $values[] = str_replace(['!', '%', '_'], ['!!', '!%', '!_'], $search) . '%'; }
        if ($after !== null) { $where .= " AND {$column} > ?"; $values[] = $after; }
        return $this->event->database->query("SELECT DISTINCT {$column} AS value FROM doorprize.participants p WHERE p.event_id = ? {$where} ORDER BY value LIMIT 51", [$this->event->id, ...$values]);
    }
}
