<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google\Reader;

use App\Core\ApiError;
use App\Core\Input;
use App\Core\SecretVault;
use App\Modules\Events\EventContext;
use App\Modules\Events\FieldRepository;
use App\Modules\Imports\Google\GoogleAddress;
use App\Modules\Imports\Google\GoogleProtocol;
use App\Modules\Imports\Google\GoogleSourceRepository;
use App\Modules\Imports\Google\GoogleSyncService;
use App\Modules\Participants\ParticipantFilter;

final class ReaderConnection
{
    public function __construct(private readonly EventContext $event) {}
    public function inspect(array $input): array
    {
        $address = GoogleAddress::spreadsheet($input['spreadsheet_url'] ?? null);
        $header = Input::integer($input,'header_row',1,100000);
        $flow = hash('sha256',json_encode([$address,$header],JSON_THROW_ON_ERROR));
        $http = new ReaderHttp($this->event,$input['job_id'] ?? null,$flow);
        try {
            $metadata = (new ReaderSheet($this->event,$http,$address['spreadsheet_id']))->metadata($address['sheet_id'],$header,true);
            $sealed = ['owner'=>$this->event->ownerId,'event'=>$this->event->id,'expires'=>time()+600,'address'=>[...$address,'sheet_id'=>$metadata['sheet_id']],
              'metadata'=>array_diff_key($metadata,['sample'=>true]),'schema'=>ParticipantFilter::schema((new FieldRepository($this->event))->all())];
            return ['metadata'=>$metadata,'inspection'=>(new SecretVault())->encrypt(json_encode($sealed,JSON_THROW_ON_ERROR|JSON_UNESCAPED_UNICODE))];
        } catch (ReaderPending $pending) { return ['pending'=>true,'job_id'=>$pending->job]; }
    }
    public function connect(array $input,?string $closes): array
    {
        $token = Input::text($input,'inspection',60000);
        $verified = json_decode((new SecretVault())->decrypt($token),true,64);
        if (!is_array($verified) || ($verified['owner'] ?? '')!==$this->event->ownerId || ($verified['event'] ?? 0)!==$this->event->id || ($verified['expires'] ?? 0)<time()) throw new ApiError('Pemeriksaan link kedaluwarsa. Periksa kembali spreadsheet.',409);
        return $this->event->mutate('google_source','connect',function() use($input,$verified,$closes): array {
            $records = new GoogleSourceRepository($this->event); $reader = new ReaderRepository($this->event);
            $schema = ParticipantFilter::schema($fields=(new FieldRepository($this->event))->all());
            if ($schema!==$verified['schema'] || ($input['field_schema'] ?? null)!==$schema) throw new ApiError('Isian undian berubah. Periksa kembali pemetaan.',409);
            $current = $reader->current();
            $connection = Input::text($input,'connection_id',36);
            if (!preg_match('/^[a-f0-9-]{36}$/D',$connection)) throw new ApiError('Identitas koneksi tidak valid.');
            // Retry respons hilang mengembalikan sumber yang sama.
            if ($current) {
                $prior=$records->find((int)$current['id']);
                if ($prior['connection_id']===$connection) {
                    if ($prior['spreadsheet_id']!==$verified['address']['spreadsheet_id'] || (int)$prior['sheet_id']!==$verified['address']['sheet_id']
                      || (int)$prior['identity_column']!==($input['identity_column'] ?? null) || \App\Modules\Participants\DuplicatePolicy::decode($prior['column_mapping'])!=($input['mapping'] ?? null)) throw new ApiError('Percobaan koneksi sudah dipakai. Buka ulang dialog sebelum mengganti sumber.',409);
                    return [...(new GoogleSyncService($this->event))->public((int)$current['id']),'name'=>$verified['metadata']['sheet_name']];
                }
            }
            if (($current ? (int)$current['id'] : null)!==($input['current_id'] ?? null) || ($current && (int)$current['version']!==($input['current_version'] ?? null))) throw new ApiError('Koneksi berubah di jendela lain. Buka ulang Google Sheets.',409);
            $metadata = $verified['metadata']; $address=$verified['address'];
            $mapping = GoogleProtocol::mapping($input['mapping'] ?? null,$fields,$metadata['headers']);
            $identity = Input::integer($input,'identity_column',1,256);
            if (!in_array($identity,array_column($metadata['headers'],'column'),true)) throw new ApiError('Pilih kolom identitas baris.');
            $reuse = null;
            if ($current && $current['connection_mode']==='reader') {
                $old = $records->find((int)$current['id']);
                if ($old['spreadsheet_id']===$address['spreadsheet_id'] && (int)$old['sheet_id']===$address['sheet_id']) {
                    if ((int)$old['identity_column']!==$identity) throw new ApiError('Kolom identitas koneksi ini harus tetap sama agar peserta tidak digandakan.',409);
                    $reuse=(int)$current['id'];
                }
            }
            $reader->retire($reuse);
            $source = $reuse ? $records->find($reuse) : $records->create($connection,$address,(int)$metadata['header_row'],null);
            $id=(int)($source['id'] ?? $reuse); $reader->mark($id,$identity,$connection,(int)$metadata['header_row']);
            // Metadata sudah diverifikasi oleh server, tanpa HTTP di dalam transaksi.
            $records->lease($id,$lease=GoogleProtocol::uuid());$records->metadata($id,$lease,$metadata);
            $records->configure($id,$mapping,$schema,$metadata['header_hash'],$closes,['kind'=>'idle','version'=>'']);
            return [...(new GoogleSyncService($this->event))->public($id),'name'=>$metadata['sheet_name']];
        });
    }
}
