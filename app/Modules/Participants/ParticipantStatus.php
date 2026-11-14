<?php

declare(strict_types=1);

namespace App\Modules\Participants;

enum ParticipantStatus: string
{
    case Available = 'available';
    case Duplicate = 'duplicate';
    case Eliminated = 'eliminated';
    case Winner = 'winner';

    public function label(): string
    {
        return match ($this) {
            self::Available => 'Tersedia',
            self::Duplicate => 'Duplikat',
            self::Eliminated => 'Tereliminasi',
            self::Winner => 'Pemenang',
        };
    }
}
