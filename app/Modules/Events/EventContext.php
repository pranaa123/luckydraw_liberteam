<?php

declare(strict_types=1);

namespace App\Modules\Events;

use App\Core\ApiError;
use App\Core\Database;

/** Acara milik pengguna yang telah diverifikasi; satu konteks per request. */
final class EventContext
{
    public readonly int $id;

    public function __construct(public readonly Database $database, public readonly string $ownerId)
    {
        $rows = $database->query('SELECT id FROM doorprize.events WHERE owner_id = ? ORDER BY id LIMIT 1', [$this->ownerId]);
        $this->id = isset($rows[0]) ? (int) $rows[0]['id'] : $database->transaction(function () use ($database): int {
            $database->query('SELECT pg_advisory_xact_lock(8091)');
            $rows = $database->query('SELECT id FROM doorprize.events WHERE owner_id = ? ORDER BY id LIMIT 1', [$this->ownerId]);
            return (int) ($rows[0]['id'] ?? $database->query('INSERT INTO doorprize.events (owner_id) VALUES (?) RETURNING id', [$this->ownerId])[0]['id']);
        });
    }

    public function mutate(string $type, string $action, callable $operation): array
    {
        return $this->database->transaction(function () use ($type, $action, $operation): array {
            $this->database->query('SELECT id FROM doorprize.events WHERE id = ? FOR UPDATE', [$this->id]);
            if ($this->database->query("SELECT id FROM doorprize.draws WHERE event_id = ? AND status = 'pending' LIMIT 1", [$this->id])) {
                throw new ApiError('Selesaikan hasil undian sebelum mengubah data.', 409);
            }
            $result = $operation();
            $this->database->query('UPDATE doorprize.events SET version = version + 1, updated_at = now() WHERE id = ?', [$this->id]);
            $this->database->query('INSERT INTO doorprize.audit_log (event_id, actor_id, action, entity_type, entity_id, changes) VALUES (?, ?, ?, ?, ?, ?::jsonb)', [
                $this->id, $this->ownerId, $action, $type, $result['id'], json_encode($result, JSON_THROW_ON_ERROR),
            ]);
            return $result;
        });
    }

    public function current(array $rows, array $input): array
    {
        $record = $rows[0] ?? throw new ApiError('Data tidak ditemukan. Muat ulang daftar.', 404);
        if ((int) $record['version'] !== ($input['version'] ?? null)) throw new ApiError('Data sudah berubah. Muat ulang daftar sebelum mengedit.', 409);
        return $record;
    }
}
