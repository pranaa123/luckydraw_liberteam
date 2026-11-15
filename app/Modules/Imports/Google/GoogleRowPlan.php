<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google;

use App\Modules\Events\FieldSchema;

/** Three-way merge: isian sumber yang tidak berubah tidak menimpa edit operator. */
final class GoogleRowPlan
{
    public static function build(array $events, array $existing, ?string $choice = null): array
    {
        $plan = ['rows' => [], 'updates' => [], 'inserts' => [], 'invalid_delta' => 0, 'conflict_delta' => 0, 'linked_delta' => 0, 'deleted' => 0];
        foreach ($events as $event) {
            $old = $existing[$event['row_key']] ?? null;
            $row = ['row_key' => $event['row_key'], 'row_number' => $event['row_number'], 'participant_id' => $old['participant_id'] ?? null,
              'source_data' => $old['source_data'] ?? (object) [], 'source_hash' => $old['source_hash'] ?? '', 'incoming_data' => null, 'incoming_hash' => null,
              'issue' => null, 'issue_message' => null, 'deleted' => $event['operation'] === 'delete', 'locally_removed' => (bool) ($old['locally_removed'] ?? false),
              'reader_anchor'=>array_key_exists('reader_anchor',$event)?$event['reader_anchor']:($old['reader_anchor'] ?? null),
              'reader_review'=>$choice!==null?false:(bool)($event['reader_review'] ?? $old['reader_review'] ?? false)];
            $current = []; foreach (FieldSchema::KEYS as $key) $current[$key] = $old[$key] ?? null;
            if ($row['deleted']) {
                if ($row['participant_id'] && in_array($old['status'], ['available','duplicate'], true)) { $plan['updates'][] = ['id' => $row['participant_id'], ...$current, 'status' => 'eliminated']; $plan['deleted']++; }
            } else {
                $conflict = $choice===null && $row['reader_review']; $merged = $current; $data = $event['data'];
                foreach ($data as $key => $value) {
                    $before = (string) ($old['source_data'][$key] ?? ''); $local = (string) ($current[$key] ?? '');
                    if ($choice === 'remote' || !$row['participant_id'] || $before !== $value) {
                        if ($choice !== 'remote' && $row['participant_id'] && $local !== $before && $local !== $value) $conflict = true;
                        $merged[$key] = $value === '' && $key !== 'name' ? null : $value;
                    }
                }
                if ($choice === 'local' && $row['participant_id']) { $row['source_data'] = $data; $row['source_hash'] = $event['hash']; }
                elseif ($row['locally_removed'] && $choice !== 'remote') { $row['issue'] = 'local_deleted'; }
                elseif ($conflict) {
                    $row['issue'] = 'conflict';
                    if($row['reader_review'])$row['issue_message']='Perubahan baris belum dapat dicocokkan dengan pasti. Data lama tetap dipertahankan; periksa sebelum menerapkan.';
                }
                elseif ($event['issue']) { $row['issue'] = 'invalid'; $row['issue_message'] = $event['issue']; }
                else {
                    $row['locally_removed'] = false; $row['source_data'] = $data; $row['source_hash'] = $event['hash'];
                    if ($row['participant_id']) $plan['updates'][] = ['id' => $row['participant_id'], ...$merged, 'status' => $old['status']];
                    else { $plan['inserts'][] = ['row_key' => $row['row_key'], 'data' => $data, 'hash' => $event['hash']]; $plan['linked_delta']++; }
                }
                if ($row['issue']) { $row['incoming_data'] = $data; $row['incoming_hash'] = $event['hash']; }
            }
            $plan['invalid_delta'] += (int) ($row['issue'] === 'invalid') - (int) (($old['issue'] ?? '') === 'invalid');
            $plan['conflict_delta'] += (int) in_array($row['issue'], ['conflict','local_deleted'], true) - (int) in_array($old['issue'] ?? '', ['conflict','local_deleted'], true);
            $plan['rows'][] = $row;
        }
        return $plan;
    }
}
