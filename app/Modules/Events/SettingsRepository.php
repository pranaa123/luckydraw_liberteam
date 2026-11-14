<?php

declare(strict_types=1);

namespace App\Modules\Events;

final class SettingsRepository
{
    private const COLUMNS = 'id, client_name, event_name, event_at, show_event_info, visual_settings, settings_version';

    public function __construct(private readonly EventContext $event) {}

    public function record(): array
    {
        return $this->event->database->query('SELECT ' . self::COLUMNS . ' FROM doorprize.events WHERE id = ?', [$this->event->id])[0];
    }

    public function save(array $input, array $visual, ?string $date): array
    {
        return $this->event->database->query('UPDATE doorprize.events SET client_name = ?, event_name = ?, event_at = ?, show_event_info = ?::boolean, visual_settings = ?::jsonb, settings_version = settings_version + 1 WHERE id = ? RETURNING ' . self::COLUMNS,
            [$input['client_name'], $input['event_name'], $date, $input['show_event_info'] ? 'true' : 'false', json_encode($visual, JSON_THROW_ON_ERROR), $this->event->id])[0];
    }

    public function view(array $row): array
    {
        $visual = is_string($row['visual_settings']) ? json_decode($row['visual_settings'], true, 32, JSON_THROW_ON_ERROR) : $row['visual_settings'];
        $backgrounds = [];
        foreach ($this->event->database->query('SELECT id, background_path, version FROM doorprize.prizes WHERE event_id = ? AND background_path IS NOT NULL', [$this->event->id]) as $prize) {
            $backgrounds[(string) $prize['id']] = ['path' => $prize['background_path'], 'version' => (int) $prize['version']];
        }
        return [
            'id' => (int) $row['id'], 'settings_version' => (int) $row['settings_version'],
            'client_name' => $row['client_name'] ?? '', 'event_name' => $row['event_name'] ?? '',
            'event_at' => $row['event_at'] ? (new \DateTimeImmutable($row['event_at']))->setTimezone(new \DateTimeZone(date_default_timezone_get()))->format(DATE_ATOM) : null,
            'timezone' => date_default_timezone_get(), 'show_event_info' => (bool) $row['show_event_info'],
            'visual' => array_replace(VisualSettings::DEFAULTS, $visual, ['prize_backgrounds' => (object) $backgrounds]),
        ];
    }
}
