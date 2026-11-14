<?php

declare(strict_types=1);

namespace App\Modules\Imports;

use App\Modules\Events\FieldSchema;

use App\Core\ApiError;

/** Validasi server tetap berlaku meskipun berkas telah dibaca worker. */
final class ImportRows
{
    public static function normalize(mixed $input, array $fields, int $after): array
    {
        if (!is_array($input) || !array_is_list($input) || !$input || count($input) > 200) throw new ApiError('Potongan import tidak valid.');
        $allowed = ['name', ...array_map(static fn ($f) => 'field_' . $f['slot'], $fields)];
        $rows = [];
        foreach ($input as $row) {
            if (!is_array($row) || !is_int($row['row_number'] ?? null) || $row['row_number'] <= $after || $row['row_number'] > 1048576) throw new ApiError('Urutan baris import tidak valid.');
            $after = $row['row_number']; $issue = null;
            $result = ['row_number' => $after];
            foreach (FieldSchema::KEYS as $key) {
                $value = $row[$key] ?? '';
                if (!is_string($value)) throw new ApiError('Nilai import harus berupa teks.');
                $value = trim($value);
                if ($value !== '' && !in_array($key, $allowed, true)) throw new ApiError('Isian import sudah berubah.', 409);
                if (str_contains($value, "\0") || strlen($value) > 200) $issue = 'Isian terlalu panjang atau mengandung karakter tidak valid. Ringkas isian pada baris ini.';
                $result[$key] = str_replace("\0", '', $value);
            }
            if ($result['name'] === '') $issue = 'Nama wajib diisi.';
            if (isset($row['issue']) && $row['issue'] !== '') $issue = 'Sel Excel tidak dapat dibaca sebagai teks. Perbaiki baris ini.';
            $result['issue'] = $issue;
            $rows[] = $result;
        }
        return $rows;
    }
}
