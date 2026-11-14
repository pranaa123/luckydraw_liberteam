<?php

declare(strict_types=1);

namespace App\Modules\Events;

final class EventResetRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function summary(): array
    {
        return $this->event->database->query('SELECT id,version,
          (SELECT count(*) FROM doorprize.participants WHERE event_id=e.id) AS participants,
          (SELECT count(*) FROM doorprize.prizes WHERE event_id=e.id) AS prizes,
          (SELECT count(*) FROM doorprize.draw_entries r JOIN doorprize.draws d ON d.id=r.draw_id AND d.event_id=r.event_id WHERE r.event_id=e.id AND d.status=\'confirmed\') AS winners
          FROM doorprize.events e WHERE id=?', [$this->event->id])[0] ?? throw EventContext::changed();
    }

    public function record(): array
    {
        return $this->event->database->query('SELECT id,version,reset_generation,asset_cleanup FROM doorprize.events WHERE id=?',[$this->event->id])[0] ?? throw EventContext::changed();
    }

    public function assets(): array
    {
        return $this->event->database->query('SELECT event_id,path FROM doorprize.background_assets WHERE event_id=?', [$this->event->id]);
    }

    public function replace(int $generation, array $cleanup): int
    {
        $db = $this->event->database;
        $id = $this->event->id;
        $db->query("SELECT set_config('doorprize.reset_event',?,true)", [(string) $id]);
        $db->query('UPDATE doorprize.events SET display_draw_id=NULL,filter_pool_active=false WHERE id=?', [$id]);
        // Dependensi dihapus dahulu; tidak ada TRUNCATE, reset sequence atau DDL.
        foreach (['google_rows','google_sources','draw_entries','audit_log','draws','import_batches','draw_filter_pool','participant_pool','participants','prizes','event_fields','import_sources','background_assets'] as $table) {
            $db->query('DELETE FROM doorprize.' . $table . ' WHERE event_id=?', [$id]);
        }
        // Baris staging/chunk mengikuti ON DELETE CASCADE dari import_batches.
        $db->query('DELETE FROM doorprize.events WHERE id=?', [$id]);
        return (int) $db->query('INSERT INTO doorprize.events(owner_id,reset_generation,asset_cleanup) VALUES (?,?,?::jsonb) RETURNING id', [$this->event->ownerId,$generation,json_encode($cleanup,JSON_THROW_ON_ERROR)])[0]['id'];
    }

    public function cleanupBatch(): array
    {
        $row = $this->event->database->query("SELECT COALESCE((SELECT jsonb_agg(item) FROM (SELECT item FROM jsonb_array_elements(asset_cleanup) item LIMIT 100) limited),'[]'::jsonb) AS batch FROM doorprize.events WHERE id=?", [$this->event->id])[0] ?? throw EventContext::changed();
        return self::decode($row['batch']);
    }

    public function cleaned(array $batch): bool
    {
        $row = $this->event->database->query("UPDATE doorprize.events SET asset_cleanup=COALESCE((SELECT jsonb_agg(item) FROM jsonb_array_elements(asset_cleanup) item WHERE NOT (?::jsonb @> jsonb_build_array(item))),'[]'::jsonb) WHERE id=? RETURNING jsonb_array_length(asset_cleanup) AS remaining", [json_encode($batch,JSON_THROW_ON_ERROR),$this->event->id])[0] ?? throw EventContext::changed();
        return (int) $row['remaining']>0;
    }

    public static function decode(mixed $value): array
    {
        return is_string($value) ? json_decode($value,true,512,JSON_THROW_ON_ERROR) : $value;
    }
}
