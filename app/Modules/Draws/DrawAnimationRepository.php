<?php

declare(strict_types=1);

namespace App\Modules\Draws;

use App\Modules\Events\EventContext;
use App\Modules\Participants\DrawFilterPoolRepository;

/** Sampel visual terbatas; tidak menentukan pemenang atau memindai seluruh nama. */
final class DrawAnimationRepository
{
    public const SAMPLE_LIMIT = 512;

    public function __construct(private readonly EventContext $event) {}

    public function names(int $seed, int $capacity, array $filters): array
    {
        if ($capacity<1) return [];
        $positions = [];
        for ($index=$capacity-min($capacity,self::SAMPLE_LIMIT)+1; $index<=$capacity; $index++) {
            $value = unpack('N',substr(hash('sha256',$seed . ':' . $index,true),0,4))[1] % $index + 1;
            $positions[isset($positions[$value]) ? $index : $value] = true;
        }
        $table = DrawFilterPoolRepository::table($filters);
        $rows = $this->event->database->query("SELECT p.name FROM jsonb_array_elements_text(?::jsonb) WITH ORDINALITY selected(position,rank)
          JOIN doorprize.{$table} pool ON pool.event_id=? AND pool.position=selected.position::bigint
          JOIN doorprize.participants p ON p.id=pool.participant_id AND p.event_id=pool.event_id
          WHERE p.status='available' ORDER BY selected.rank", [json_encode(array_keys($positions),JSON_THROW_ON_ERROR),$this->event->id]);
        return array_values(array_unique(array_column($rows,'name')));
    }
}
