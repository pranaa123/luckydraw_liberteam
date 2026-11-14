<?php

declare(strict_types=1);

namespace App\Modules\Draws;

use App\Core\ApiError;
use App\Core\Input;
use App\Modules\Events\EventContext;
use App\Modules\Prizes\PrizeRepository;
use App\Modules\Events\FieldRepository;
use App\Modules\Participants\ParticipantFilter;
use App\Modules\Participants\DrawFilterPoolRepository;

final class DrawService
{
    public const ACTIONS = ['start', 'stop', 'confirm', 'eliminate', 'clear'];
    private readonly DrawRepository $records;
    public function __construct(private readonly EventContext $event) { $this->records = new DrawRepository($event); }
    public function list(): array { return $this->records->state(); }

    public function save(string $action, array $input): array
    {
        return $this->event->database->transaction(function () use ($action, $input): array {
            $event = $this->records->lock();
            if ($action === 'start') return $this->start($input, $event);
            $id = Input::integer($input, 'draw_id');
            $draw = $this->records->find($id) ?? throw new ApiError('Putaran undian tidak ditemukan.', 404);
            $state = $this->records->state();
            // Pengulangan request tidak mengubah status/stok dua kali atau menghapus layar putaran baru.
            if (($action === 'stop' && $draw['phase'] === 'result')
                || ($action === 'confirm' && $draw['status'] === 'confirmed')
                || ($action === 'eliminate' && $draw['status'] === 'eliminated')
                || ($action === 'clear' && ($state['draw']['id'] ?? null) !== $id && $draw['status'] !== 'pending')) return $state;
            if (($state['draw']['id'] ?? null) !== $id) throw new ApiError('Putaran aktif sudah berubah. Muat ulang kontrol.', 409);
            $participants = []; $prizes = [];
            if ($action === 'clear') {
                if ($draw['status'] === 'pending') $this->records->resolve($id, 'cleared', true);
                else $this->records->clearDisplay($id);
            } else {
                if ($draw['status'] !== 'pending') throw new ApiError('Putaran sudah diselesaikan.', 409);
                if ($action === 'stop') $this->stop($draw);
                else {
                    if ($draw['phase'] !== 'result') throw new ApiError('Hentikan pengacakan sebelum menyelesaikan hasil.', 409);
                    $selected = $this->records->selected($id);
                    if (count($selected) !== (int) $draw['requested_count'] || array_filter($selected, static fn ($person) => $person['status'] !== 'available')) {
                        throw new ApiError('Kelayakan peserta berubah. Kosongkan hasil dan ulangi undian.', 409);
                    }
                    if ($action === 'confirm') {
                        $assigned = $this->records->assignedPrizes($id);
                        foreach ($assigned as $prize) if ((int) $prize['remaining_quantity'] < (int) $prize['quantity']) throw new ApiError('Stok hadiah berubah. Kosongkan hasil dan ulangi undian.', 409);
                        $prizes = $this->records->consumePrizes($id);
                    }
                    $participants = $this->records->changeParticipants($id, $action === 'confirm' ? 'winner' : 'eliminated');
                    $this->records->resolve($id, $action === 'confirm' ? 'confirmed' : 'eliminated', $action === 'eliminate');
                }
            }
            $this->records->audit($action, $id);
            return [...$this->records->state(), 'participant_updates' => $participants, 'prize_updates' => $prizes];
        });
    }

