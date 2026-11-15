<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google\Reader;

use App\Modules\Events\EventContext;

/** Seluruh SQL pembaca baru; token terenkripsi tidak masuk list/audit. */
final class ReaderRepository
{
    public function __construct(private readonly EventContext $event) {}

    /** Transisi sumber lama setelah kode baru aktif; peserta dan UUID yang sudah tersimpan dipertahankan. */
    public function upgrade(): void
    {
        if(!$this->event->database->query("SELECT 1 FROM doorprize.google_sources WHERE event_id=? AND connection_mode='reader' AND reader_protocol=1 LIMIT 1",[$this->event->id]))return;
        $this->event->database->transaction(function(): void {
            $this->event->lock();
            $this->event->database->query("UPDATE doorprize.google_sources g SET
              phase=CASE WHEN g.initial_complete THEN 'live' ELSE 'initial' END,error_code=NULL,error_message=NULL,failure_count=0
              FROM doorprize.import_sources s WHERE g.event_id=? AND g.reader_protocol=1 AND g.connection_mode='reader' AND g.phase='paused'
                AND s.id=g.source_id AND s.event_id=g.event_id AND (s.closes_at IS NULL OR s.closes_at>now()) AND s.disconnected_at IS NULL
                AND (g.error_message LIKE 'Kolom identitas berisi nilai ganda.%' OR g.error_message LIKE 'Identitas baris ganda atau susunan berubah%' OR g.error_message LIKE 'Identitas kosong pada baris%')",[$this->event->id]);
            $this->event->database->query("UPDATE doorprize.import_sources s SET sync_cursor=?::jsonb FROM doorprize.google_sources g
              WHERE g.event_id=? AND g.reader_protocol=1 AND g.connection_mode='reader' AND g.source_id=s.id AND g.event_id=s.event_id",
              [json_encode(ReaderSnapshotService::idle(''),JSON_THROW_ON_ERROR),$this->event->id]);
            $this->event->database->query("UPDATE doorprize.google_sources SET reader_protocol=2,version=version+1,revision=revision+1,lease_id=NULL,lease_until=NULL,pending_job_id=NULL,next_attempt_at=now()
              WHERE event_id=? AND reader_protocol=1 AND connection_mode='reader'",[$this->event->id]);
        });
    }
    public function access(): ?string
    {
        return $this->event->database->query("SELECT google_reader_access FROM doorprize.events WHERE id=? AND google_reader_expires_at>now()+interval '2 minutes'",[$this->event->id])[0]['google_reader_access'] ?? null;
    }
    public function cacheAccess(string $encrypted,string $expires): void
    {
        $this->event->database->query('UPDATE doorprize.events SET google_reader_access=?,google_reader_expires_at=?::timestamptz WHERE id=?',[$encrypted,$expires,$this->event->id]);
    }
    public function clearAccess(): void
    {
        $this->event->database->query('UPDATE doorprize.events SET google_reader_access=NULL,google_reader_expires_at=NULL WHERE id=?',[$this->event->id]);
    }
    public function rename(int $id,string $name): void
    {
        $this->event->database->query('UPDATE doorprize.import_sources SET sheet_name=? WHERE event_id=? AND id=?',[$name,$this->event->id,$id]);
    }
    public function current(): ?array
    {
        return $this->event->database->query("SELECT source_id AS id,version,connection_mode FROM doorprize.google_sources WHERE event_id=? AND phase IN ('initial','live','paused','closed') LIMIT 1",[$this->event->id])[0] ?? null;
    }
    public function retire(?int $except): void
    {
        $rows = $this->event->database->query("UPDATE doorprize.google_sources SET phase='disconnected',version=version+1,revision=revision+1,lease_id=NULL,lease_until=NULL,pending_job_id=NULL WHERE event_id=? AND source_id<>COALESCE(?::bigint,0) AND phase IN ('initial','live','paused','closed') RETURNING source_id",[$this->event->id,$except]);
        foreach ($rows as $row) $this->event->database->query('UPDATE doorprize.import_sources SET sync_enabled=false,disconnected_at=now() WHERE event_id=? AND id=?',[$this->event->id,$row['source_id']]);
    }
    public function mark(int $id,string $connection,int $header): void
    {
        $this->event->database->query("UPDATE doorprize.google_sources SET connection_mode='reader',reader_protocol=2,connection_id=?::uuid,header_row=? WHERE event_id=? AND source_id=?",[$connection,$header,$this->event->id,$id]);
    }

    public function revisit(int $id): void
    {
        $this->event->database->query("UPDATE doorprize.import_sources SET sync_cursor=jsonb_set(sync_cursor,'{version}','\"\"'::jsonb) WHERE event_id=? AND id=? AND sync_cursor->>'kind'='idle'",[$this->event->id,$id]);
        $this->event->database->query('UPDATE doorprize.google_sources SET next_attempt_at=now() WHERE event_id=? AND source_id=?',[$this->event->id,$id]);
    }
}
