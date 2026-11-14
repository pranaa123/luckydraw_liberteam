<?php

declare(strict_types=1);

namespace App\Modules\Events;

use App\Core\ApiError;
use App\Core\Input;
use App\Modules\Presentation\BackgroundAsset;
use App\Modules\Prizes\PrizeRepository;

final class SettingsService
{
    public const ACTIONS = ['update'];
    private readonly SettingsRepository $records;

    public function __construct(private readonly EventContext $event) { $this->records = new SettingsRepository($event); }

    public function list(): array { return $this->records->view($this->records->record()); }

    public function save(string $action, array $input): array
    {
        return $this->event->mutate('settings', $action, function () use ($input): array {
            $old = $this->records->record();
            if ((int) $old['settings_version'] !== ($input['settings_version'] ?? null)) throw new ApiError('Pengaturan sudah berubah pada operator lain. Muat ulang sebelum menyimpan.', 409);
            if (!is_bool($input['show_event_info'] ?? null)) throw new ApiError('Pilihan informasi acara tidak valid.');
            $value = [
                'client_name' => Input::text($input, 'client_name', 200, false),
                'event_name' => Input::text($input, 'event_name', 200, false),
                'show_event_info' => $input['show_event_info'],
            ];
            $date = Input::text($input, 'event_at', 16, false);
            $parsed = $date === '' ? null : \DateTimeImmutable::createFromFormat('!Y-m-d\TH:i', $date, new \DateTimeZone(date_default_timezone_get()));
            if ($date !== '' && (!$parsed || $parsed->format('Y-m-d\TH:i') !== $date)) throw new ApiError('Waktu acara tidak valid.');
            $visual = VisualSettings::validate($input['visual'] ?? null);
            $assets = new BackgroundAsset($this->event);
            $assets->owned($visual['background_image']);
            $changes = $input['prize_backgrounds'] ?? [];
            if (!is_array($changes) || !array_is_list($changes)) throw new ApiError('Daftar background hadiah tidak valid.');
            $prizes = new PrizeRepository($this->event);
            $updates = [];
            $seen = [];
            foreach ($changes as $change) {
                if (!is_array($change)) throw new ApiError('Background hadiah tidak valid.');
                $id = Input::integer($change, 'id');
                if (isset($seen[$id])) throw new ApiError('Hadiah yang sama tidak boleh dikirim dua kali.');
                $seen[$id] = true;
                $this->event->current($prizes->find($id), $change);
                $updates[] = $prizes->setBackground($id, $assets->owned($change['path'] ?? null));
            }
            $row = $this->records->save($value, $visual, $parsed?->format(DATE_ATOM));
            return [...$this->records->view($row), 'prize_updates' => $updates];
        });
    }
}
