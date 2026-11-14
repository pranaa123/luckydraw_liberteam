<?php

declare(strict_types=1);

namespace App\Modules\Draws;

use App\Modules\Events\FieldSchema;
use App\Modules\Events\EventContext;
use App\Modules\Participants\DrawFilterPoolRepository;
use App\Modules\Participants\ParticipantFilter;

final class DrawRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function lock(): array
    {
        return $this->event->database->query('SELECT id, draw_version, draw_filters FROM doorprize.events WHERE id = ? FOR UPDATE', [$this->event->id])[0] ?? throw EventContext::changed();
    }

    public function capacity(array $filters = []): int
    {
        $table = DrawFilterPoolRepository::table($filters);
        return (int) ($this->event->database->query("SELECT position FROM doorprize.{$table} WHERE event_id = ? ORDER BY position DESC LIMIT 1", [$this->event->id])[0]['position'] ?? 0);
    }

    public function fields(): array
    {
        return $this->event->database->query('SELECT slot, label FROM doorprize.event_fields WHERE event_id = ? ORDER BY slot', [$this->event->id]);
    }

    public function pending(): bool
    {
        return (bool) $this->event->database->query("SELECT id FROM doorprize.draws WHERE event_id = ? AND status = 'pending' LIMIT 1", [$this->event->id]);
    }

    public function find(int $id): ?array
    {
        return $this->event->database->query('SELECT id, status, phase, prize_mode, requested_count, allocation, filters, request_hash FROM doorprize.draws WHERE event_id = ? AND id = ? FOR UPDATE', [$this->event->id, $id])[0] ?? null;
    }

    public function byKey(string $key): ?array
    {
        return $this->event->database->query('SELECT id, request_hash FROM doorprize.draws WHERE event_id = ? AND idempotency_key = ?::uuid', [$this->event->id, $key])[0] ?? null;
    }

    public function participants(array $positions, array $filters = []): array
    {
        $table = DrawFilterPoolRepository::table($filters);
        $columns = FieldSchema::columns('p');
        [$where, $values] = ParticipantFilter::sql($filters);
        return $this->event->database->query("WITH selected AS (
            SELECT value::bigint AS position, ordinality FROM jsonb_array_elements_text(?::jsonb) WITH ORDINALITY
        ) SELECT p.id, {$columns}, p.status
          FROM selected s JOIN doorprize.{$table} pool ON pool.event_id = ? AND pool.position = s.position
          JOIN doorprize.participants p ON p.id = pool.participant_id AND p.event_id = pool.event_id
          WHERE p.status = 'available' {$where} ORDER BY s.ordinality FOR UPDATE OF p", [json_encode($positions, JSON_THROW_ON_ERROR), $this->event->id, ...$values]);
    }

    public function create(array $values): int
    {
        return (int) $this->event->database->query("INSERT INTO doorprize.draws
          (event_id, sequence_number, prize_mode, requested_count, idempotency_key, phase, animation_seed, sample_names, allocation, field_definitions, request_hash, filters)
          VALUES (?, (SELECT COALESCE(max(sequence_number), 0) + 1 FROM doorprize.draws WHERE event_id = ?), ?, ?, ?::uuid, 'rolling', ?, ?::jsonb, ?::jsonb, ?::jsonb, ?, ?::jsonb) RETURNING id",
          [$this->event->id, $this->event->id, ...$values])[0]['id'];
    }

    public function display(int $id, int $count, string $mode, array $allocation, array $filters): void
    {
        $this->event->database->query('UPDATE doorprize.events SET display_draw_id = ?, winner_count = ?, prize_mode = ?, draw_allocation = ?::jsonb, draw_filters = ?::jsonb, filter_pool_active = (?::integer = 1) WHERE id = ?', [$id, $count, $mode, json_encode($allocation, JSON_THROW_ON_ERROR), ParticipantFilter::json($filters), (int) (bool) ParticipantFilter::effective($filters), $this->event->id]);
    }

    public function saveEntries(int $id, array $entries): void
    {
        $this->event->database->query('INSERT INTO doorprize.draw_entries (event_id, draw_id, participant_id, prize_id, position, participant_snapshot, prize_name_snapshot)
          SELECT ?, ?, x.participant_id, x.prize_id, x.position, x.participant_snapshot, x.prize_name_snapshot
          FROM jsonb_to_recordset(?::jsonb) AS x(participant_id bigint, prize_id bigint, position integer, participant_snapshot jsonb, prize_name_snapshot text)', [$this->event->id, $id, json_encode($entries, JSON_THROW_ON_ERROR)]);
        $this->event->database->query("UPDATE doorprize.draws SET phase = 'result' WHERE event_id = ? AND id = ?", [$this->event->id, $id]);
    }

    public function selected(int $id): array
    {
        return $this->event->database->query('SELECT p.id, p.status FROM doorprize.draw_entries entry JOIN doorprize.participants p ON p.id = entry.participant_id AND p.event_id = entry.event_id WHERE entry.event_id = ? AND entry.draw_id = ? ORDER BY p.id FOR UPDATE OF p', [$this->event->id, $id]);
    }

    public function assignedPrizes(int $id): array
    {
        return $this->event->database->query('SELECT p.id, p.remaining_quantity, assigned.quantity FROM doorprize.prizes p JOIN
          (SELECT prize_id, count(*)::int AS quantity FROM doorprize.draw_entries WHERE event_id = ? AND draw_id = ? AND prize_id IS NOT NULL GROUP BY prize_id) assigned
          ON p.id = assigned.prize_id WHERE p.event_id = ? ORDER BY p.id FOR UPDATE OF p', [$this->event->id, $id, $this->event->id]);
    }

    public function changeParticipants(int $id, string $status): array
    {
        $columns = FieldSchema::columns();
        return $this->event->database->query("UPDATE doorprize.participants SET status = ?, version = version + 1, updated_at = now() WHERE event_id = ? AND id IN
          (SELECT participant_id FROM doorprize.draw_entries WHERE event_id = ? AND draw_id = ?) RETURNING id, {$columns}, status, version", [$status, $this->event->id, $this->event->id, $id]);
    }

    public function consumePrizes(int $id): array
    {
        return $this->event->database->query('UPDATE doorprize.prizes p SET remaining_quantity = p.remaining_quantity - assigned.quantity, version = p.version + 1, updated_at = now() FROM
          (SELECT prize_id, count(*)::int AS quantity FROM doorprize.draw_entries WHERE event_id = ? AND draw_id = ? AND prize_id IS NOT NULL GROUP BY prize_id) assigned
          WHERE p.id = assigned.prize_id AND p.event_id = ?
          RETURNING p.id, p.name, p.initial_quantity, p.remaining_quantity, p.sort_order, p.background_path, p.version', [$this->event->id, $id, $this->event->id]);
    }

    public function resolve(int $id, string $status, bool $clear): void
    {
        $this->event->database->query('UPDATE doorprize.draws SET status = ?, resolved_at = now() WHERE event_id = ? AND id = ?', [$status, $this->event->id, $id]);
        if ($clear) $this->clearDisplay($id);
    }

    public function clearDisplay(int $id): void
    {
        $this->event->database->query('UPDATE doorprize.events SET display_draw_id = NULL WHERE id = ? AND display_draw_id = ?', [$this->event->id, $id]);
    }

    public function audit(string $action, int $id): void
    {
        $this->event->database->query('UPDATE doorprize.events SET draw_version = draw_version + 1, version = version + 1, updated_at = now() WHERE id = ?', [$this->event->id]);
        $this->event->database->query("INSERT INTO doorprize.audit_log (event_id, actor_id, action, entity_type, entity_id) VALUES (?, ?, ?, 'draw', ?)", [$this->event->id, $this->event->ownerId, $action, $id]);
    }

    /** Satu snapshot SQL untuk versi, layar, hasil dan jumlah tersedia. */
    public function state(bool $withAnimation = true): array
    {
        $row = $this->event->database->query("SELECT EXISTS(SELECT 1 FROM doorprize.google_sources gs JOIN doorprize.import_sources src ON src.id = gs.source_id AND src.event_id = gs.event_id WHERE gs.event_id = e.id AND src.sync_enabled AND NOT gs.initial_complete AND (src.closes_at IS NULL OR src.closes_at > now())) AS sync_pending, e.draw_version, e.version AS data_version, e.participants_version, e.winner_count, e.prize_mode, e.draw_allocation, e.draw_filters,
          CASE WHEN e.filter_pool_active THEN COALESCE((SELECT position FROM doorprize.draw_filter_pool WHERE event_id = e.id ORDER BY position DESC LIMIT 1), 0)
          ELSE COALESCE((SELECT position FROM doorprize.participant_pool WHERE event_id = e.id ORDER BY position DESC LIMIT 1), 0) END AS eligible_count,
          COALESCE((SELECT position FROM doorprize.participant_pool WHERE event_id = e.id ORDER BY position DESC LIMIT 1), 0) AS available_count,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('slot', slot, 'label', label) ORDER BY slot) FROM doorprize.event_fields WHERE event_id = e.id), '[]'::jsonb) AS fields,
          d.id, d.sequence_number, d.status, d.phase, d.prize_mode AS draw_prize_mode, d.requested_count, d.animation_seed, d.sample_names, d.allocation, d.field_definitions,
          (extract(epoch FROM d.created_at) * 1000)::bigint AS started_at,
          COALESCE((SELECT jsonb_agg(jsonb_build_object('participant_id', participant_id, 'position', position, 'participant', participant_snapshot, 'prize_id', prize_id, 'prize_name', prize_name_snapshot) ORDER BY position)
            FROM doorprize.draw_entries WHERE event_id = e.id AND draw_id = d.id), '[]'::jsonb) AS entries
          FROM doorprize.events e LEFT JOIN doorprize.draws d ON d.id = e.display_draw_id AND d.event_id = e.id WHERE e.id = ?", [$this->event->id])[0];
        $decode = static fn ($value): array => is_array($value) ? $value : json_decode($value ?? '[]', true, 512, JSON_THROW_ON_ERROR);
        $names = $withAnimation && $row['status']==='pending' && $row['phase']==='rolling'
            ? (new DrawAnimationRepository($this->event))->names((int) $row['animation_seed'],(int) $row['eligible_count'],$decode($row['draw_filters'])) : [];
        return [
            'sync_pending' => (bool) $row['sync_pending'], 'version' => (int) $row['draw_version'], 'data_version' => (int) $row['data_version'], 'participants_version' => (int) $row['participants_version'], 'eligible_count' => (int) $row['eligible_count'], 'available_count' => (int) $row['available_count'], 'fields' => $decode($row['fields']),
            'config' => ['winner_count' => (int) $row['winner_count'], 'prize_mode' => $row['prize_mode'], 'allocation' => $decode($row['draw_allocation']), 'filters' => (object) $decode($row['draw_filters'])],
            'draw' => $row['id'] === null ? null : [
                'id' => (int) $row['id'], 'sequence_number' => (int) $row['sequence_number'], 'status' => $row['status'], 'phase' => $row['phase'],
                'prize_mode' => $row['draw_prize_mode'], 'requested_count' => (int) $row['requested_count'], 'seed' => (int) $row['animation_seed'], 'started_at' => (int) $row['started_at'],
                'sample_names' => $names, 'allocation' => $decode($row['allocation']), 'fields' => $decode($row['field_definitions']), 'entries' => $decode($row['entries']),
            ],
        ];
    }
}
