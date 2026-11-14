<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google\Reader;

use App\Core\ApiError;
use App\Modules\Events\EventContext;

/** Seluruh SQL pembaca baru; token terenkripsi tidak masuk list/audit. */
final class ReaderRepository
{
    public function __construct(private readonly EventContext $event) {}
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
        return $this->event->database->query("SELECT source_id AS id,version,connection_mode,identity_column FROM doorprize.google_sources WHERE event_id=? AND phase IN ('initial','live','paused','closed') LIMIT 1",[$this->event->id])[0] ?? null;
    }
    public function retire(?int $except): void
    {
        $rows = $this->event->database->query("UPDATE doorprize.google_sources SET phase='disconnected',version=version+1,revision=revision+1,lease_id=NULL,lease_until=NULL,pending_job_id=NULL WHERE event_id=? AND source_id<>COALESCE(?::bigint,0) AND phase IN ('initial','live','paused','closed') RETURNING source_id",[$this->event->id,$except]);
        foreach ($rows as $row) $this->event->database->query('UPDATE doorprize.import_sources SET sync_enabled=false,disconnected_at=now() WHERE event_id=? AND id=?',[$this->event->id,$row['source_id']]);
    }
    public function mark(int $id,int $key,string $connection,int $header): void
    {
        $this->event->database->query("UPDATE doorprize.google_sources SET connection_mode='reader',identity_column=?,connection_id=?::uuid,header_row=? WHERE event_id=? AND source_id=?",[$key,$connection,$header,$this->event->id,$id]);
    }
    public function checkIdentities(int $id,array $events,string $snapshot): void
    {
        $keys = array_column($events,'key');
        if (count($keys)!==count(array_unique($keys))) throw new ApiError('Kolom identitas berisi nilai ganda. Pilih ID unik; aturan duplikasi peserta tetap terpisah.',409);
        $seen = $this->event->database->query('SELECT row_key,row_number FROM doorprize.google_rows WHERE event_id=? AND source_id=? AND seen_snapshot=?::uuid AND row_key IN(SELECT value::uuid FROM jsonb_array_elements_text(?::jsonb))',[$this->event->id,$id,$snapshot,json_encode($keys,JSON_THROW_ON_ERROR)]);
        $positions = array_column($events,'row_number','key');
        foreach ($seen as $row) if ((int)$row['row_number']!==$positions[$row['row_key']]) throw new ApiError('Identitas baris ganda atau susunan berubah saat dibaca. Periksa kolom ID dan hubungkan kembali.',409);
    }
}
