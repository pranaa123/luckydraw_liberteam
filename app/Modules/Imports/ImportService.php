<?php

declare(strict_types=1);

namespace App\Modules\Imports;

use App\Core\ApiError;
use App\Core\Input;
use App\Modules\Events\FieldRepository;
use App\Modules\Events\EventContext;
use App\Modules\Participants\DuplicatePolicy;
use App\Modules\Participants\DuplicateRepository;
use App\Modules\Participants\DuplicateService;
use App\Modules\Participants\ParticipantFilter;

final class ImportService
{
    public const ACTIONS = ['create', 'chunk', 'preview', 'rows', 'commit', 'cancel'];
    private readonly ImportRepository $records;
    public function __construct(private readonly EventContext $event) { $this->records = new ImportRepository($event); }

    public function list(): array
    {
        $rules = (new DuplicateService($this->event))->list();
        return [...$rules, ...$this->records->eventInfo()];
    }

    public function save(string $action, array $input): array
    {
        $id = $input['batch_id'] ?? '';
        if (!is_string($id) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iD', $id)) throw new ApiError('Sesi import tidak valid.');
        return $this->event->database->transaction(function () use ($action, $input, $id): array {
            if (in_array($action, ['preview', 'commit'], true)) $this->records->lockEvent();
            $fields = (new FieldRepository($this->event))->all();
            if ($action === 'create') {
                $mapping = $input['mapping'] ?? null;
                if (!is_array($mapping) || array_is_list($mapping) || !isset($mapping['name'])) throw new ApiError('Tentukan kolom Nama.');
                $allowed = ['name', ...array_map(static fn ($f) => 'field_' . $f['slot'], $fields)];
                foreach ($mapping as $key => $column) if (!in_array($key, $allowed, true) || !is_int($column) || $column < 1 || $column > 16384) throw new ApiError('Pemetaan kolom tidak valid.');
                if (count(array_unique($mapping)) !== count($mapping)) throw new ApiError('Satu kolom Excel hanya boleh dipakai untuk satu isian.');
                ksort($mapping);
                $data = ['filename' => Input::text($input, 'filename', 255), 'sheet_name' => Input::text($input, 'sheet_name', 100),
                  'field_schema' => $input['field_schema'] ?? '', 'mapping' => $mapping, 'keys' => DuplicatePolicy::keys($input['keys'] ?? null, $fields),
                  'expected_rows' => Input::integer($input, 'expected_rows', 1, 100000)];
                $this->assertSchema($data, $fields);
                $hash = hash('sha256', json_encode($data, JSON_THROW_ON_ERROR));
                $this->records->create($id, $data, $hash);
                $batch = $this->batch($id);
                if ($batch['request_hash'] !== $hash) throw new ApiError('Sesi import sudah dipakai untuk berkas lain.', 409);
                return ['batch_id' => $id, 'uploaded_rows' => (int) $batch['uploaded_rows']];
            }
            if ($action === 'cancel') { $this->records->cancel($id); return ['cancelled' => true]; }
            $batch = $this->batch($id);
            if ($action === 'commit' && $batch['status'] === 'committed') return ['committed' => true, 'summary' => $batch['summary']];
            $this->assertSchema($batch, $fields);
            if ($action === 'chunk') {
                $number = Input::integer($input, 'chunk_number', 0, 100000);
                $rows = ImportRows::normalize($input['rows'] ?? null, $fields, $number < (int) $batch['next_chunk'] ? 0 : (int) $batch['next_row']);
                return $this->records->chunk($batch, $number, $rows, hash('sha256', json_encode($rows, JSON_THROW_ON_ERROR)));
            }
            if ($action === 'rows') {
                if ($batch['status'] !== 'ready') throw new ApiError('Buat pratinjau terlebih dahulu.', 409);
                $rows = $this->records->rows($id, Input::integer($input, 'after', 0, 1048576));
                return ['items' => array_slice($rows, 0, 50), 'next' => count($rows) > 50 ? (int) $rows[49]['row_number'] : null];
            }
            $duplicates = new DuplicateRepository($this->event); $policy = $duplicates->policy();
            $changed = $batch['duplicate_keys'] !== DuplicatePolicy::decode($policy['duplicate_keys']);
            if ($action === 'preview') {
                if ($batch['status'] === 'committed' || (int) $batch['uploaded_rows'] !== (int) $batch['expected_rows']) throw new ApiError('Pengiriman berkas belum selesai.', 409);
                $summary = (new ImportPreviewRepository($this->event))->build($batch, $changed);
                return ['summary' => $summary, ...$this->records->previewReady($id, $policy, $summary)];
            }
            if ($batch['status'] !== 'ready' || ($input['preview_revision'] ?? null) !== (int) $batch['preview_revision']) throw new ApiError('Buat pratinjau sebelum import.', 409);
            if ((int) $policy['participants_version'] !== (int) $batch['participants_version'] || (int) $policy['duplicate_rule_version'] !== (int) $batch['rule_version']) throw new ApiError('Peserta/aturan sudah berubah. Perbarui pratinjau sebelum import.', 409);
            if (!$batch['summary']['valid']) throw new ApiError('Tidak ada baris yang valid untuk diimport.');
            if ($this->records->hasPendingDraw()) throw new ApiError('Selesaikan hasil undian sebelum import.', 409);
            if ($changed) $duplicates->setPolicy($batch['duplicate_keys']);
            $source = $this->records->insertParticipants($batch);
            if ($changed) $duplicates->reconcile(); else $duplicates->reconcileSource($source);
            $summary = [...$batch['summary'], 'imported' => (int) $batch['summary']['valid']];
            $this->records->complete($batch, $source, $summary);
            return ['committed' => true, 'summary' => $summary];
        });
    }

    private function batch(string $id): array
    {
        $batch = $this->records->batch($id);
        foreach (['duplicate_keys', 'mapping', 'summary'] as $key) $batch[$key] = DuplicatePolicy::decode($batch[$key]);
        return $batch;
    }

    private function assertSchema(array $batch, array $fields): void
    {
        if ($batch['field_schema'] !== ParticipantFilter::schema($fields)) throw new ApiError('Isian undian sudah berubah. Tutup import dan buka kembali agar pemetaan sesuai.', 409);
    }
}
