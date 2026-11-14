<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Modules\Events\EventContext;

final class DuplicateRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function policy(): array
    {
        return $this->event->database->query('SELECT duplicate_keys, duplicate_rule_version, participants_version FROM doorprize.events WHERE id = ?', [$this->event->id])[0];
    }

    public function setPolicy(array $keys): void
    {
        $this->event->database->query('UPDATE doorprize.events SET duplicate_keys = ?::jsonb, duplicate_rule_version = duplicate_rule_version + 1, duplicate_on_name = (?::integer = 1) WHERE id = ?', [json_encode($keys, JSON_THROW_ON_ERROR), (int) in_array('name', $keys, true), $this->event->id]);
        $this->event->database->query("UPDATE doorprize.event_fields SET use_for_duplicates = (('field_' || slot::text) IN (SELECT value FROM jsonb_array_elements_text(?::jsonb))) WHERE event_id = ?", [json_encode($keys, JSON_THROW_ON_ERROR), $this->event->id]);
        $this->event->database->query('UPDATE doorprize.participants p SET duplicate_key = doorprize.participant_duplicate_key(to_jsonb(p), ?::jsonb) WHERE p.event_id = ? AND p.duplicate_key IS DISTINCT FROM doorprize.participant_duplicate_key(to_jsonb(p), ?::jsonb)', [json_encode($keys, JSON_THROW_ON_ERROR), $this->event->id, json_encode($keys, JSON_THROW_ON_ERROR)]);
    }

    /** Pemenang/tereliminasi menjadi jangkar; selain itu pilih data rapi, lalu ID terdahulu. */
    public function reconcile(string $scope = '', array $parameters = [], string $nullScope = '', array $nullParameters = []): void
    {
        $this->event->database->query("WITH ranked AS (
          SELECT p.id, first_value(p.id) OVER(PARTITION BY p.duplicate_key ORDER BY
            CASE p.status WHEN 'winner' THEN 0 WHEN 'eliminated' THEN 1 ELSE 2 END, p.data_quality DESC, p.id) AS keeper
          FROM doorprize.participants p WHERE p.event_id = ? AND p.duplicate_key IS NOT NULL {$scope}
        ), resolved AS (
          SELECT p.id, CASE WHEN p.status IN ('winner','eliminated') THEN p.status WHEN p.id = r.keeper THEN 'available' ELSE 'duplicate' END AS status,
            CASE WHEN p.status IN ('winner','eliminated') OR p.id = r.keeper THEN NULL ELSE r.keeper END AS duplicate_of_id
          FROM ranked r JOIN doorprize.participants p ON p.id = r.id AND p.event_id = ?
        ) UPDATE doorprize.participants p SET status = r.status, duplicate_of_id = r.duplicate_of_id, version = p.version + 1, updated_at = now()
          FROM resolved r WHERE p.id = r.id AND p.event_id = ? AND (p.status, p.duplicate_of_id) IS DISTINCT FROM (r.status, r.duplicate_of_id)", [$this->event->id, ...$parameters, $this->event->id, $this->event->id]);
        $this->event->database->query("UPDATE doorprize.participants p SET status = CASE WHEN p.status = 'duplicate' THEN 'available' ELSE p.status END,
          duplicate_of_id = NULL, version = p.version + 1, updated_at = now() WHERE p.event_id = ? AND p.duplicate_key IS NULL
          AND (p.status = 'duplicate' OR p.duplicate_of_id IS NOT NULL) {$nullScope}", [$this->event->id, ...$nullParameters]);
    }

    public function reconcileKeys(array $keys, array $ids): void
    {
        $keys = array_values(array_unique(array_filter($keys, static fn ($key) => $key !== null)));
        if ($keys) $this->reconcile(' AND p.duplicate_key IN (SELECT value FROM jsonb_array_elements_text(?::jsonb))', [json_encode($keys, JSON_THROW_ON_ERROR)], ' AND false');
        if ($ids) $this->reconcile(' AND false', [], ' AND p.id IN (SELECT value::bigint FROM jsonb_array_elements_text(?::jsonb))', [json_encode($ids, JSON_THROW_ON_ERROR)]);
    }

    public function prepareDelete(int $id): void
    {
        $this->event->database->query('UPDATE doorprize.participants SET duplicate_of_id = NULL WHERE event_id = ? AND duplicate_of_id = ?', [$this->event->id, $id]);
    }

    public function capture(string $where, array $parameters): void
    {
        $this->event->database->query("CREATE TEMP TABLE dp_duplicate_work ON COMMIT DROP AS SELECT p.id, p.duplicate_key AS previous_key FROM doorprize.participants p WHERE p.event_id = ? {$where}", [$this->event->id, ...$parameters]);
        $this->event->database->query('CREATE UNIQUE INDEX ON dp_duplicate_work(id)');
    }

    public function reconcileWork(): void
    {
        $this->reconcile(' AND p.duplicate_key IN (SELECT previous_key FROM dp_duplicate_work WHERE previous_key IS NOT NULL UNION SELECT q.duplicate_key FROM doorprize.participants q JOIN dp_duplicate_work w ON w.id = q.id WHERE q.duplicate_key IS NOT NULL)', [], ' AND p.id IN (SELECT id FROM dp_duplicate_work)');
    }

    public function reconcileSource(int $source): void
    {
        $this->reconcile(' AND p.duplicate_key IN (SELECT q.duplicate_key FROM doorprize.participants q WHERE q.event_id = ? AND q.source_id = ? AND q.duplicate_key IS NOT NULL)', [$this->event->id, $source], ' AND p.source_id = ?', [$source]);
    }
}
