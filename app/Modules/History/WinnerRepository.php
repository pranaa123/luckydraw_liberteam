<?php

declare(strict_types=1);

namespace App\Modules\History;

use App\Modules\Events\EventContext;

final class WinnerRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function snapshot(): array
    {
        return $this->event->database->query("SELECT e.client_name, e.event_name, e.event_at,
          COALESCE(w.snapshot, 0) AS snapshot, COALESCE(w.total, 0) AS total, w.rounds
          FROM doorprize.events e CROSS JOIN LATERAL (
            SELECT max(id) AS snapshot, sum(requested_count)::bigint AS total, count(*)::integer AS rounds
            FROM doorprize.draws WHERE event_id = e.id AND status = 'confirmed'
          ) w WHERE e.id = ?", [$this->event->id])[0];
    }

    public function hasSnapshot(int $snapshot): bool
    {
        return $snapshot === 0 || (bool) $this->event->database->query("SELECT id FROM doorprize.draws WHERE event_id = ? AND id = ? AND status = 'confirmed'", [$this->event->id, $snapshot]);
    }

    public function page(int $snapshot, int $afterDraw, int $afterPosition, int $limit): array
    {
        return $this->event->database->query("SELECT entry.id, entry.draw_id, entry.position,
          entry.participant_snapshot, entry.prize_name_snapshot AS prize_name,
          d.sequence_number, d.field_definitions, d.resolved_at
          FROM doorprize.draw_entries entry
          JOIN doorprize.draws d ON d.id = entry.draw_id AND d.event_id = entry.event_id AND d.status = 'confirmed'
          WHERE entry.event_id = ? AND entry.draw_id <= ?
            AND (entry.draw_id, entry.position) > (?::bigint, ?::integer)
          ORDER BY entry.draw_id, entry.position LIMIT ?::integer",
          [$this->event->id, $snapshot, $afterDraw, $afterPosition, $limit + 1]);
    }
}
