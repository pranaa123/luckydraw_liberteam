<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Core\ApiError;
use App\Core\Input;
use App\Modules\Events\FieldRepository;
use App\Modules\Events\EventContext;

final class ParticipantBulkService
{
    public const ACTIONS = ['update'];
    public function __construct(private readonly EventContext $event) {}

    public function save(string $action, array $input): array
    {
        return $this->event->mutate('participant_batch', 'update', function () use ($input): array {
            $fields = (new FieldRepository($this->event))->all();
            if (($input['field_schema'] ?? null) !== ParticipantFilter::schema($fields)) throw new ApiError('Isian peserta sudah berubah. Muat ulang daftar sebelum edit massal.', 409);
            $changes = $input['changes'] ?? null;
            if (!is_array($changes) || !$changes || array_is_list($changes)) throw new ApiError('Pilih isian yang akan diubah.');
            $allowed = ['name', 'status', ...array_map(static fn ($field) => 'field_' . $field['slot'], $fields)];
            $normalized = [];
            foreach ($changes as $key => $value) {
                if (!in_array($key, $allowed, true)) throw new ApiError('Isian edit massal tidak valid.');
                if ($key === 'status') {
                    if (!in_array($value, ['available', 'eliminated'], true)) throw new ApiError('Status ini dikelola oleh proses undian atau aturan duplikasi.');
                } else {
                    $value = Input::text([$key => $value], $key, 200, $key === 'name');
                    if ($key !== 'name' && $value === '') $value = null;
                }
                $normalized[$key] = $value;
            }
            $selection = $input['selection'] ?? null;
            if (!is_array($selection)) throw new ApiError('Pilih peserta terlebih dahulu.');
            [$where, $parameters, $expected] = $this->selection($selection, $fields);
            $records = new ParticipantBulkRepository($this->event);
            $count = $records->count($where, $parameters);
            if ($expected !== null && $expected !== $count) throw new ApiError('Peserta yang dipilih sudah berubah. Muat ulang dan pilih kembali.', 409);
            if (!$count) throw new ApiError('Tidak ada peserta yang dipilih.');
            if (isset($normalized['status']) && $records->hasProtectedStatus($where, $parameters)) {
                throw new ApiError('Status pemenang/duplikat dikelola oleh proses undian/duplikasi. Batasi pilihan pada Tersedia atau Tereliminasi.', 409);
            }
            $duplicates = new DuplicateRepository($this->event);
            $active = (bool) DuplicatePolicy::decode($duplicates->policy()['duplicate_keys']);
            if ($active) $duplicates->capture($where, $parameters);
            $updated = $records->update($normalized, $where, $parameters);
            if ($active) $duplicates->reconcileWork();
            return ['id' => $this->event->id, 'updated_count' => $updated, 'selected_count' => $count, 'changes' => $normalized];
        });
    }

    private function selection(array $selection, array $fields): array
    {
        if (($selection['mode'] ?? '') === 'query') {
            $version = (new ParticipantQueryRepository($this->event))->metadata()['participants_version'];
            if (($selection['participants_version'] ?? null) !== (int) $version) throw new ApiError('Daftar peserta sudah berubah. Muat ulang dan pilih semua hasil kembali.', 409);
            $query = $selection['query'] ?? null;
            if (!is_array($query)) throw new ApiError('Pilihan hasil filter tidak valid.');
            $excluded = $selection['excluded_ids'] ?? [];
            if (!is_array($excluded) || !array_is_list($excluded)) throw new ApiError('Pengecualian pilihan tidak valid.');
            foreach ($excluded as $id) if (!is_int($id) || $id < 1) throw new ApiError('Pengecualian pilihan tidak valid.');
            return [...ParticipantBulkRepository::selectedQuery(ParticipantQuery::normalize($query, $fields), $excluded), null];
        }
        $items = $selection['items'] ?? null;
        if (($selection['mode'] ?? '') !== 'ids' || !is_array($items) || !array_is_list($items) || !$items) throw new ApiError('Pilih peserta terlebih dahulu.');
        $ids = [];
        foreach ($items as $item) {
            if (!is_array($item)) throw new ApiError('Pilihan peserta tidak valid.');
            $id = Input::integer($item, 'id'); Input::integer($item, 'version');
            if (isset($ids[$id])) throw new ApiError('Peserta yang sama tidak boleh dipilih dua kali.');
            $ids[$id] = true;
        }
        return [...ParticipantBulkRepository::selectedIds($items), count($items)];
    }
}
