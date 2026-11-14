<?php

declare(strict_types=1);

namespace App\Modules\History;

use App\Core\ApiError;
use App\Modules\Events\EventContext;

final class HistoryService
{
    public function __construct(private readonly EventContext $event) {}
    public function list(): array
    {
        $before = filter_var($_GET['before'] ?? PHP_INT_MAX, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($before === false) throw new ApiError('Halaman riwayat tidak valid.');
        $rows = (new HistoryRepository($this->event))->page($before);
        $next = count($rows) > 50 ? (int) $rows[49]['id'] : null;
        return ['items' => array_slice($rows, 0, 50), 'next' => $next];
    }
}
