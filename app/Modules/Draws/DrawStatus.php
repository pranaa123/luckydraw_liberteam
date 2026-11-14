<?php

declare(strict_types=1);

namespace App\Modules\Draws;

enum DrawStatus: string
{
    case Pending = 'pending';
    case Confirmed = 'confirmed';
    case Eliminated = 'eliminated';
    case Cleared = 'cleared';
}
