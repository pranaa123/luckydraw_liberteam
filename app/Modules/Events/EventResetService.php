<?php

declare(strict_types=1);

namespace App\Modules\Events;

use App\Core\ApiError;
use App\Core\Input;
use App\Modules\Presentation\BackgroundStorage;

final class EventResetService
{
    public const ACTIONS = ['reset','cleanup'];
    private readonly EventResetRepository $records;

    public function __construct(private readonly EventContext $event)
    {
        $this->records = new EventResetRepository($event);
    }

    public function list(): array
    {
        $row = $this->records->summary();
        return ['event_id'=>$this->event->id,'version'=>(int) $row['version'],
            'participants'=>(int) $row['participants'],'prizes'=>(int) $row['prizes'],'winners'=>(int) $row['winners']];
    }

    public function save(string $action, array $input): array
    {
        if ($action === 'cleanup') {
            $batch = $this->records->cleanupBatch();
            if (!$batch) return ['more'=>false];
            // Storage berada di luar transaksi. Penghapusan idempoten dan antrean
            // tetap tersimpan bila jaringan gagal atau operator ditutup.
            (new BackgroundStorage())->remove($batch);
            return $this->event->database->transaction(function () use ($batch): array {
                $this->event->lock();
                return ['more'=>$this->records->cleaned($batch)];
            });
        }
        if (($input['confirmation'] ?? '') !== 'RESET') throw new ApiError('Ketik RESET untuk memulai acara baru.');
        if (Input::integer($input,'event_id') !== $this->event->id) throw EventContext::changed();
        $version = Input::integer($input,'version');
        return $this->event->database->transaction(function () use ($version): array {
            $this->event->lock();
            $row = $this->records->record();
            if ((int) $row['version'] !== $version) throw new ApiError('Data acara berubah. Buka kembali konfirmasi reset.',409);
            $cleanup = [...EventResetRepository::decode($row['asset_cleanup']),...$this->records->assets()];
            $id = $this->records->replace((int) $row['reset_generation']+1, $cleanup);
            return ['reset'=>true,'previous_event_id'=>$this->event->id,'event_id'=>$id];
        });
    }
}
