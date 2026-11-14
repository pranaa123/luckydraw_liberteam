<?php

declare(strict_types=1);

namespace App\Modules\Draws;

use App\Core\ApiError;
use App\Core\Input;

final class PrizeAllocation
{
    public static function requested(array $input): array
    {
        $items = $input['allocation'] ?? [];
        if (!is_array($items) || !array_is_list($items)) throw new ApiError('Pembagian hadiah tidak valid.');
        $result = [];
        foreach ($items as $item) {
            if (!is_array($item)) throw new ApiError('Pembagian hadiah tidak valid.');
            $id = Input::integer($item, 'prize_id');
            if (isset($result[$id])) throw new ApiError('Hadiah yang sama cukup diisi satu kali.');
            $result[$id] = ['prize_id' => $id, 'quantity' => Input::integer($item, 'quantity')];
        }
        ksort($result);
        return array_values($result);
    }

    public static function prepare(string $mode, int $count, array $requested, array $prizes): array
    {
        if ($mode === 'none') return [];
        $map = array_column($prizes, null, 'id');
        if ($mode === 'selected') {
            if (array_sum(array_column($requested, 'quantity')) !== $count) throw new ApiError('Total pembagian hadiah harus sama dengan jumlah nama.');
            foreach ($requested as $item) {
                $prize = $map[$item['prize_id']] ?? null;
                if (!$prize || $item['quantity'] > (int) $prize['remaining_quantity']) throw new ApiError('Stok hadiah yang dipilih tidak mencukupi.');
            }
            return $requested;
        }
        $total = array_sum(array_column($prizes, 'remaining_quantity'));
        if ($total < $count) throw new ApiError('Total stok hadiah tidak mencukupi.');
        $positions = RandomSelection::positions((int) $total, $count);
        sort($positions);
        $result = []; $cursor = 0; $end = 0;
        foreach ($prizes as $prize) {
            $end += (int) $prize['remaining_quantity']; $quantity = 0;
            while (isset($positions[$cursor]) && $positions[$cursor] <= $end) { $quantity++; $cursor++; }
            if ($quantity) $result[] = ['prize_id' => (int) $prize['id'], 'quantity' => $quantity];
        }
        return $result;
    }

    public static function assignments(array $allocation): array
    {
        $items = [];
        foreach ($allocation as $item) for ($index = 0; $index < $item['quantity']; $index++) $items[] = $item['prize_id'];
        return RandomSelection::shuffle($items);
    }
}
