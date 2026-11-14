<?php

declare(strict_types=1);

namespace App\Modules\History;

use App\Modules\Events\EventContext;

final class HistoryRepository
{
    public function __construct(private readonly EventContext $event) {}
    public function page(int $before): array
    {
        return $this->event->database->query("SELECT a.id, a.created_at, a.action, a.entity_type,
          CASE WHEN a.entity_type = 'participant_batch' THEN COALESCE(a.changes->>'updated_count', '0') || ' peserta'
          ELSE COALESCE(a.changes->>'name', a.changes->>'label', a.changes->>'event_name', '') END AS name,
          d.sequence_number, d.requested_count
          FROM doorprize.audit_log a LEFT JOIN doorprize.draws d ON a.entity_type = 'draw' AND d.id = a.entity_id AND d.event_id = a.event_id
          WHERE a.event_id = ? AND a.id < ?::bigint ORDER BY a.id DESC LIMIT 51", [$this->event->id, (string) $before]);
    }
}
