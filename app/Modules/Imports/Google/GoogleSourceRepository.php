<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google;

use App\Core\ApiError;
use App\Modules\Events\EventContext;

final class GoogleSourceRepository
{
    private const COLUMNS = 'g.source_id AS id, g.revision, g.connection_id, g.connection_mode, g.endpoint, g.encrypted_secret, g.sheet_id, g.header_row, g.field_schema, g.header_hash, g.metadata,
      g.phase, g.initial_complete, g.version, g.lease_id, g.lease_until, g.pending_job_id, g.failure_count, g.next_attempt_at, g.error_code, g.error_message, g.synced_rows, g.invalid_rows,
      g.conflict_rows, g.last_summary, s.spreadsheet_id, s.sheet_name, s.column_mapping, s.sync_cursor, s.sync_enabled, s.closes_at, s.disconnected_at, s.last_synced_at,
      (s.closes_at IS NOT NULL AND s.closes_at <= now()) AS deadline_passed, (g.lease_until > now()) AS leased, (g.next_attempt_at <= now()) AS due';

    public function __construct(private readonly EventContext $event) {}
    public function lockEvent(): void { $this->event->lock(); }

    public function find(int $id, bool $lock = false): array
    {
        return $this->event->database->query('SELECT ' . self::COLUMNS . ' FROM doorprize.google_sources g JOIN doorprize.import_sources s ON s.id = g.source_id AND s.event_id = g.event_id WHERE g.event_id = ? AND g.source_id = ?' . ($lock ? ' FOR UPDATE OF g, s' : ''), [$this->event->id, $id])[0] ?? throw new ApiError('Sumber Google Sheets tidak ditemukan.', 404);
    }

