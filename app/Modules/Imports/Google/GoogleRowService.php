<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google;

use App\Modules\Events\EventContext;
use App\Modules\Participants\DuplicateRepository;

final class GoogleRowService
{
    public function __construct(private readonly EventContext $event) {}

    /** Dipanggil hanya di dalam transaksi yang sudah memegang lock acara. */
    public function apply(int $source, array $events, ?string $snapshot = null, bool $finalSnapshot = false, ?string $choice = null): array
    {
        if (!$events && !$finalSnapshot) return ['inserted' => 0,'updated' => 0,'eliminated' => 0,'changed' => 0,'linked_delta' => 0,'invalid_delta' => 0,'conflict_delta' => 0,'processed' => 0];
        $rows = new GoogleRowRepository($this->event); $duplicates = new DuplicateRepository($this->event);
        $old = $rows->current($source, array_column($events, 'row_key'));
        $plan = GoogleRowPlan::build($events, $old, $choice);
        $duplicates->capture(' AND p.id IN (SELECT value::bigint FROM jsonb_array_elements_text(?::jsonb))', [json_encode(array_column($plan['updates'], 'id'), JSON_THROW_ON_ERROR)]);
        $changed = $rows->updateParticipants($plan['updates']);
        $inserted = $rows->insertParticipants($source, $plan['inserts']); $ids = [];
        foreach ($inserted as $participant) { $ids[$participant['source_row_key']] = (int) $participant['id']; }
        foreach ($plan['rows'] as &$row) if (isset($ids[$row['row_key']])) $row['participant_id'] = $ids[$row['row_key']];
        unset($row); $rows->addWork(array_values($ids));
        $rows->remember($plan['rows'], $source, $snapshot);
        if ($finalSnapshot && $snapshot) {
            $removed = $rows->removeMissing($source, $snapshot); $changed += $removed['changed']; $plan['deleted'] += $removed['changed'];
            $plan['invalid_delta'] += $removed['invalid_delta']; $plan['conflict_delta'] += $removed['conflict_delta'];
        }
        $duplicates->reconcileWork();
        return ['inserted' => count($inserted), 'updated' => max(0, $changed - $plan['deleted']), 'eliminated' => $plan['deleted'], 'changed' => $changed + count($inserted),
          'linked_delta' => $plan['linked_delta'], 'invalid_delta' => $plan['invalid_delta'], 'conflict_delta' => $plan['conflict_delta'], 'processed' => count($events)];
    }
}
