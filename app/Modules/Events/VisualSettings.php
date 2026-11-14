<?php

declare(strict_types=1);

namespace App\Modules\Events;

use App\Core\ApiError;
use App\Modules\Presentation\BackgroundAsset;

final class VisualSettings
{
    public const DEFAULTS = [
        ...CanvasGeometry::DEFAULTS,
        'background_type' => 'color', 'background_color' => '#ffffff', 'background_image' => null,
        'background_fit' => 'cover',
        'font_color' => '#172b4d', 'font_style' => 'sans-serif', 'text_case' => 'sentence',
        'show_field_1' => true, 'show_field_2' => true, 'show_field_3' => true,
    ];

    public static function validate(mixed $input): array
    {
        if (!is_array($input)) throw new ApiError('Pengaturan visual tidak valid.');
        $value = array_replace(self::DEFAULTS, array_intersect_key($input, self::DEFAULTS));
        CanvasGeometry::validate($value);
        foreach (['show_field_1','show_field_2','show_field_3'] as $key) {
            if (!is_bool($value[$key])) throw new ApiError('Pilihan tampilan isian harus aktif atau nonaktif.');
        }
        foreach (['background_color', 'font_color'] as $key) {
            if (!is_string($value[$key]) || !preg_match('/^#[a-f0-9]{6}$/iD', $value[$key])) throw new ApiError('Warna harus menggunakan kode hex enam digit.');
        }
        foreach (['background_type' => ['color', 'image'], 'background_fit' => ['cover','contain'], 'font_style' => ['serif', 'sans-serif', 'slab-serif', 'script'], 'text_case' => ['uppercase', 'lowercase', 'sentence']] as $key => $allowed) {
            if (!in_array($value[$key], $allowed, true)) throw new ApiError('Pilihan tampilan tidak valid.');
        }
        $value['background_image'] = BackgroundAsset::validate($value['background_image']);
        if ($value['background_type'] === 'image' && !$value['background_image']) throw new ApiError('Upload background utama sebelum menyimpan.');
        return $value;
    }
}
