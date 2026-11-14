<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google;

use App\Core\ApiError;
use App\Core\Input;
use App\Core\SecretVault;
use App\Modules\Events\FieldRepository;
use App\Modules\Events\EventContext;
use App\Modules\Participants\ParticipantFilter;

final class GoogleSourceService
{
    public const ACTIONS = ['inspect','connect','prepare','setup','probe','configure','schedule','disconnect','pause','resume','sync','issues','resolve'];
    private readonly GoogleSourceRepository $records;
    private readonly GoogleSyncService $sync;
    public function __construct(private readonly EventContext $event) { $this->records = new GoogleSourceRepository($event); $this->sync = new GoogleSyncService($event); }
    public function list(): array { return ['items' => $this->records->list(),'data_version' => $this->records->dataVersion(),
      'reader' => ['ready'=>Reader\ReaderAccess::ready(),'email'=>Reader\ReaderAccess::email()]]; }

    public function save(string $action,array $input): array
    {
        if ($action === 'inspect') return (new Reader\ReaderConnection($this->event))->inspect($input);
        if ($action === 'connect') return (new Reader\ReaderConnection($this->event))->connect($input,$this->deadline($input));
        if ($action === 'prepare') return $this->prepare($input);
        $id = Input::integer($input,'id');
        if ($action === 'sync') return $this->sync->work($id);
        if ($action === 'setup') return $this->setup($id);
        if ($action === 'issues') return $this->issues($id,$input);
        if ($action === 'probe') {
            $endpoint = GoogleAddress::endpoint($input['endpoint'] ?? null);
            $this->event->database->transaction(function () use ($id,$endpoint,$input): void {
                $this->records->lockEvent(); $source = $this->records->find($id,true);
                if (!in_array($source['phase'],['draft','paused','disconnected','closed'],true)) throw new ApiError('Jeda sinkronisasi sebelum mengubah konektor.',409);
                if ($source['endpoint'] !== $endpoint) {
                    if ((int) $source['version'] !== ($input['version'] ?? null)) throw new ApiError('Sumber sudah berubah. Buka ulang koneksi.',409);
                    $this->records->endpoint($id,$endpoint);
                }
            });
            return $this->sync->work($id,true);
        }
        return $this->mutate($action,function () use ($action,$input,$id): array {
            $source = GoogleProtocol::decode($this->records->find($id,true));
            if ((int) $source['version'] !== ($input['version'] ?? null)) throw new ApiError('Sumber sudah berubah. Buka ulang pengaturan koneksi.',409);
            if ($action === 'configure') {
                $current = (new Reader\ReaderRepository($this->event))->current();
                if ($current && (int)$current['id']!==$id) throw new ApiError('Acara ini sudah memiliki satu koneksi. Gunakan Ganti spreadsheet.',409);
                $fields = (new FieldRepository($this->event))->all();
                if (($input['field_schema'] ?? null) !== ParticipantFilter::schema($fields)) throw new ApiError('Isian undian berubah. Buka ulang pemetaan kolom.',409);
                if (!$source['metadata'] || ($input['header_hash'] ?? null) !== ($source['metadata']['header_hash'] ?? null)) throw new ApiError('Periksa konektor dan pemetaan terlebih dahulu.',409);
                $mapping = GoogleProtocol::mapping($input['mapping'] ?? null,$fields,$source['metadata']['headers']);
                $this->records->configure($id,$mapping,ParticipantFilter::schema($fields),$input['header_hash'],$this->deadline($input),GoogleProtocol::snapshot((int) $source['header_row']));
            } elseif ($action === 'disconnect') $this->records->close($id,true);
            elseif ($action === 'pause') $this->records->pause($id);
            elseif ($action === 'resume') {
                $current = (new Reader\ReaderRepository($this->event))->current();
                if ($current && (int)$current['id']!==$id) throw new ApiError('Koneksi sudah diganti. Gunakan koneksi terbaru.',409);
                if ($source['deadline_passed']) throw new ApiError('Ubah waktu penutupan sebelum melanjutkan sinkronisasi.',409);
                if (!$source['column_mapping'] || $source['field_schema'] !== ParticipantFilter::schema((new FieldRepository($this->event))->all())) throw new ApiError('Petakan ulang kolom sebelum melanjutkan.',409);
                $this->records->resume($id);
            } elseif ($action === 'schedule') $this->records->schedule($id,$this->deadline($input));
            elseif ($action === 'resolve') return $this->resolve($source,$input);
            return [...$this->sync->public($id),'name' => $source['sheet_name'] ?? 'Google Sheets'];
        });
    }

    private function mutate(string $action,callable $operation): array
    {
        if ($action === 'resolve') return $this->event->mutate('google_source',$action,$operation);
        // Jeda/putus/jadwal/pemetaan hanya mengubah sumber, sehingga tetap dapat diatur saat undian.
        // Penerapan data peserta tetap ditahan GoogleSyncService sampai pending draw selesai.
        return $this->event->database->transaction(function () use ($action,$operation): array {
            $this->records->lockEvent(); $result = $operation();
            $this->records->bumpDataVersion(); $this->records->audit((int) $result['id'],$action,$result);
            return $result;
        });
    }

