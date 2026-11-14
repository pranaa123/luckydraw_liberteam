<?php

declare(strict_types=1);

namespace App\Modules\Prizes;

use App\Modules\Events\EventContext;

final class PrizeRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function all(): array
    {
        return $this->event->database->query('SELECT id, name, initial_quantity, remaining_quantity, sort_order, background_path, version FROM doorprize.prizes WHERE event_id = ? ORDER BY (remaining_quantity = 0), sort_order, id', [$this->event->id]);
    }

    public function find(int $id): array
    {
        return $this->event->database->query('SELECT id, name, initial_quantity, remaining_quantity, sort_order, background_path, version FROM doorprize.prizes WHERE event_id = ? AND id = ? FOR UPDATE', [$this->event->id, $id]);
    }

    public function save(?int $id, string $name, int $quantity, int $used): array
    {
        if ($id === null) {
            return $this->event->database->query('INSERT INTO doorprize.prizes (event_id, name, initial_quantity, remaining_quantity, sort_order) VALUES (?, ?, ?, ?, (SELECT COALESCE(max(sort_order), 0) + 1 FROM doorprize.prizes WHERE event_id = ?)) RETURNING id, name, initial_quantity, remaining_quantity, sort_order, background_path, version', [$this->event->id, $name, $quantity, $quantity, $this->event->id])[0];
        }
        return $this->event->database->query('UPDATE doorprize.prizes SET name = ?, initial_quantity = ?, remaining_quantity = ?, version = version + 1, updated_at = now() WHERE event_id = ? AND id = ? RETURNING id, name, initial_quantity, remaining_quantity, sort_order, background_path, version', [$name, $quantity, $quantity - $used, $this->event->id, $id])[0];
    }

    public function setBackground(int $id, ?string $path): array
    {
        return $this->event->database->query('UPDATE doorprize.prizes SET background_path = ?, version = version + 1, updated_at = now() WHERE event_id = ? AND id = ? RETURNING id, name, initial_quantity, remaining_quantity, sort_order, background_path, version', [$path, $this->event->id, $id])[0];
    }

    public function adjacent(array $record, string $direction): ?array
    {
        $comparison = $direction === 'up' ? '<' : '>';
        $order = $direction === 'up' ? 'DESC' : 'ASC';
        return $this->event->database->query("SELECT id, sort_order FROM doorprize.prizes WHERE event_id = ? AND CASE WHEN remaining_quantity = 0 THEN 1 ELSE 0 END = ? AND (sort_order, id) {$comparison} (?, ?) ORDER BY sort_order {$order}, id {$order} LIMIT 1 FOR UPDATE", [$this->event->id, (int) ((int) $record['remaining_quantity'] === 0), $record['sort_order'], $record['id']])[0] ?? null;
    }

    public function swap(array $first, array $second): array
    {
        return $this->event->database->query('UPDATE doorprize.prizes SET sort_order = CASE WHEN id = ? THEN ?::integer ELSE ?::integer END, version = version + 1, updated_at = now() WHERE event_id = ? AND id IN (?, ?) RETURNING id, name, initial_quantity, remaining_quantity, sort_order, background_path, version', [$first['id'], $second['sort_order'], $first['sort_order'], $this->event->id, $first['id'], $second['id']]);
    }

    public function referenced(int $id): bool
    {
        return (bool) $this->event->database->query('SELECT id FROM doorprize.draw_entries WHERE event_id = ? AND prize_id = ? LIMIT 1', [$this->event->id, $id]);
    }

    public function delete(int $id): void
    {
        $this->event->database->query('DELETE FROM doorprize.prizes WHERE event_id = ? AND id = ?', [$this->event->id, $id]);
    }
}
