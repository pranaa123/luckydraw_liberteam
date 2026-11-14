<?php

declare(strict_types=1);

namespace App\Modules\Imports;

use App\Modules\Events\EventContext;

/** Window SQL menilai kelompok terdampak; tidak mengirim seluruh peserta ke PHP/browser. */
final class ImportPreviewRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function build(array $batch, bool $changed): array
    {
        $keys = json_encode($batch['duplicate_keys'], JSON_THROW_ON_ERROR);
        $keySql = $changed ? 'doorprize.participant_duplicate_key(to_jsonb(p), ?::jsonb)' : 'p.duplicate_key';
        $scope = $changed ? '' : ' AND p.duplicate_key IN (SELECT duplicate_key FROM doorprize.import_rows WHERE batch_id = ?::uuid AND issue IS NULL AND duplicate_key IS NOT NULL)';
        $parameters = $changed ? [$keys, $this->event->id] : [$this->event->id, $batch['id']];
        $this->event->database->query("CREATE TEMP TABLE dp_import_preview ON COMMIT DROP AS
          WITH candidates AS (
            SELECT p.id AS item_id, false AS incoming, p.name, p.status, p.data_quality, {$keySql} AS key
            FROM doorprize.participants p WHERE p.event_id = ? {$scope}
            UNION ALL SELECT row_number::bigint, true, name, 'available', data_quality, duplicate_key
            FROM doorprize.import_rows WHERE batch_id = ?::uuid AND issue IS NULL
          ), ranked AS (
            SELECT *, first_value(item_id) OVER group_order AS keeper_id, first_value(incoming) OVER group_order AS keeper_incoming,
              first_value(name) OVER group_order AS keeper_name
            FROM candidates WINDOW group_order AS (PARTITION BY key ORDER BY CASE status WHEN 'winner' THEN 0 WHEN 'eliminated' THEN 1 ELSE 2 END, data_quality DESC, incoming, item_id)
          ) SELECT *, CASE WHEN status IN ('winner','eliminated') THEN status WHEN key IS NULL OR (item_id = keeper_id AND incoming = keeper_incoming) THEN 'available' ELSE 'duplicate' END AS projected_status FROM ranked", [...$parameters, $batch['id']]);
        $this->event->database->query("UPDATE doorprize.import_rows r SET preview_status = q.projected_status, keeper_name = CASE WHEN q.projected_status = 'duplicate' THEN q.keeper_name ELSE NULL END FROM dp_import_preview q WHERE r.batch_id = ?::uuid AND q.incoming AND r.row_number = q.item_id", [$batch['id']]);
        $this->event->database->query("UPDATE doorprize.import_rows SET preview_status = 'invalid', keeper_name = NULL WHERE batch_id = ?::uuid AND issue IS NOT NULL", [$batch['id']]);
        $counts = $this->event->database->query("SELECT count(*) FILTER (WHERE incoming AND projected_status = 'available')::int AS available,
          count(*) FILTER (WHERE incoming AND projected_status = 'duplicate')::int AS duplicates,
          count(*) FILTER (WHERE NOT incoming AND status <> projected_status)::int AS existing_changes,
          (count(*) FILTER (WHERE NOT incoming AND projected_status = 'available') - count(*) FILTER (WHERE NOT incoming AND status = 'available'))::int AS existing_available_delta FROM dp_import_preview")[0];
        $invalid = (int) $this->event->database->query('SELECT count(*)::int AS count FROM doorprize.import_rows WHERE batch_id = ?::uuid AND issue IS NOT NULL', [$batch['id']])[0]['count'];
        return [...array_map('intval', $counts), 'invalid' => $invalid, 'valid' => (int) $batch['expected_rows'] - $invalid, 'total' => (int) $batch['expected_rows'], 'rule_changed' => $changed];
    }
}
