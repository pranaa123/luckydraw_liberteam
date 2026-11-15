<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google;

use App\Modules\Events\FieldSchema;

use App\Modules\Events\EventContext;

final class GoogleRowRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function current(int $source, array $keys): array
    {
        $rows = $this->event->database->query('SELECT r.row_key, r.row_number, r.participant_id, r.source_data, r.source_hash, r.incoming_data, r.incoming_hash, r.issue, r.issue_message, r.deleted, r.locally_removed, r.reader_anchor, r.reader_review, r.version,
          ' . FieldSchema::columns('p') . ', p.status, p.version AS participant_version
          FROM doorprize.google_rows r LEFT JOIN doorprize.participants p ON p.id = r.participant_id AND p.event_id = r.event_id
          WHERE r.event_id = ? AND r.source_id = ? AND r.row_key IN (SELECT value::uuid FROM jsonb_array_elements_text(?::jsonb))', [$this->event->id, $source, json_encode($keys, JSON_THROW_ON_ERROR)]);
        $result = [];
        foreach ($rows as $row) {
            foreach (['source_data','incoming_data'] as $field) if ($row[$field] !== null && !is_array($row[$field])) $row[$field] = json_decode($row[$field], true, 32, JSON_THROW_ON_ERROR);
            $result[$row['row_key']] = $row;
        }
        return $result;
    }

    public function updateParticipants(array $updates): int
    {
        if (!$updates) return 0;
        $keys = FieldSchema::KEYS;
        $sets = implode(', ',array_map(static fn (string $key): string => "{$key}=r.{$key}",$keys));
        $types = implode(', ',array_map(static fn (string $key): string => $key . ' text',$keys));
        $before = FieldSchema::columns('p');
        $after = FieldSchema::columns('r');
        return (int) $this->event->database->query("WITH changed AS (UPDATE doorprize.participants p SET {$sets},status=r.status,version=p.version+1,updated_at=now()
          FROM jsonb_to_recordset(?::jsonb) AS r(id bigint,{$types},status text)
          WHERE p.event_id=? AND p.id=r.id AND ({$before},p.status) IS DISTINCT FROM ({$after},r.status) RETURNING 1)
          SELECT count(*)::int AS count FROM changed",[json_encode($updates,JSON_THROW_ON_ERROR),$this->event->id])[0]['count'];
    }

    public function insertParticipants(int $source, array $inserts): array
    {
        if (!$inserts) return [];
        $json = json_encode($inserts,JSON_THROW_ON_ERROR);
        $columns = FieldSchema::columns();
        $values = implode(', ',array_map(static fn (string $key): string => $key==='name' ? "r.data->>'name'" : "NULLIF(r.data->>'{$key}','')",FieldSchema::KEYS));
        $this->event->database->query("INSERT INTO doorprize.participants (event_id,{$columns},status,source_id,source_row_key,source_hash)
          SELECT ?,{$values},'duplicate',?,r.row_key,r.hash FROM jsonb_to_recordset(?::jsonb) AS r(row_key text,data jsonb,hash text)
          ON CONFLICT(source_id,source_row_key) WHERE source_id IS NOT NULL AND source_row_key IS NOT NULL DO NOTHING",[$this->event->id,$source,$json]);
        return $this->event->database->query('SELECT id,source_row_key FROM doorprize.participants WHERE event_id=? AND source_id=? AND source_row_key IN (SELECT value->>\'row_key\' FROM jsonb_array_elements(?::jsonb))',[$this->event->id,$source,$json]);
    }

    public function remember(array $rows, int $source, ?string $snapshot): void
    {
        if (!$rows) return;
        $this->event->database->query('INSERT INTO doorprize.google_rows AS old (source_id,event_id,row_key,row_number,participant_id,source_data,source_hash,incoming_data,incoming_hash,issue,issue_message,deleted,locally_removed,seen_snapshot,reader_anchor,reader_review)
          SELECT ?, ?, r.row_key, r.row_number, r.participant_id, r.source_data, r.source_hash, r.incoming_data, r.incoming_hash, r.issue, r.issue_message, r.deleted, r.locally_removed, ?::uuid,r.reader_anchor,r.reader_review
          FROM jsonb_to_recordset(?::jsonb) AS r(row_key uuid,row_number integer,participant_id bigint,source_data jsonb,source_hash text,incoming_data jsonb,incoming_hash text,issue text,issue_message text,deleted boolean,locally_removed boolean,reader_anchor text,reader_review boolean)
          ON CONFLICT(source_id,row_key) DO UPDATE SET row_number = excluded.row_number,participant_id = excluded.participant_id,source_data = excluded.source_data,source_hash = excluded.source_hash,
          incoming_data = excluded.incoming_data,incoming_hash = excluded.incoming_hash,issue = excluded.issue,issue_message = excluded.issue_message,deleted = excluded.deleted,locally_removed = excluded.locally_removed,
          seen_snapshot = COALESCE(excluded.seen_snapshot,old.seen_snapshot),reader_anchor=excluded.reader_anchor,reader_review=excluded.reader_review,version = old.version + 1,updated_at = now()
          WHERE (old.row_number,old.participant_id,old.source_data,old.source_hash,old.incoming_data,old.incoming_hash,old.issue,old.issue_message,old.deleted,old.locally_removed,old.seen_snapshot,old.reader_anchor,old.reader_review)
            IS DISTINCT FROM (excluded.row_number,excluded.participant_id,excluded.source_data,excluded.source_hash,excluded.incoming_data,excluded.incoming_hash,excluded.issue,excluded.issue_message,excluded.deleted,excluded.locally_removed,COALESCE(excluded.seen_snapshot,old.seen_snapshot),excluded.reader_anchor,excluded.reader_review)', [$source, $this->event->id, $snapshot, json_encode($rows, JSON_THROW_ON_ERROR)]);
    }

    public function addWork(array $ids): void
    {
        if (!$ids) return;
        $this->event->database->query('INSERT INTO dp_duplicate_work (id,previous_key) SELECT p.id,p.duplicate_key FROM doorprize.participants p WHERE p.event_id = ? AND p.id IN (SELECT value::bigint FROM jsonb_array_elements_text(?::jsonb)) ON CONFLICT(id) DO NOTHING', [$this->event->id, json_encode($ids, JSON_THROW_ON_ERROR)]);
    }

    public function removeMissing(int $source, string $snapshot): array
    {
        $args = [$this->event->id,$source,$snapshot];
        $scope = 'r.event_id = ? AND r.source_id = ? AND r.seen_snapshot IS DISTINCT FROM ?::uuid AND NOT r.deleted';
        $this->event->database->query("INSERT INTO dp_duplicate_work (id,previous_key) SELECT p.id,p.duplicate_key FROM doorprize.google_rows r JOIN doorprize.participants p ON p.id = r.participant_id AND p.event_id = r.event_id WHERE {$scope} ON CONFLICT(id) DO NOTHING", $args);
        $changed = (int) $this->event->database->query("WITH changed AS (UPDATE doorprize.participants p SET status = 'eliminated',version = p.version + 1,updated_at = now() FROM doorprize.google_rows r
          WHERE {$scope} AND p.id = r.participant_id AND p.event_id = r.event_id AND p.status IN ('available','duplicate') RETURNING 1) SELECT count(*)::int AS count FROM changed", $args)[0]['count'];
        $counts = $this->event->database->query("SELECT count(*) FILTER(WHERE r.issue = 'invalid')::int AS invalid, count(*) FILTER(WHERE r.issue IN ('conflict','local_deleted'))::int AS conflicts FROM doorprize.google_rows r WHERE {$scope}", $args)[0];
        $this->event->database->query("UPDATE doorprize.google_rows r SET deleted = true,issue = NULL,issue_message = NULL,incoming_data = NULL,incoming_hash = NULL,version = version + 1,updated_at = now() WHERE {$scope}", $args);
        return ['changed' => $changed, 'invalid_delta' => -(int) $counts['invalid'], 'conflict_delta' => -(int) $counts['conflicts']];
    }

    public function issues(int $source, string $after): array
    {
        $rows = $this->event->database->query('SELECT r.row_key,r.row_number,r.participant_id,r.issue,r.issue_message,r.locally_removed,r.source_data,r.incoming_data,r.version,' . FieldSchema::columns('p') . '
          FROM doorprize.google_rows r LEFT JOIN doorprize.participants p ON p.id = r.participant_id AND p.event_id = r.event_id
          WHERE r.event_id = ? AND r.source_id = ? AND r.issue IS NOT NULL AND r.row_key > ?::uuid ORDER BY r.row_key LIMIT 51', [$this->event->id, $source, $after]);
        foreach ($rows as &$row) foreach (['source_data','incoming_data'] as $field) if ($row[$field] !== null && !is_array($row[$field])) $row[$field] = json_decode($row[$field],true,32,JSON_THROW_ON_ERROR);
        unset($row); return $rows;
    }

    public function detach(int $participant): void
    {
        $rows = $this->event->database->query('UPDATE doorprize.google_rows SET participant_id = NULL,locally_removed = true,version = version + 1 WHERE event_id = ? AND participant_id = ? RETURNING source_id', [$this->event->id,$participant]);
        foreach ($rows as $row) $this->event->database->query('UPDATE doorprize.google_sources SET revision = revision + 1,synced_rows = GREATEST(0,synced_rows - 1) WHERE event_id = ? AND source_id = ?', [$this->event->id,$row['source_id']]);
    }
}
