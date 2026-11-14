<?php

declare(strict_types=1);

namespace App\Modules\Prizes;

enum PrizeMode: string
{
    case None = 'none';
    case Random = 'random';
    case Selected = 'selected';
}
