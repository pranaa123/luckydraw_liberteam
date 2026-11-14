<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Modules\Events\EventContext;

final class ParticipantRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function page(int $after): array
    {
        return $this->event->database->query('SELECT id, name, field_1, field_2, field_3, status, version FROM doorprize.participants WHERE event_id = ? AND id > ? ORDER BY id LIMIT 51', [$this->event->id, $after]);
    }

    public function summary(): array
    {
        return $this->event->database->query('SELECT status, count(*)::int AS count FROM doorprize.participants WHERE event_id = ? GROUP BY status', [$this->event->id]);
    }

    public function find(int $id): array
    {
        return $this->event->database->query('SELECT id, name, field_1, field_2, field_3, status, version, duplicate_key FROM doorprize.participants WHERE event_id = ? AND id = ? FOR UPDATE', [$this->event->id, $id]);
    }

    public function save(?int $id, array $values): array
    {
        if ($id === null) {
            return $this->event->database->query('INSERT INTO doorprize.participants (event_id, name, field_1, field_2, field_3, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id, name, field_1, field_2, field_3, status, version, duplicate_key', [$this->event->id, ...$values])[0];
        }
        return $this->event->database->query('UPDATE doorprize.participants SET name = ?, field_1 = ?, field_2 = ?, field_3 = ?, status = ?, version = version + 1, updated_at = now() WHERE event_id = ? AND id = ? RETURNING id, name, field_1, field_2, field_3, status, version, duplicate_key', [...$values, $this->event->id, $id])[0];
    }

    public function referenced(int $id): bool
    {
        return (bool) $this->event->database->query('SELECT id FROM doorprize.draw_entries WHERE event_id = ? AND participant_id = ? LIMIT 1', [$this->event->id, $id]);
    }

    public function delete(int $id): void
    {
        $this->event->database->query('DELETE FROM doorprize.participants WHERE event_id = ? AND id = ?', [$this->event->id, $id]);
    }
}
