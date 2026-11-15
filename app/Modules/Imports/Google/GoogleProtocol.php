<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google;

use App\Core\ApiError;
use App\Modules\Participants\DuplicatePolicy;

final class GoogleProtocol
{
    public static function validate(array $reply, array $source): array
    {
        if (($reply['protocol'] ?? null) !== 1 || ($reply['spreadsheet_id'] ?? null) !== $source['spreadsheet_id'] || !is_int($reply['sheet_id'] ?? null) || ($source['sheet_id'] !== null && $reply['sheet_id'] !== (int) $source['sheet_id'])) throw new ApiError('Konektor tidak cocok dengan spreadsheet/sheet yang dipilih.', 409);
        if (isset($reply['error'])) {
            $messages = ['NOT_INSTALLED' => 'Jalankan pasangDoorprize pada Apps Script terlebih dahulu.', 'UNAUTHORIZED' => 'Kunci konektor tidak cocok. Salin ulang kode konektor.',
              'HEADER_CHANGED' => 'Header sheet berubah. Periksa kembali pemetaan kolom.', 'RESET_REQUIRED' => 'Susunan baris berubah. Sinkronisasi awal akan diperbarui.', 'BUSY' => 'Google sedang memproses perubahan. Mencoba kembali.'];
            $messages += ['TOO_MANY_ROWS' => 'Sinkronisasi awal mendukung maksimal 100.000 baris.', 'TOO_MANY_COLUMNS' => 'Sheet mendukung maksimal 256 kolom.', 'SHEET_NOT_FOUND' => 'Sheet sumber tidak ditemukan. Periksa tautan dan gid.'];
            $temporary = in_array($reply['error'],['BUSY','CONNECTOR_ERROR'],true);
            throw new ApiError($messages[$reply['error']] ?? 'Konektor Google belum dapat memproses permintaan.', $reply['error'] === 'RESET_REQUIRED' ? 428 : ($temporary ? 502 : 409));
        }
        return $reply;
    }

    public static function uuid(): string
    {
        $bytes = random_bytes(16); $bytes[6] = chr((ord($bytes[6]) & 15) | 64); $bytes[8] = chr((ord($bytes[8]) & 63) | 128);
        $hex = bin2hex($bytes); return substr($hex,0,8) . '-' . substr($hex,8,4) . '-' . substr($hex,12,4) . '-' . substr($hex,16,4) . '-' . substr($hex,20);
    }

    public static function snapshot(int $header): array
    {
        return ['kind' => 'snapshot', 'after' => $header, 'watermark' => null, 'epoch' => null, 'snapshot_id' => self::uuid()];
    }

    public static function metadata(array $reply, int $header): array
    {
        if (!is_string($reply['sheet_name'] ?? null) || strlen($reply['sheet_name']) > 200 || ($reply['header_row'] ?? null) !== $header || !is_string($reply['header_hash'] ?? null) || !preg_match('/^[a-f0-9]{64}$/D', $reply['header_hash']) || !is_array($reply['headers'] ?? null) || count($reply['headers']) > 256) throw new ApiError('Metadata konektor Google tidak valid.', 502);
        foreach ($reply['headers'] as $item) if (!is_array($item) || !is_int($item['column'] ?? null) || $item['column'] < 1 || $item['column'] > 256 || !is_string($item['label'] ?? null) || strlen($item['label']) > 1000) throw new ApiError('Header konektor Google tidak valid.', 502);
        return array_intersect_key($reply, array_flip(['headers','sheet_id','sheet_name','header_row','header_hash','last_row','sample']));
    }

