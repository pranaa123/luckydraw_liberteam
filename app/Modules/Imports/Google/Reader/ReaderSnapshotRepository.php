<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google\Reader;

use App\Modules\Events\EventContext;

/** Penampungan sumber terpisah dari peserta; UUID dipertahankan lewat pencocokan satu snapshot lengkap. */
final class ReaderSnapshotRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function stage(int $source,string $snapshot,array $rows,bool $first): void
    {
        if($first)$this->event->database->query('DELETE FROM doorprize.google_reader_snapshot_rows WHERE event_id=? AND source_id=? AND snapshot_id<>?::uuid',[$this->event->id,$source,$snapshot]);
        if(!$rows)return;
        $this->event->database->query('INSERT INTO doorprize.google_reader_snapshot_rows(source_id,event_id,snapshot_id,row_number,data,anchor,issue)
          SELECT ?,?,?::uuid,r.row_number,r.data,r.anchor,r.issue FROM jsonb_to_recordset(?::jsonb) AS r(row_number integer,data jsonb,anchor text,issue text)
          ON CONFLICT(source_id,snapshot_id,row_number) DO UPDATE SET data=excluded.data,anchor=excluded.anchor,issue=excluded.issue',
          [$source,$this->event->id,$snapshot,json_encode($rows,JSON_THROW_ON_ERROR)]);
    }

    public function prepare(int $source,string $snapshot): void
    {
        $args=[$this->event->id,$source,$snapshot];
        // Isi yang sama di tempat yang sama dipertahankan terlebih dahulu, termasuk salinan identik.
        $this->event->database->query('WITH matches AS (
            SELECT s.row_number,r.row_key,r.reader_review,row_number() OVER(PARTITION BY s.row_number ORDER BY r.row_key) AS choice
            FROM doorprize.google_reader_snapshot_rows s JOIN doorprize.google_rows r ON r.source_id=s.source_id AND r.event_id=s.event_id AND r.row_number=s.row_number
              AND NOT r.deleted AND COALESCE(r.incoming_data,r.source_data)=s.data
            WHERE s.event_id=? AND s.source_id=? AND s.snapshot_id=?::uuid
          ) UPDATE doorprize.google_reader_snapshot_rows s SET row_key=m.row_key,review=m.reader_review
          FROM matches m WHERE m.choice=1 AND s.event_id=? AND s.source_id=? AND s.snapshot_id=?::uuid AND s.row_number=m.row_number',
          [...$args,...$args]);
        // Cadangan identik tetap mendapat UUID berbeda; urutan tidak menjadi identitas permanen.
        $this->event->database->query('WITH previous AS (
            SELECT row_key,COALESCE(incoming_data,source_data) AS data,reader_review,
              row_number() OVER(PARTITION BY md5(COALESCE(incoming_data,source_data)::text) ORDER BY deleted,row_number,row_key) AS occurrence
            FROM doorprize.google_rows old WHERE event_id=? AND source_id=?
              AND NOT EXISTS(SELECT 1 FROM doorprize.google_reader_snapshot_rows assigned WHERE assigned.source_id=old.source_id AND assigned.snapshot_id=?::uuid AND assigned.row_key=old.row_key)
          ), incoming AS (
            SELECT row_number,data,row_number() OVER(PARTITION BY fingerprint ORDER BY row_number) AS occurrence
            FROM doorprize.google_reader_snapshot_rows WHERE event_id=? AND source_id=? AND snapshot_id=?::uuid AND row_key IS NULL
          ) UPDATE doorprize.google_reader_snapshot_rows s SET row_key=p.row_key,review=p.reader_review
          FROM incoming n JOIN previous p ON p.data=n.data AND p.occurrence=n.occurrence
          WHERE s.event_id=? AND s.source_id=? AND s.snapshot_id=?::uuid AND s.row_number=n.row_number',
          [...$args,...$args,...$args]);

        // Timestamp/ID boleh kosong atau sama. Ia hanya membantu bila sisa pasangan memang tunggal.
        $this->event->database->query('WITH old_single AS (
            SELECT r.reader_anchor AS anchor,min(r.row_key::text)::uuid AS row_key
            FROM doorprize.google_rows r WHERE r.event_id=? AND r.source_id=? AND NOT r.deleted AND r.reader_anchor IS NOT NULL
              AND NOT EXISTS(SELECT 1 FROM doorprize.google_reader_snapshot_rows s WHERE s.source_id=r.source_id AND s.snapshot_id=?::uuid AND s.row_key=r.row_key)
            GROUP BY r.reader_anchor HAVING count(*)=1
          ), new_single AS (
            SELECT anchor,min(row_number) AS row_number FROM doorprize.google_reader_snapshot_rows
            WHERE event_id=? AND source_id=? AND snapshot_id=?::uuid AND row_key IS NULL AND anchor IS NOT NULL GROUP BY anchor HAVING count(*)=1
          ) UPDATE doorprize.google_reader_snapshot_rows s SET row_key=r.row_key,
            review=CASE WHEN s.data=r.source_data THEN false ELSE r.reader_review OR (r.participant_id IS NOT NULL AND lower(btrim(s.data->>\'name\')) IS DISTINCT FROM lower(btrim(COALESCE(r.incoming_data,r.source_data)->>\'name\'))) END
          FROM new_single n JOIN old_single o ON o.anchor=n.anchor JOIN doorprize.google_rows r ON r.source_id=? AND r.row_key=o.row_key
          WHERE s.event_id=? AND s.source_id=? AND s.snapshot_id=?::uuid AND s.row_number=n.row_number AND s.row_key IS NULL',
          [$this->event->id,$source,$snapshot,...$args,$source,...$args]);

        // Edit pada baris yang tersisa tidak mengambil UUID yang sudah cocok di tempat lain.
        // Pergantian nama memerlukan keputusan operator; data lama tidak ditimpa dengan tebakan.
        $this->event->database->query('WITH candidates AS (
            SELECT s.row_number,r.row_key,row_number() OVER(PARTITION BY s.row_number ORDER BY r.row_key) AS choice
            FROM doorprize.google_reader_snapshot_rows s JOIN doorprize.google_rows r ON r.source_id=s.source_id AND r.event_id=s.event_id AND r.row_number=s.row_number AND NOT r.deleted
            WHERE s.event_id=? AND s.source_id=? AND s.snapshot_id=?::uuid AND s.row_key IS NULL
              AND NOT EXISTS(SELECT 1 FROM doorprize.google_reader_snapshot_rows assigned WHERE assigned.source_id=s.source_id AND assigned.snapshot_id=s.snapshot_id AND assigned.row_key=r.row_key)
          ) UPDATE doorprize.google_reader_snapshot_rows s SET row_key=r.row_key,
            review=CASE WHEN s.data=r.source_data THEN false ELSE r.reader_review OR (r.participant_id IS NOT NULL AND lower(btrim(s.data->>\'name\')) IS DISTINCT FROM lower(btrim(COALESCE(r.incoming_data,r.source_data)->>\'name\'))) END
          FROM candidates c JOIN doorprize.google_rows r ON r.source_id=? AND r.row_key=c.row_key
          WHERE c.choice=1 AND s.event_id=? AND s.source_id=? AND s.snapshot_id=?::uuid AND s.row_number=c.row_number AND s.row_key IS NULL',
          [...$args,$source,...$args]);

        // Tidak ada kewajiban ID dari operator. UUID internal diberikan untuk setiap entri baru.
        $this->event->database->query('WITH unmatched AS (SELECT EXISTS(
            SELECT 1 FROM doorprize.google_rows old WHERE old.event_id=? AND old.source_id=? AND NOT old.deleted
              AND NOT EXISTS(SELECT 1 FROM doorprize.google_reader_snapshot_rows matched WHERE matched.source_id=old.source_id AND matched.snapshot_id=?::uuid AND matched.row_key=old.row_key)
          ) AS review) UPDATE doorprize.google_reader_snapshot_rows s SET row_key=gen_random_uuid(),review=u.review
          FROM unmatched u WHERE s.event_id=? AND s.source_id=? AND s.snapshot_id=?::uuid AND s.row_key IS NULL',[...$args,...$args]);
    }

    public function page(int $source,string $snapshot,int $after): array
    {
        $rows=$this->event->database->query('SELECT s.row_number,s.row_key,s.data,s.anchor,s.issue,s.review,
            (r.row_key IS NOT NULL AND r.source_data=s.data AND r.issue IS NULL AND NOT r.reader_review AND NOT r.locally_removed AND NOT r.deleted AND s.issue IS NULL AND NOT s.review) AS unchanged
          FROM doorprize.google_reader_snapshot_rows s LEFT JOIN doorprize.google_rows r ON r.source_id=s.source_id AND r.row_key=s.row_key
          WHERE s.event_id=? AND s.source_id=? AND s.snapshot_id=?::uuid AND s.row_number>? ORDER BY s.row_number LIMIT 201',[$this->event->id,$source,$snapshot,$after]);
        foreach($rows as &$row)if(is_string($row['data']))$row['data']=json_decode($row['data'],true,32,JSON_THROW_ON_ERROR);
        return $rows;
    }

    public function touch(int $source,string $snapshot,int $after,int $through): void
    {
        $this->event->database->query('UPDATE doorprize.google_rows r SET row_number=s.row_number,seen_snapshot=s.snapshot_id,reader_anchor=s.anchor,version=r.version+1,updated_at=now()
          FROM doorprize.google_reader_snapshot_rows s WHERE s.event_id=? AND s.source_id=? AND s.snapshot_id=?::uuid AND s.row_number>? AND s.row_number<=?
            AND r.source_id=s.source_id AND r.event_id=s.event_id AND r.row_key=s.row_key
            AND (r.row_number,r.seen_snapshot,r.reader_anchor) IS DISTINCT FROM (s.row_number,s.snapshot_id,s.anchor)',[$this->event->id,$source,$snapshot,$after,$through]);
    }

    public function hasReview(int $source,string $snapshot): bool
    {
        return (bool)$this->event->database->query('SELECT 1 FROM doorprize.google_rows WHERE event_id=? AND source_id=? AND seen_snapshot=?::uuid AND reader_review LIMIT 1',[$this->event->id,$source,$snapshot]);
    }

    public function missing(int $source,string $snapshot,string $after): array
    {
        return $this->event->database->query('SELECT row_key,row_number FROM doorprize.google_rows WHERE event_id=? AND source_id=? AND seen_snapshot IS DISTINCT FROM ?::uuid AND NOT deleted AND row_key>?::uuid ORDER BY row_key LIMIT 201',[$this->event->id,$source,$snapshot,$after]);
    }

    public function clear(int $source,string $snapshot): void
    {
        $this->event->database->query('DELETE FROM doorprize.google_reader_snapshot_rows WHERE event_id=? AND source_id=? AND snapshot_id=?::uuid',[$this->event->id,$source,$snapshot]);
    }
}
