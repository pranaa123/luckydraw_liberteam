<?php

declare(strict_types=1);

namespace App\Modules\Events;

use App\Modules\Participants\DrawFilterPoolRepository;
use App\Modules\Participants\ParticipantFilter;

final class FieldRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function all(): array
    {
        return $this->event->database->query('SELECT id, slot, label, use_for_duplicates, version FROM doorprize.event_fields WHERE event_id = ? ORDER BY slot', [$this->event->id]);
    }

    public function find(int $id): array
    {
        return $this->event->database->query('SELECT id, slot, label, use_for_duplicates, version FROM doorprize.event_fields WHERE event_id = ? AND id = ? FOR UPDATE', [$this->event->id, $id]);
    }

    public function save(?int $id, string $label, int $slot): array
    {
        if ($id === null) {
            return $this->event->database->query('INSERT INTO doorprize.event_fields (event_id, slot, label) VALUES (?, ?, ?) RETURNING id, slot, label, use_for_duplicates, version', [$this->event->id, $slot, $label])[0];
        }
        return $this->event->database->query('UPDATE doorprize.event_fields SET label = ?, version = version + 1 WHERE event_id = ? AND id = ? RETURNING id, slot, label, use_for_duplicates, version', [$label, $this->event->id, $id])[0];
    }

    public function delete(int $id, int $slot): void
    {
        // Slot comes exclusively from the locked database record, never from user input.
        if (!in_array($slot, FieldSchema::SLOTS, true)) throw new \LogicException('Slot isian tidak valid.');
        $this->event->database->query("UPDATE doorprize.participants SET field_{$slot} = NULL, version = version + 1, updated_at = now() WHERE event_id = ? AND field_{$slot} IS NOT NULL", [$this->event->id]);
        $this->event->database->query('DELETE FROM doorprize.event_fields WHERE event_id = ? AND id = ?', [$this->event->id, $id]);
        $duplicates = new \App\Modules\Participants\DuplicateRepository($this->event);
        if (\App\Modules\Participants\DuplicatePolicy::decode($duplicates->policy()['duplicate_keys'])) $duplicates->reconcile();
        $saved = $this->event->database->query('SELECT draw_filters FROM doorprize.events WHERE id = ?', [$this->event->id])[0]['draw_filters'];
        $previous = is_array($saved) ? $saved : json_decode($saved, true, 512, JSON_THROW_ON_ERROR);
        $filters = $previous; unset($filters['field_' . $slot]);
        if ($filters !== $previous) {
            (new DrawFilterPoolRepository($this->event))->prepare($filters, $previous);
            $this->event->database->query('UPDATE doorprize.events SET draw_filters = ?::jsonb, filter_pool_active = (?::integer = 1) WHERE id = ?', [ParticipantFilter::json($filters), (int) (bool) ParticipantFilter::effective($filters), $this->event->id]);
        }
    }
}