    public static function cursor(array $reply, array $previous): array
    {
        foreach (['after','epoch','watermark'] as $field) if (!is_int($reply[$field] ?? null) || $reply[$field] < 0) throw new ApiError('Cursor Google tidak valid.', 502);
        if (!is_bool($reply['done'] ?? null) || !is_bool($reply['more'] ?? null) || $reply['after'] < $previous['after'] || $reply['after'] - $previous['after'] > 200) throw new ApiError('Urutan perubahan Google tidak valid.', 502);
        if ($previous['epoch'] !== null && $previous['epoch'] !== $reply['epoch']) throw new ApiError('Susunan baris berubah. Sinkronisasi awal akan diperbarui.', 428);
        if ($previous['kind'] === 'changes' && count($reply['events'] ?? []) !== $reply['after'] - $previous['after']) throw new ApiError('Ada potongan perubahan Google yang terlewat.', 502);
        if ($previous['kind'] === 'snapshot' && $reply['done']) return ['kind' => 'changes','after' => $previous['watermark'] ?? $reply['watermark'],'epoch' => $reply['epoch']];
        return [...$previous, 'after' => $reply['after'], 'epoch' => $reply['epoch'], 'watermark' => $previous['watermark'] ?? $reply['watermark']];
    }

    public static function mapping(mixed $mapping, array $fields, array $headers): array
    {
        if (!is_array($mapping) || array_is_list($mapping) || !isset($mapping['name'])) throw new ApiError('Tentukan kolom Nama.');
        $allowed = ['name', ...array_map(static fn ($field) => 'field_' . $field['slot'], $fields)];
        $columns = array_column($headers, 'column');
        foreach ($mapping as $key => $column) if (!in_array($key, $allowed, true) || !is_int($column) || !in_array($column, $columns, true)) throw new ApiError('Pemetaan kolom Google Sheets tidak valid.');
        if (count(array_unique($mapping)) !== count($mapping)) throw new ApiError('Satu kolom hanya boleh dipakai untuk satu isian.');
        return $mapping;
    }

    public static function events(array $reply, array $mapping): array
    {
        $events = $reply['events'] ?? null;
        if (!is_array($events) || !array_is_list($events) || count($events) > 200) throw new ApiError('Potongan perubahan Google tidak valid.', 502);
        $rows = [];
        foreach ($events as $event) {
            if (!is_array($event) || !is_string($event['key'] ?? null) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D', $event['key']) || !is_int($event['row_number'] ?? null) || $event['row_number'] < 1 || !in_array($event['operation'] ?? '', ['upsert', 'delete'], true)) throw new ApiError('Identitas baris Google tidak valid.', 502);
            $data = []; $issue = null;
            if ($event['operation'] === 'upsert') {
                $values = $event['values'] ?? null;
                if (!is_array($values)) throw new ApiError('Isi baris Google tidak valid.', 502);
                $parsed=self::rowData($values,$mapping,$event['issue'] ?? null);
                $data=$parsed['data'];$issue=$parsed['issue'];
            }
            $rows[$event['key']] = ['row_key' => $event['key'], 'row_number' => $event['row_number'], 'operation' => $event['operation'], 'data' => $data,
              'hash' => hash('sha256', json_encode($data, JSON_THROW_ON_ERROR)), 'issue' => $issue];
        }
        return array_values($rows);
    }

    /** Validasi nilai dipakai bersama konektor lama dan pembacaan snapshot tanpa ID sumber. */
    public static function rowData(array $values,array $mapping,?string $sourceIssue=null): array
    {
        $data=[];$issue=null;
        foreach($mapping as $field=>$column){
            $text=$values[(string)$column] ?? '';
            if(!is_string($text)||strlen($text)>4000)throw new ApiError('Nilai sel Google tidak valid.',502);
            $data[$field]=trim(str_replace("\0",'',$text));
            if(strlen($data[$field])>200||str_contains($text,"\0"))$issue='Isian terlalu panjang atau mengandung karakter tidak valid.';
        }
        if(($data['name'] ?? '')==='')$issue='Nama wajib diisi.';
        if($sourceIssue)$issue=$sourceIssue==='LONG_CELL'?'Isian terlalu panjang. Ringkas teks pada Google Sheets.':'Ada sel yang tidak dapat dibaca. Perbaiki pada Google Sheets.';
        return ['data'=>$data,'issue'=>$issue];
    }

    public static function decode(array $source): array
    {
        foreach (['column_mapping','sync_cursor','metadata','last_summary'] as $key) $source[$key] = DuplicatePolicy::decode($source[$key]);
        return $source;
    }
}
