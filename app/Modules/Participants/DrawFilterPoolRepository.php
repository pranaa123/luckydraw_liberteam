<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Modules\Events\EventContext;

final class DrawFilterPoolRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function prepare(array $filters, array $previous): void
    {
        if (ParticipantFilter::effective($filters) === ParticipantFilter::effective($previous)) return;
        $this->event->database->query('DELETE FROM doorprize.draw_filter_pool WHERE event_id = ?', [$this->event->id]);
        if (ParticipantFilter::effective($filters)) {
            [$where, $parameters] = ParticipantFilter::sql($filters);
            $this->event->database->query("INSERT INTO doorprize.draw_filter_pool (event_id, participant_id, position)
              SELECT p.event_id, p.id, row_number() OVER (ORDER BY p.id) FROM doorprize.participants p
              WHERE p.event_id = ? AND p.status = 'available' {$where}", [$this->event->id, ...$parameters]);
        }
    }

    public static function table(array $filters): string
    {
        return ParticipantFilter::effective($filters) ? 'draw_filter_pool' : 'participant_pool';
    }
}