    public function list(): array
    {
        // Tidak membawa kredensial/metadata/isi peserta pada status berkala.
        return $this->event->database->query('SELECT g.source_id AS id, g.revision, g.phase, g.version, g.connection_mode, g.sheet_id, g.header_row, g.synced_rows, g.invalid_rows, g.conflict_rows,
          g.error_code, g.error_message, g.next_attempt_at, g.last_summary, s.spreadsheet_id, s.sheet_name, s.sync_enabled, s.closes_at, s.last_synced_at,
          (s.closes_at IS NOT NULL AND s.closes_at <= now()) AS deadline_passed FROM doorprize.google_sources g JOIN doorprize.import_sources s ON s.id = g.source_id AND s.event_id = g.event_id WHERE g.event_id = ? AND g.phase IN (\'initial\',\'live\',\'paused\',\'closed\') ORDER BY g.source_id DESC LIMIT 1', [$this->event->id]);
    }

    public function create(string $connection, array $address, int $header, ?string $secret): array
    {
        $old = $this->event->database->query('SELECT source_id AS id FROM doorprize.google_sources WHERE event_id = ? AND connection_id = ?::uuid', [$this->event->id, $connection]);
        if ($old) return [...$this->find((int) $old[0]['id']), 'created' => false];
        if ($this->event->database->query("SELECT 1 FROM doorprize.google_sources g JOIN doorprize.import_sources s ON s.id = g.source_id AND s.event_id = g.event_id WHERE g.event_id = ? AND s.spreadsheet_id = ? AND (g.sheet_id IS NULL OR ?::integer IS NULL OR g.sheet_id = ?::integer) AND g.phase IN ('initial','live','paused','closed') LIMIT 1", [$this->event->id,$address['spreadsheet_id'],$address['sheet_id'],$address['sheet_id']])) throw new ApiError('Sheet ini sudah memiliki koneksi. Gunakan pengaturan sumber yang ada.',409);
        $id = $this->event->database->query("INSERT INTO doorprize.import_sources (event_id, type, spreadsheet_id) VALUES (?, 'google_sheets', ?) RETURNING id", [$this->event->id, $address['spreadsheet_id']])[0]['id'];
        $this->event->database->query("INSERT INTO doorprize.google_sources (source_id, event_id, connection_id, endpoint, encrypted_secret, sheet_id, header_row) VALUES (?, ?, ?::uuid, '', ?, ?, ?)", [$id, $this->event->id, $connection, $secret, $address['sheet_id'], $header]);
        return [...$this->find((int) $id), 'created' => true];
    }

    public function endpoint(int $id, string $url): void
    {
        $this->event->database->query('UPDATE doorprize.google_sources SET revision = revision + 1, endpoint = ?, lease_id = NULL, lease_until = NULL, pending_job_id = NULL, metadata = \'{}\'::jsonb, version = version + 1, error_code = NULL, error_message = NULL WHERE event_id = ? AND source_id = ?', [$url, $this->event->id, $id]);
    }

    public function lease(int $id, string $lease): void
    {
        $this->event->database->query("UPDATE doorprize.google_sources SET revision = revision + 1, lease_id = ?::uuid, lease_until = now() + interval '45 seconds', pending_job_id = NULL WHERE event_id = ? AND source_id = ?", [$lease, $this->event->id, $id]);
    }

    public function pending(int $id, string $lease, string $job): void
    {
        $this->event->database->query('UPDATE doorprize.google_sources SET revision = revision + 1, pending_job_id = ?::uuid WHERE event_id = ? AND source_id = ? AND lease_id = ?::uuid', [$job, $this->event->id, $id, $lease]);
    }

    public function release(int $id, string $lease): void
    {
        $this->event->database->query('UPDATE doorprize.google_sources SET revision = revision + 1, lease_id = NULL, lease_until = NULL, pending_job_id = NULL WHERE event_id = ? AND source_id = ? AND lease_id = ?::uuid', [$this->event->id, $id, $lease]);
    }

    public function metadata(int $id, string $lease, array $reply): void
    {
        $this->event->database->query('UPDATE doorprize.google_sources SET revision = revision + 1, sheet_id = ?, metadata = ?::jsonb, error_code = NULL, error_message = NULL, failure_count = 0 WHERE event_id = ? AND source_id = ? AND lease_id = ?::uuid', [$reply['sheet_id'],json_encode($reply, JSON_THROW_ON_ERROR), $this->event->id, $id, $lease]);
        $this->event->database->query('UPDATE doorprize.import_sources SET sheet_name = ? WHERE event_id = ? AND id = ?', [$reply['sheet_name'], $this->event->id, $id]);
        $this->release($id, $lease);
    }

    public function configure(int $id, array $mapping, string $schema, string $hash, ?string $closes, array $cursor): void
    {
        $this->event->database->query("UPDATE doorprize.google_sources SET revision = revision + 1, field_schema = ?, header_hash = ?, phase = 'initial', initial_complete = false, lease_id = NULL, lease_until = NULL, pending_job_id = NULL,
          failure_count = 0, error_code = NULL, error_message = NULL, version = version + 1, next_attempt_at = now() WHERE event_id = ? AND source_id = ?", [$schema, $hash, $this->event->id, $id]);
        $this->event->database->query('UPDATE doorprize.import_sources SET column_mapping = ?::jsonb, sync_cursor = ?::jsonb, sync_enabled = true, disconnected_at = NULL, closes_at = ?::timestamptz WHERE event_id = ? AND id = ?', [json_encode($mapping, JSON_THROW_ON_ERROR), json_encode($cursor, JSON_THROW_ON_ERROR), $closes, $this->event->id, $id]);
    }

    public function close(int $id, bool $disconnect = false): void
    {
        $this->event->database->query('UPDATE doorprize.google_sources SET revision = revision + 1, phase = ?, lease_id = NULL, lease_until = NULL, pending_job_id = NULL, version = version + 1 WHERE event_id = ? AND source_id = ?', [$disconnect ? 'disconnected' : 'closed', $this->event->id, $id]);
        $this->event->database->query('UPDATE doorprize.import_sources SET sync_enabled = false, disconnected_at = CASE WHEN ?::integer = 1 THEN now() ELSE disconnected_at END WHERE event_id = ? AND id = ?', [(int) $disconnect, $this->event->id, $id]);
    }

    public function schedule(int $id, ?string $closes): void
    {
        $this->event->database->query('UPDATE doorprize.import_sources SET closes_at = ?::timestamptz WHERE event_id = ? AND id = ?', [$closes, $this->event->id, $id]);
        $this->event->database->query('UPDATE doorprize.google_sources SET revision = revision + 1, version = version + 1 WHERE event_id = ? AND source_id = ?', [$this->event->id, $id]);
    }

    public function failed(int $id, string $lease, string $code, string $message, int $seconds, bool $pause): void
    {
        $this->event->database->query("UPDATE doorprize.google_sources SET revision = revision + 1, error_code = ?, error_message = ?, failure_count = failure_count + 1,
          phase = CASE WHEN ?::integer = 1 THEN 'paused' ELSE phase END, next_attempt_at = now() + (?::integer * interval '1 second'), lease_id = NULL, lease_until = NULL, pending_job_id = NULL
          WHERE event_id = ? AND source_id = ? AND lease_id = ?::uuid", [$code, $message, (int) $pause, $seconds, $this->event->id, $id, $lease]);
    }

    public function advance(int $id, array $cursor, string $phase, array $summary): void
    {
        $this->event->database->query('UPDATE doorprize.import_sources SET sync_cursor = ?::jsonb, last_synced_at = now() WHERE event_id = ? AND id = ?', [json_encode($cursor, JSON_THROW_ON_ERROR), $this->event->id, $id]);
        $this->event->database->query("UPDATE doorprize.google_sources SET revision = revision + 1, phase = ?, initial_complete = (? = 'live'), last_summary = ?::jsonb, synced_rows = synced_rows + ?, invalid_rows = invalid_rows + ?, conflict_rows = conflict_rows + ?,
          error_code = NULL, error_message = NULL, failure_count = 0, next_attempt_at = now() + CASE WHEN ?::integer = 1 THEN interval '0 seconds' WHEN connection_mode='reader' THEN interval '15 seconds' ELSE interval '3 seconds' END, lease_id = NULL, lease_until = NULL, pending_job_id = NULL
          WHERE event_id = ? AND source_id = ?", [$phase, $phase, json_encode($summary, JSON_THROW_ON_ERROR), $summary['linked_delta'], $summary['invalid_delta'], $summary['conflict_delta'], (int) ($summary['more'] ?? false), $this->event->id, $id]);
    }

    public function pause(int $id): void
    {
        $this->event->database->query("UPDATE doorprize.google_sources SET revision = revision + 1, phase = 'paused',version = version + 1,error_code = 'manual_pause',error_message = 'Sinkronisasi dijeda operator.',lease_id = NULL,lease_until = NULL,pending_job_id = NULL WHERE event_id = ? AND source_id = ?", [$this->event->id,$id]);
    }

    public function resume(int $id): void
    {
        $this->event->database->query("UPDATE doorprize.google_sources SET revision = revision + 1, phase = CASE WHEN initial_complete THEN 'live' ELSE 'initial' END,version = version + 1,error_code = NULL,error_message = NULL,failure_count = 0,next_attempt_at = now(),lease_id = NULL,lease_until = NULL,pending_job_id = NULL WHERE event_id = ? AND source_id = ?", [$this->event->id,$id]);
        $this->event->database->query('UPDATE doorprize.import_sources SET sync_enabled = true,disconnected_at = NULL WHERE event_id = ? AND id = ?', [$this->event->id,$id]);
    }

    public function adjust(int $id,array $summary): void
    {
        $this->event->database->query('UPDATE doorprize.google_sources SET revision = revision + 1, synced_rows = synced_rows + ?,invalid_rows = invalid_rows + ?,conflict_rows = conflict_rows + ?,last_summary = ?::jsonb WHERE event_id = ? AND source_id = ?', [$summary['linked_delta'],$summary['invalid_delta'],$summary['conflict_delta'],json_encode($summary,JSON_THROW_ON_ERROR),$this->event->id,$id]);
    }

    public function hasInitial(): bool
    {
        $guard=self::initialGuard('g','s');
        return (bool) $this->event->database->query("SELECT 1 FROM doorprize.google_sources g JOIN doorprize.import_sources s ON s.id = g.source_id AND s.event_id = g.event_id WHERE g.event_id = ? AND {$guard} LIMIT 1", [$this->event->id]);
    }

    /** Satu aturan untuk validasi Mulai dan penanda kunci pada state operator. */
    public static function initialGuard(string $source,string $import): string
    {
        if(!preg_match('/^[a-z]+$/D',$source)||!preg_match('/^[a-z]+$/D',$import))throw new \LogicException('Alias sumber tidak valid.');
        return "{$import}.sync_enabled AND NOT {$source}.initial_complete AND ({$source}.connection_mode='script' OR ({$source}.phase='initial' AND {$source}.failure_count=0)) AND ({$import}.closes_at IS NULL OR {$import}.closes_at>now())";
    }

    public function reset(int $id, array $cursor): void
    {
        $this->event->database->query("UPDATE doorprize.google_sources SET revision = revision + 1, phase = 'initial',initial_complete = false,lease_id = NULL,lease_until = NULL,pending_job_id = NULL,error_code = NULL,error_message = NULL,next_attempt_at = now() WHERE event_id = ? AND source_id = ?", [$this->event->id,$id]);
        $this->event->database->query('UPDATE doorprize.import_sources SET sync_cursor = ?::jsonb WHERE event_id = ? AND id = ?', [json_encode($cursor, JSON_THROW_ON_ERROR),$this->event->id,$id]);
    }

    public function bumpDataVersion(): void
    {
        $this->event->database->query('UPDATE doorprize.events SET version = version + 1,updated_at = now() WHERE id = ?', [$this->event->id]);
    }

    public function dataVersion(): int
    {
        return (int) $this->event->database->query('SELECT version FROM doorprize.events WHERE id = ?', [$this->event->id])[0]['version'];
    }

    public function audit(int $id, string $action, array $changes): void
    {
        $this->event->database->query('INSERT INTO doorprize.audit_log (event_id, actor_id, action, entity_type, entity_id, changes) VALUES (?, ?, ?, \'google_source\', ?, ?::jsonb)', [$this->event->id, $this->event->ownerId, $action, $id, json_encode($changes, JSON_THROW_ON_ERROR)]);
    }
}
