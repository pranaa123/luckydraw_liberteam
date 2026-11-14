<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google;

use App\Core\ApiError;

final class GoogleAddress
{
    public static function spreadsheet(mixed $value): array
    {
        if (!is_string($value) || strlen($value) > 2000) throw new ApiError('Tautan Google Sheets tidak valid.');
        $parts = parse_url(trim($value));
        if (!$parts || ($parts['scheme'] ?? '') !== 'https' || ($parts['host'] ?? '') !== 'docs.google.com' || isset($parts['user']) || isset($parts['port']) || !preg_match('~^/spreadsheets/d/([a-zA-Z0-9_-]{20,150})(?:/|$)~', $parts['path'] ?? '', $match)) throw new ApiError('Gunakan tautan Google Sheets dari docs.google.com.');
        parse_str($parts['query'] ?? '', $query); parse_str($parts['fragment'] ?? '', $fragment);
        $gid = $fragment['gid'] ?? $query['gid'] ?? null;
        if ($gid !== null && (!is_string($gid) || !ctype_digit($gid) || strlen($gid) > 10 || (int) $gid > 2147483647)) throw new ApiError('ID sheet tidak valid.');
        return ['spreadsheet_id' => $match[1], 'sheet_id' => $gid === null ? null : (int) $gid];
    }

    public static function endpoint(mixed $value): string
    {
        if (!is_string($value) || !preg_match('~^https://script\.google\.com/macros/s/[a-zA-Z0-9_-]{10,250}/exec$~D', trim($value))) throw new ApiError('Gunakan URL aplikasi web Google Apps Script yang berakhir /exec.');
        return trim($value);
    }

    public static function redirect(string $value): bool
    {
        $parts = parse_url($value);
        return $parts && ($parts['scheme'] ?? '') === 'https' && !isset($parts['user']) && !isset($parts['port']) && in_array($parts['host'] ?? '', ['script.google.com', 'script.googleusercontent.com'], true);
    }
}
