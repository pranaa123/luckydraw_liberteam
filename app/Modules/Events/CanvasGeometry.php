<?php

declare(strict_types=1);

namespace App\Modules\Events;

use App\Core\ApiError;

final class CanvasGeometry
{
    public const DEFAULTS = [
        'canvas_width' => 1920, 'canvas_height' => 1080,
        'area_width' => 1536, 'area_height' => 648, 'area_x' => 192, 'area_y' => 216,
        'area_anchor_x' => 'left', 'area_anchor_y' => 'top',
    ];

    public static function validate(array $value): void
    {
        foreach (['canvas_width','canvas_height','area_width','area_height','area_x','area_y'] as $key) {
            $minimum = in_array($key,['area_x','area_y'],true) ? 0 : 1;
            $position = $minimum === 0;
            if ((!is_int($value[$key]) && !is_float($value[$key])) || !is_finite((float) $value[$key])
                || floor($value[$key] * ($position ? 2 : 1)) != $value[$key] * ($position ? 2 : 1)
                || $value[$key] < $minimum || $value[$key] > 32768) throw new ApiError('Ukuran harus berupa pixel bulat 1–32768; posisi minimal 0 dengan ketelitian setengah pixel.');
        }
        if ($value['area_width'] > $value['canvas_width'] || $value['area_height'] > $value['canvas_height']) throw new ApiError('Ukuran area nama tidak boleh melebihi ukuran canvas.');
        if ($value['area_x'] > $value['canvas_width'] - $value['area_width'] || $value['area_y'] > $value['canvas_height'] - $value['area_height']) throw new ApiError('Jarak area nama melebihi ruang yang tersedia pada canvas.');
        if (!in_array($value['area_anchor_x'],['left','right'],true) || !in_array($value['area_anchor_y'],['top','bottom'],true)) throw new ApiError('Acuan posisi area nama tidak valid.');
    }
}