    private function prepare(array $input): array
    {
        $connection = Input::text($input,'connection_id',36);
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iD',$connection)) throw new ApiError('Identitas koneksi tidak valid.');
        $address = GoogleAddress::spreadsheet($input['spreadsheet_url'] ?? null); $header = Input::integer($input,'header_row',1,1048575);
        $source = $this->event->database->transaction(function () use ($connection,$address,$header): array {
            $this->records->lockEvent();
            $row = $this->records->create($connection,$address,$header,(new SecretVault())->encrypt(bin2hex(random_bytes(32))));
            if ($row['spreadsheet_id'] !== $address['spreadsheet_id'] || ($address['sheet_id'] !== null && (int) $row['sheet_id'] !== $address['sheet_id']) || (int) $row['header_row'] !== $header) throw new ApiError('Identitas koneksi sudah dipakai untuk sumber berbeda.',409);
            if ($row['created']) $this->records->audit((int) $row['id'],'connect',['name' => 'Google Sheets']);
            return $row;
        });
        return $this->setup((int) $source['id']);
    }

    private function setup(int $id): array
    {
        $source = $this->records->find($id);
        if ($source['connection_mode']==='reader') return ['source'=>$this->sync->public($id),
          'mapping'=>\App\Modules\Participants\DuplicatePolicy::decode($source['column_mapping']),
          'field_schema'=>$source['field_schema'],'header_hash'=>$source['header_hash']];
        $config = ['connectorId' => substr(str_replace('-','',$source['connection_id']),0,12),'spreadsheetId' => $source['spreadsheet_id'],'sheetId' => $source['sheet_id'] === null ? null : (int) $source['sheet_id'],'headerRow' => (int) $source['header_row'],'secret' => (new SecretVault())->decrypt($source['encrypted_secret'])];
        $script = str_replace('__DOORPRIZE_CONFIG__',json_encode($config,JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES),file_get_contents(BASE_PATH . '/resources/google-sheets/connector.gs'));
        return ['source' => $this->sync->public($id),'script' => $script,'endpoint' => $source['endpoint'],'mapping' => \App\Modules\Participants\DuplicatePolicy::decode($source['column_mapping']),'field_schema' => $source['field_schema']];
    }

    private function deadline(array $input): ?string
    {
        $value = $input['closes_at'] ?? null;
        if ($value === null || $value === '') return null;
        if (!is_string($value) || !preg_match('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/D',$value)) throw new ApiError('Waktu penutupan tidak valid.');
        try { return (new \DateTimeImmutable($value))->format(DATE_ATOM); } catch (\Exception) { throw new ApiError('Waktu penutupan tidak valid.'); }
    }

    private function issues(int $id,array $input): array
    {
        $this->records->find($id); $after = $input['after'] ?? '00000000-0000-0000-0000-000000000000';
        if (!is_string($after) || !preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D',$after)) throw new ApiError('Halaman perubahan tidak valid.');
        $rows = (new GoogleRowRepository($this->event))->issues($id,$after);
        return ['items' => array_slice($rows,0,50),'next' => count($rows) > 50 ? $rows[49]['row_key'] : null];
    }

    private function resolve(array $source,array $input): array
    {
        $key = Input::text($input,'row_key',36); $choice = $input['choice'] ?? '';
        if (!in_array($choice,['remote','local'],true)) throw new ApiError('Pilih data yang akan dipertahankan.');
        if (!preg_match('/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/D',$key)) throw new ApiError('Identitas baris tidak valid.');
        $row = (new GoogleRowRepository($this->event))->current((int) $source['id'],[$key])[$key] ?? throw new ApiError('Baris tidak ditemukan.',404);
        if ((int) $row['version'] !== ($input['row_version'] ?? null) || !$row['issue']) throw new ApiError('Perubahan sudah diperbarui. Muat ulang daftar konflik.',409);
        if ($row['issue'] === 'invalid' || ($choice === 'local' && !$row['participant_id'])) throw new ApiError('Perbaiki baris ini pada Google Sheets terlebih dahulu.');
        if ($source['field_schema'] !== ParticipantFilter::schema((new FieldRepository($this->event))->all())) throw new ApiError('Isian berubah. Petakan ulang sumber sebelum menyelesaikan konflik.',409);
        $data = $row['incoming_data'];
        if ($choice === 'remote') {
            foreach ($data as $value) if (!is_string($value) || strlen($value) > 200 || str_contains($value, "\0")) throw new ApiError('Perbaiki isian tidak valid di Google Sheets terlebih dahulu.');
            if (trim($data['name'] ?? '') === '') throw new ApiError('Nama wajib diisi pada Google Sheets.');
        }
        $event = ['row_key' => $key,'row_number' => (int) $row['row_number'],'operation' => 'upsert','data' => $data,'hash' => hash('sha256',json_encode($data,JSON_THROW_ON_ERROR)),'issue' => null];
        $summary = (new GoogleRowService($this->event))->apply((int) $source['id'],[$event],null,false,$choice);
        $this->records->adjust((int) $source['id'],$summary);
        return [...$this->sync->public((int) $source['id']),'summary' => $summary,'changed' => $summary['changed'] > 0,'row_key' => $key,'participant_id' => $row['participant_id'],'choice' => $choice,'name' => $source['sheet_name']];
    }
}