    private function start(array $input, array $event): array
    {
        $count = Input::integer($input, 'winner_count');
        $mode = $input['prize_mode'] ?? '';
        if (!in_array($mode, ['none', 'random', 'selected'], true)) throw new ApiError('Mode hadiah tidak valid.');
        $requested = PrizeAllocation::requested($input);
        if ($mode !== 'selected' && $requested) throw new ApiError('Pembagian manual hanya untuk mode Tentukan hadiah.');
        $key = Input::text($input, 'request_id', 36);
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iD', $key)) throw new ApiError('Identitas permintaan tidak valid.');
        $fields = (new FieldRepository($this->event))->all();
        $previous = is_array($event['draw_filters']) ? $event['draw_filters'] : json_decode($event['draw_filters'], true, 512, JSON_THROW_ON_ERROR);
        $filters = ParticipantFilter::normalize($input['filters'] ?? $previous, $fields);
        if (isset($input['field_schema']) && $input['field_schema'] !== ParticipantFilter::schema($fields)) throw new ApiError('Isian filter sudah berubah. Muat ulang filter sebelum mengundi.', 409);
        $hash = hash('sha256', json_encode([$count, $mode, $requested, (object) $filters], JSON_THROW_ON_ERROR));
        $existing = $this->records->byKey($key);
        if ($existing) {
            if ($existing['request_hash'] !== $hash) throw new ApiError('Identitas permintaan sudah digunakan untuk pengaturan lain.', 409);
            return $this->records->state();
        }
        if (($input['version'] ?? null) !== (int) $event['draw_version']) throw new ApiError('Kontrol undian sudah berubah. Muat ulang sebelum memulai.', 409);
        if ($this->records->pending()) throw new ApiError('Selesaikan hasil undian aktif terlebih dahulu.', 409);
        if ((new \App\Modules\Imports\Google\GoogleSourceRepository($this->event))->hasInitial()) throw new ApiError('Tunggu sinkronisasi awal Google Sheets selesai sebelum mengundi.',409);
        (new DrawFilterPoolRepository($this->event))->prepare($filters, $previous);
        $capacity = $this->records->capacity($filters);
        if ($count > $capacity) throw new ApiError('Jumlah nama melebihi peserta tersedia yang cocok dengan filter.');
        $prizes = $mode === 'none' ? [] : (new PrizeRepository($this->event))->all();
        $allocation = PrizeAllocation::prepare($mode, $count, $requested, $prizes);
        $map = array_column($prizes, null, 'id');
        foreach ($allocation as &$item) $item['name'] = $map[$item['prize_id']]['name'];
        unset($item);
        $definitions = array_map(static fn ($field) => ['slot' => $field['slot'], 'label' => $field['label']], $fields);
        $id = $this->records->create([$mode, $count, $key, random_int(0, 4294967295), '[]', json_encode($allocation, JSON_THROW_ON_ERROR), json_encode($definitions, JSON_THROW_ON_ERROR), $hash, ParticipantFilter::json($filters)]);
        $this->records->display($id, $count, $mode, $requested, $filters);
        $this->records->audit('start', $id);
        return $this->records->state();
    }

    private function stop(array $draw): void
    {
        $count = (int) $draw['requested_count'];
        $filters = is_array($draw['filters']) ? $draw['filters'] : json_decode($draw['filters'], true, 512, JSON_THROW_ON_ERROR);
        $capacity = $this->records->capacity($filters);
        if ($capacity < $count) throw new ApiError('Peserta tersedia tidak lagi mencukupi. Kosongkan putaran.', 409);
        $people = $this->records->participants(RandomSelection::positions($capacity, $count), $filters);
        if (count($people) !== $count) throw new ApiError('Kelayakan peserta berubah. Kosongkan putaran.', 409);
        $allocation = is_array($draw['allocation']) ? $draw['allocation'] : json_decode($draw['allocation'], true, 512, JSON_THROW_ON_ERROR);
        $assignments = PrizeAllocation::assignments($allocation);
        $prizeNames = array_column($allocation, 'name', 'prize_id');
        $entries = [];
        foreach ($people as $index => $person) {
            $prizeId = $assignments[$index] ?? null;
            unset($person['status']);
            $entries[] = ['participant_id' => (int) $person['id'], 'position' => $index + 1, 'prize_id' => $prizeId, 'participant_snapshot' => $person, 'prize_name_snapshot' => $prizeId ? $prizeNames[$prizeId] : null];
        }
        $this->records->saveEntries((int) $draw['id'], $entries);
    }
}
