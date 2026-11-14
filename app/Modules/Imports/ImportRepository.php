<?php

declare(strict_types=1);

namespace App\Modules\Imports;

use App\Modules\Events\FieldSchema;

use App\Core\ApiError;
use App\Modules\Events\EventContext;

final class ImportRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function lockEvent(): void
    {
        $this->event->lock();
    }

    public function eventInfo(): array
    {
        return $this->event->database->query('SELECT client_name, event_name FROM doorprize.events WHERE id = ?', [$this->event->id])[0];
    }

    public function hasPendingDraw(): bool
    {
        return (bool) $this->event->database->query("SELECT id FROM doorprize.draws WHERE event_id = ? AND status = 'pending' LIMIT 1", [$this->event->id]);
    }

    public function batch(string $id): array
    {
        return $this->event->database->query('SELECT id, filename, sheet_name, field_schema, mapping, duplicate_keys, request_hash, expected_rows, uploaded_rows, next_chunk, next_row, status, preview_revision, participants_version, rule_version, summary, source_id FROM doorprize.import_batches WHERE event_id = ? AND id = ?::uuid FOR UPDATE', [$this->event->id, $id])[0] ?? throw new ApiError('Sesi import tidak ditemukan. Pilih ulang berkas.', 404);
    }

    public function create(string $id, array $data, string $hash): void
    {
        $this->event->database->query("DELETE FROM doorprize.import_batches WHERE event_id = ? AND status <> 'committed' AND updated_at < now() - interval '1 day'", [$this->event->id]);
        $this->event->database->query('INSERT INTO doorprize.import_batches (id, event_id, filename, sheet_name, field_schema, mapping, duplicate_keys, expected_rows, request_hash) VALUES (?::uuid, ?, ?, ?, ?, ?::jsonb, ?::jsonb, ?, ?) ON CONFLICT (id) DO NOTHING', [$id, $this->event->id, $data['filename'], $data['sheet_name'], $data['field_schema'], json_encode($data['mapping'], JSON_THROW_ON_ERROR), json_encode($data['keys'], JSON_THROW_ON_ERROR), $data['expected_rows'], $hash]);
    }

    public function chunk(array $batch, int $number, array $rows, string $hash): array
    {
        $id = $batch['id'];
        $old = $this->event->database->query('SELECT content_hash FROM doorprize.import_chunks WHERE batch_id = ?::uuid AND chunk_number = ?', [$id, $number]);
        if ($old) {
            if ($old[0]['content_hash'] !== $hash) throw new ApiError('Isi potongan import berbeda dari permintaan sebelumnya.', 409);
            return ['uploaded_rows' => (int) $batch['uploaded_rows']];
        }
        if ($batch['status'] !== 'draft' || $number !== (int) $batch['next_chunk'] || (int) $batch['uploaded_rows'] + count($rows) > (int) $batch['expected_rows']) throw new ApiError('Urutan pengiriman import berubah. Pilih ulang berkas.', 409);
        $columns = FieldSchema::columns();
        $values = implode(', ',array_map(static fn (string $key): string => $key==='name' ? 'r.name' : "NULLIF(r.{$key},'')",FieldSchema::KEYS));
        $types = implode(', ',array_map(static fn (string $key): string => $key . ' text',FieldSchema::KEYS));
        $this->event->database->query("INSERT INTO doorprize.import_rows (batch_id,row_number,{$columns},issue,duplicate_key) SELECT ?::uuid,r.row_number,{$values},r.issue,doorprize.participant_duplicate_key(to_jsonb(r),?::jsonb) FROM jsonb_to_recordset(?::jsonb) AS r(row_number integer,{$types},issue text)",[$id,json_encode($batch['duplicate_keys'],JSON_THROW_ON_ERROR),json_encode($rows,JSON_THROW_ON_ERROR)]);
        $this->event->database->query('INSERT INTO doorprize.import_chunks (batch_id, chunk_number, content_hash) VALUES (?::uuid, ?, ?)', [$id, $number, $hash]);
        return $this->event->database->query('UPDATE doorprize.import_batches SET uploaded_rows = uploaded_rows + ?, next_chunk = next_chunk + 1, next_row = ?, updated_at = now() WHERE id = ?::uuid RETURNING uploaded_rows', [count($rows), $rows[array_key_last($rows)]['row_number'], $id])[0];
    }

    public function rows(string $id, int $after): array
    {
        return $this->event->database->query('SELECT row_number, ' . FieldSchema::columns() . ', issue, preview_status, keeper_name FROM doorprize.import_rows WHERE batch_id = ?::uuid AND row_number > ? ORDER BY row_number LIMIT 51', [$id, $after]);
    }

    public function previewReady(string $id, array $policy, array $summary): array
    {
        return $this->event->database->query("UPDATE doorprize.import_batches SET status = 'ready', preview_revision = preview_revision + 1, participants_version = ?, rule_version = ?, summary = ?::jsonb, updated_at = now() WHERE id = ?::uuid RETURNING preview_revision", [$policy['participants_version'], $policy['duplicate_rule_version'], json_encode($summary, JSON_THROW_ON_ERROR), $id])[0];
    }

    public function insertParticipants(array $batch): int
    {
        $source = (int) $this->event->database->query("INSERT INTO doorprize.import_sources (event_id, type, sheet_name, column_mapping) VALUES (?, 'excel', ?, ?::jsonb) RETURNING id", [$this->event->id, $batch['sheet_name'], json_encode($batch['mapping'], JSON_THROW_ON_ERROR)])[0]['id'];
        // Masuk non-eligible dahulu. Rekonsiliasi dalam transaksi yang sama mengaktifkan hanya keeper.
        $columns = FieldSchema::columns();
        $this->event->database->query("INSERT INTO doorprize.participants (event_id,{$columns},status,source_id,source_row_key,source_hash)
          SELECT ?,{$columns},'duplicate',?,row_number::text,encode(sha256(convert_to(jsonb_build_array({$columns})::text,'UTF8')),'hex')
          FROM doorprize.import_rows WHERE batch_id=?::uuid AND issue IS NULL ORDER BY row_number",[$this->event->id,$source,$batch['id']]);
        if ((int) $batch['uploaded_rows'] >= 1000) $this->event->database->query('ANALYZE doorprize.participants (id, event_id, status, duplicate_key, data_quality)');
        return $source;
    }

    public function complete(array $batch, int $source, array $summary): void
    {
        $this->event->database->query('UPDATE doorprize.events SET version = version + 1, updated_at = now() WHERE id = ?', [$this->event->id]);
        $this->event->database->query("INSERT INTO doorprize.audit_log (event_id, actor_id, action, entity_type, entity_id, changes) VALUES (?, ?, 'import', 'participant_import', ?, ?::jsonb)", [$this->event->id, $this->event->ownerId, $source, json_encode(['name' => $batch['filename'], ...$summary], JSON_THROW_ON_ERROR)]);
        $this->event->database->query("UPDATE doorprize.import_batches SET status = 'committed', source_id = ?, summary = ?::jsonb, updated_at = now() WHERE id = ?::uuid", [$source, json_encode($summary, JSON_THROW_ON_ERROR), $batch['id']]);
        $this->event->database->query('DELETE FROM doorprize.import_rows WHERE batch_id = ?::uuid', [$batch['id']]);
        $this->event->database->query('DELETE FROM doorprize.import_chunks WHERE batch_id = ?::uuid', [$batch['id']]);
    }

    public function cancel(string $id): void
    {
        $this->event->database->query("DELETE FROM doorprize.import_batches WHERE event_id = ? AND id = ?::uuid AND status <> 'committed'", [$this->event->id, $id]);
    }
}
