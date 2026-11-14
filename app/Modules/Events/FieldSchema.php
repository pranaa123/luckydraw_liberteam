<?php

declare(strict_types=1);

namespace App\Modules\Events;

/** Batas dan nama kolom peserta digunakan bersama CRUD, import dan laporan. */
final class FieldSchema
{
    public const MAX_ADDITIONAL = 10;
    public const SLOTS = [1,2,3,4,5,6,7,8,9,10];
    public const KEYS = ['name','field_1','field_2','field_3','field_4','field_5','field_6','field_7','field_8','field_9','field_10'];

    public static function columns(string $alias = ''): string
    {
        if ($alias!=='' && !preg_match('/^[a-z]+$/D',$alias)) throw new \LogicException('Alias kolom tidak valid.');
        return implode(', ',array_map(static fn (string $key): string => ($alias ? $alias . '.' : '') . $key,self::KEYS));
    }
}
