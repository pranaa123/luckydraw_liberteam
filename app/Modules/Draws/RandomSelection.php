<?php

declare(strict_types=1);

namespace App\Modules\Draws;

/** Sampel seragam tanpa pengembalian; alokasi memori mengikuti jumlah hasil. */
final class RandomSelection
{
    public static function positions(int $total, int $count): array
    {
        $chosen = [];
        for ($index = $total - $count + 1; $index <= $total; $index++) {
            $value = random_int(1, $index);
            $chosen[isset($chosen[$value]) ? $index : $value] = true;
        }
        return self::shuffle(array_keys($chosen));
    }

    public static function shuffle(array $items): array
    {
        for ($index = count($items) - 1; $index > 0; $index--) {
            $other = random_int(0, $index);
            [$items[$index], $items[$other]] = [$items[$other], $items[$index]];
        }
        return $items;
    }
}
