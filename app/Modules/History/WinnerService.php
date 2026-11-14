<?php

declare(strict_types=1);

namespace App\Modules\History;

use App\Modules\Events\FieldSchema;
use App\Core\ApiError;
use App\Modules\Events\EventContext;

final class WinnerService
{
    public function __construct(private readonly EventContext $event) {}

    public function list(): array
    {
        $afterDraw = $this->number('after_draw'); $afterPosition = $this->number('after_position');
        $export = $_GET['export'] ?? '0';
        if (!in_array($export, ['0','1'], true)) throw new ApiError('Pilihan laporan tidak valid.');
        $limit = $export === '1' ? 500 : 50;
        $records = new WinnerRepository($this->event); $meta = null;
        if (array_key_exists('snapshot', $_GET)) {
            $snapshot = $this->number('snapshot');
            if (!$records->hasSnapshot($snapshot)) throw new ApiError('Versi daftar pemenang tidak valid. Muat ulang daftar.', 422);
        } else {
            if ($afterDraw !== 0 || $afterPosition !== 0) throw new ApiError('Muat daftar pemenang dari awal.');
            $row = $records->snapshot(); $snapshot = (int) $row['snapshot'];
            $meta = ['client_name' => $row['client_name'] ?? '', 'event_name' => $row['event_name'] ?? '',
              'event_at' => $row['event_at'] ? (new \DateTimeImmutable($row['event_at']))->format(DATE_ATOM) : null,
              'timezone' => date_default_timezone_get(), 'total' => (int) $row['total'], 'rounds' => (int) $row['rounds']];
        }
        if ($afterDraw > $snapshot || (($afterDraw === 0) !== ($afterPosition === 0))) throw new ApiError('Halaman pemenang tidak valid.');
        $rows = $snapshot === 0 ? [] : $records->page($snapshot, $afterDraw, $afterPosition, $limit);
        $next = count($rows) > $limit ? ['draw_id' => (int) $rows[$limit - 1]['draw_id'], 'position' => (int) $rows[$limit - 1]['position']] : null;
        $items = array_map(static function (array $row): array {
            $decode = static fn ($value): array => is_array($value) ? $value : json_decode($value, true, 32, JSON_THROW_ON_ERROR);
            $participant = $decode($row['participant_snapshot']);
            return ['id' => (int) $row['id'], 'draw_id' => (int) $row['draw_id'], 'position' => (int) $row['position'],
              'sequence_number' => (int) $row['sequence_number'], 'confirmed_at' => $row['resolved_at'],
              'participant' => array_intersect_key($participant, array_flip(FieldSchema::KEYS)),
              'prize_name' => $row['prize_name'] ?? '', 'fields' => $decode($row['field_definitions'])];
        }, array_slice($rows, 0, $limit));
        return ['items' => $items, 'next' => $next, 'snapshot' => $snapshot, ...($meta === null ? [] : ['meta' => $meta])];
    }

    private function number(string $key): int
    {
        $value = filter_var($_GET[$key] ?? '0', FILTER_VALIDATE_INT, ['options' => ['min_range' => 0, 'max_range' => $key === 'after_position' ? 2147483647 : PHP_INT_MAX]]);
        if ($value === false) throw new ApiError('Halaman pemenang tidak valid.');
        return $value;
    }
}
