<?php

declare(strict_types=1);

namespace App\Modules\Events;

use App\Core\ApiError;
use App\Core\Input;

final class FieldService
{
    private readonly FieldRepository $records;
    public function __construct(private readonly EventContext $event) { $this->records = new FieldRepository($event); }

    public function list(): array { return ['items' => $this->records->all()]; }

    public function save(string $action, array $input): array
    {
        return $this->event->mutate('field', $action, function () use ($action, $input): array {
            $id = $action === 'create' ? null : Input::integer($input, 'id');
            $old = $id === null ? null : $this->event->current($this->records->find($id), $input);
            if ($action === 'delete') {
                if ($old['use_for_duplicates']) throw new ApiError('Nonaktifkan kunci duplikasi pada isian ini sebelum menghapusnya.', 409);
                $this->records->delete($id, (int) $old['slot']);
                return ['id' => $id, 'deleted' => true];
            }
            $label = Input::text($input, 'label', 80);
            if (strtolower($label) === 'nama') throw new ApiError('Nama sudah tersedia sebagai isian default.');
            $fields = $this->records->all();
            foreach ($fields as $field) {
                if ((int) $field['id'] !== $id && strtolower($field['label']) === strtolower($label)) throw new ApiError('Label isian sudah digunakan.');
            }
            $free = array_values(array_diff(FieldSchema::SLOTS, array_column($fields, 'slot')));
            if ($id === null && !$free) throw new ApiError('Maksimal ' . FieldSchema::MAX_ADDITIONAL . ' isian tambahan.');
            return $this->records->save($id, $label, (int) ($old['slot'] ?? $free[0]));
        });
    }
}
