<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Modules\Events\FieldSchema;

use App\Core\ApiError;
use App\Core\Input;
use App\Modules\Events\EventContext;
use App\Modules\Events\FieldRepository;

final class ParticipantService
{
    public const ACTIONS = ['create', 'update', 'delete', 'query'];
    private readonly ParticipantRepository $records;
    public function __construct(private readonly EventContext $event) { $this->records = new ParticipantRepository($event); }

    public function list(): array
    {
        $after = filter_var($_GET['after'] ?? 0, FILTER_VALIDATE_INT, ['options' => ['min_range' => 0]]);
        if ($after === false) throw new ApiError('Halaman peserta tidak valid.');
        $rows = $this->records->page($after);
        $more = count($rows) > 50;
        $rows = array_slice($rows, 0, 50);
        return ['items' => $rows, 'next' => $more ? (int) $rows[49]['id'] : null, 'summary' => $this->records->summary()];
    }

    public function save(string $action, array $input): array
    {
        if ($action === 'query') return $this->query($input);
        return $this->event->mutate('participant', $action, function () use ($action, $input): array {
            $duplicates = new DuplicateRepository($this->event);
            $id = $action === 'create' ? null : Input::integer($input, 'id');
            $old = $id === null ? null : $this->event->current($this->records->find($id), $input);
            if ($action === 'delete') {
                if ($this->records->referenced($id)) throw new ApiError('Peserta sudah tercatat dalam undian dan tidak dapat dihapus.', 409);
                (new \App\Modules\Imports\Google\GoogleRowRepository($this->event))->detach($id);
                $duplicates->prepareDelete($id);
                $this->records->delete($id);
                $duplicates->reconcileKeys([$old['duplicate_key']], []);
                return ['id' => $id, 'deleted' => true];
            }
            $status = $input['status'] ?? 'available';
            if (!in_array($status, ['available', 'eliminated'], true) && $status !== ($old['status'] ?? null)) throw new ApiError('Status peserta tidak valid.');
            if ($old && in_array($old['status'], ['winner', 'duplicate'], true) && $status !== $old['status']) throw new ApiError('Status ini dikelola oleh proses undian atau aturan duplikasi.', 409);
            $fields = (new FieldRepository($this->event))->all();
            $schema = implode(',', array_map(static fn (array $field): string => $field['id'] . ':' . $field['slot'] . ':' . $field['version'], $fields));
            if (($input['field_schema'] ?? null) !== $schema) throw new ApiError('Isian undian sudah berubah. Tutup formulir dan buka kembali sebelum menyimpan.', 409);
            $allowed = array_column($fields, 'slot');
            $values = [Input::text($input, 'name')];
            foreach (FieldSchema::SLOTS as $slot) {
                $value = Input::text($input, 'field_' . $slot, 200, false);
                if ($value !== '' && !in_array($slot, $allowed, true)) throw new ApiError('Isian peserta sudah berubah. Muat ulang daftar.', 409);
                $values[] = $value === '' ? null : $value;
            }
            $saved = $this->records->save($id, [...$values, $status]);
            $duplicates->reconcileKeys([$old['duplicate_key'] ?? null, $saved['duplicate_key']], [(int) $saved['id']]);
            $result = $this->records->find((int) $saved['id'])[0]; unset($result['duplicate_key']);
            return $result;
        });
    }

    private function query(array $input): array
    {
        return $this->event->database->transaction(function () use ($input): array {
            $fields = (new FieldRepository($this->event))->all();
            $query = ParticipantQuery::normalize($input, $fields);
            $records = new ParticipantQueryRepository($this->event);
            $rows = $records->page($query, Input::integer($input, 'after', 0));
            $summary = ($input['include_summary'] ?? true) ? $records->summary($query) : null;
            return [...$records->metadata(), 'field_schema' => ParticipantFilter::schema($fields), 'items' => array_slice($rows, 0, 50),
              'next' => count($rows) > 50 ? (int) $rows[49]['id'] : null, 'summary' => $summary];
        }, readOnlySnapshot: true);
    }
}
