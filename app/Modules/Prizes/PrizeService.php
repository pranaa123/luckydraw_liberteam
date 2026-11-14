<?php

declare(strict_types=1);

namespace App\Modules\Prizes;

use App\Core\ApiError;
use App\Core\Input;
use App\Modules\Events\EventContext;

final class PrizeService
{
    public const ACTIONS = ['create', 'update', 'delete', 'reorder'];
    private readonly PrizeRepository $records;
    public function __construct(private readonly EventContext $event) { $this->records = new PrizeRepository($event); }

    public function list(): array { return ['items' => $this->records->all()]; }

    public function save(string $action, array $input): array
    {
        return $this->event->mutate('prize', $action, function () use ($action, $input): array {
            $id = $action === 'create' ? null : Input::integer($input, 'id');
            $old = $id === null ? null : $this->event->current($this->records->find($id), $input);
            if ($action === 'reorder') {
                $direction = $input['direction'] ?? '';
                if (!in_array($direction, ['up', 'down'], true)) throw new ApiError('Arah pemindahan hadiah tidak valid.');
                $adjacent = $this->records->adjacent($old, $direction);
                return ['id' => $id, 'items' => $adjacent ? $this->records->swap($old, $adjacent) : [$old]];
            }
            if ($action === 'delete') {
                if ($this->records->referenced($id)) throw new ApiError('Hadiah sudah tercatat dalam undian dan tidak dapat dihapus.', 409);
                $this->records->delete($id);
                return ['id' => $id, 'deleted' => true];
            }
            $quantity = Input::integer($input, 'quantity', 0);
            $used = $old ? (int) $old['initial_quantity'] - (int) $old['remaining_quantity'] : 0;
            if ($quantity < $used) throw new ApiError('Jumlah hadiah tidak boleh lebih kecil dari jumlah yang sudah disahkan.');
            return $this->records->save($id, Input::text($input, 'name'), $quantity, $used);
        });
    }
}
