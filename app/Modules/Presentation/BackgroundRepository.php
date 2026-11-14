<?php

declare(strict_types=1);

namespace App\Modules\Presentation;

use App\Modules\Events\EventContext;

final class BackgroundRepository
{
    public function __construct(private readonly EventContext $event) {}

    public function prepare(string $path, int $size, string $mime): void
    {
        $this->event->database->query('INSERT INTO doorprize.background_assets(path,event_id,ready,expected_size,expected_mime) VALUES (?,?,false,?,?)', [$path,$this->event->id,$size,$mime]);
    }

    public function get(string $path): ?array
    {
        return $this->event->database->query('SELECT ready,expected_size,expected_mime FROM doorprize.background_assets WHERE event_id=? AND path=?', [$this->event->id,$path])[0] ?? null;
    }

    public function complete(string $path): void
    {
        $this->event->database->query('UPDATE doorprize.background_assets SET ready=true WHERE event_id=? AND path=?', [$this->event->id,$path]);
    }
}
