<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google;

use App\Core\ApiError;
use App\Core\SecretVault;
use App\Modules\Events\FieldRepository;
use App\Modules\Events\EventContext;
use App\Modules\Imports\ImportRepository;
use App\Modules\Participants\ParticipantFilter;

/** Lease/cursor persisten; panggilan Google selalu di luar transaksi database. */
final class GoogleSyncService
{
    private readonly GoogleSourceRepository $records;
    public function __construct(private readonly EventContext $event) { $this->records = new GoogleSourceRepository($event); }

    public function work(int $id, bool $probe = false): array
    {
        $plan = $this->event->database->transaction(function () use ($id,$probe): array {
            $this->records->lockEvent(); $source = GoogleProtocol::decode($this->records->find($id,true));
            if (!$probe && (!$source['sync_enabled'] || !in_array($source['phase'], ['initial','live'],true))) return ['reason' => 'inactive'];
            if (!$probe && $source['deadline_passed']) { $this->records->close($id); $this->records->bumpDataVersion(); return ['reason' => 'closed','state_changed' => true]; }
            if (!$probe && (new ImportRepository($this->event))->hasPendingDraw()) return ['reason' => 'draw_pending'];
            if ($source['connection_mode'] === 'script' && $source['endpoint'] === '') throw new ApiError('Isi URL konektor terlebih dahulu.');
            $fields = (new FieldRepository($this->event))->all();
            if (!$probe && $source['field_schema'] !== ParticipantFilter::schema($fields)) {
                $lease = GoogleProtocol::uuid(); $this->records->lease($id,$lease);
                $this->records->failed($id,$lease,'schema_changed','Isian undian berubah. Petakan ulang kolom Google Sheets.',0,true);
                return ['reason' => 'schema_changed','state_changed' => true];
            }
            if ($source['leased'] && !$source['pending_job_id']) return ['reason' => 'busy'];
            if (!$probe && !$source['leased'] && !$source['due']) return ['reason' => 'waiting'];
            if (!$source['leased']) {
                $source['lease_id'] = GoogleProtocol::uuid(); $source['pending_job_id'] = null;
                $this->records->lease($id,$source['lease_id']);
            }
            return ['source' => $source];
        });
        if (!isset($plan['source'])) return ['source' => $this->public($id), ...$plan, 'changed' => false];
        $source = $plan['source']; $lease = $source['lease_id'];
        try {
            if ($source['connection_mode']==='reader') {
                $http = new Reader\ReaderHttp($this->event,$source['pending_job_id'],hash('sha256',json_encode([$id,$source['version'],$source['sync_cursor']],JSON_THROW_ON_ERROR)));
                $remote=['response'=>(new Reader\ReaderSnapshotService($this->event))->fetch($source,$http)];
                $http->close();
            } else {
                $payload = ['protocol'=>1,'secret'=>(new SecretVault())->decrypt($source['encrypted_secret']),'action'=>$probe?'probe':$source['sync_cursor']['kind'],
                  'cursor'=>$source['sync_cursor'],'header_hash'=>$probe?null:$source['header_hash'],'columns'=>array_values($source['column_mapping']),'limit'=>200];
                $remote = (new GoogleTransport())->exchange($source['endpoint'],$payload,$source['pending_job_id']);
            }
            if (isset($remote['pending'])) {
                $this->records->pending($id,$lease,$remote['pending']);
                return ['source' => $this->public($id),'pending' => true,'changed' => false];
            }
            if (!empty($remote['expired'])) { $this->records->release($id,$lease); return ['source' => $this->public($id),'pending' => true,'changed' => false]; }
            $reply = GoogleProtocol::validate($remote['response'] ?? [],$source);
            return $this->event->database->transaction(function () use ($id,$probe,$source,$lease,$reply): array {
                $this->records->lockEvent(); $fresh = GoogleProtocol::decode($this->records->find($id,true));
                if ($fresh['lease_id'] !== $lease || (int) $fresh['version'] !== (int) $source['version']) return ['source' => $this->public($id),'reason' => 'superseded','changed' => false];
                if ($probe) {
                    $metadata = GoogleProtocol::metadata($reply,(int) $source['header_row']);
                    $this->records->metadata($id,$lease,$metadata);
                    return ['source' => $this->public($id),'metadata' => $metadata,'changed' => false];
                }
                if (!$fresh['sync_enabled'] || $fresh['deadline_passed']) { $this->records->close($id); $this->records->bumpDataVersion(); return ['source' => $this->public($id),'reason' => 'closed','state_changed' => true,'changed' => false]; }
                if ((new ImportRepository($this->event))->hasPendingDraw()) return ['source' => $this->public($id),'reason' => 'draw_pending','changed' => false];
                if ($fresh['field_schema'] !== ParticipantFilter::schema((new FieldRepository($this->event))->all())) throw new ApiError('Isian undian berubah. Petakan ulang kolom Google Sheets.',409);
                if (($reply['header_hash'] ?? '') !== $source['header_hash']) throw new ApiError('Header sheet berubah. Periksa kembali pemetaan kolom.',409);
                $reader = $source['connection_mode']==='reader';
                if ($reader && isset($reply['sheet_name']) && $reply['sheet_name']!==$source['sheet_name']) (new Reader\ReaderRepository($this->event))->rename($id,$reply['sheet_name']);
                $readerFlow=$reader?new Reader\ReaderSnapshotService($this->event):null;
                if($reader){
                    $batch=$readerFlow->plan($source,$reply);
                    $cursor=$batch['cursor'];$events=$batch['events'];$snapshot=$batch['snapshot'];$done=$batch['complete'];$more=$batch['more'];
                }else{
                    $cursor=GoogleProtocol::cursor($reply,$source['sync_cursor']);$events=GoogleProtocol::events($reply,$source['column_mapping']);
                    $snapshot=$source['sync_cursor']['snapshot_id'] ?? null;$done=$source['sync_cursor']['kind']==='snapshot' && $reply['done'];$more=$reply['more'];
                }
                $summary=(new GoogleRowService($this->event))->apply($id,$events,$snapshot,$reader?false:$done);
                if($reader)$readerFlow->finish($id,$batch);
                $summary['more']=$more;
                $phase = $reader ? ($source['initial_complete'] || $done ? 'live' : 'initial') : ($cursor['kind']==='changes' ? 'live' : 'initial');
                $this->records->advance($id,$cursor,$phase,$summary);
                if ($done && !$summary['changed']) $this->records->bumpDataVersion();
                if ($summary['changed']) { $this->records->bumpDataVersion(); $this->records->audit($id,'sync',['name' => $source['sheet_name'], ...$summary]); }
                return ['source' => $this->public($id),'summary' => $summary,'changed' => $summary['changed'] > 0,
                  'state_changed' => $done || ($reader && !$source['initial_complete'] && (int)$source['failure_count']>0),'more'=>$more];
            });
        } catch (Reader\ReaderPending $pending) {
            $this->records->pending($id,$lease,$pending->job);
            return ['source'=>$this->public($id),'pending'=>true,'changed'=>false];
        } catch (ApiError $error) {
            if(isset($http))$http->close();
            if ($error->status === 428) {
                $this->event->database->transaction(function () use ($id,$lease,$source): void {
                    $this->records->lockEvent(); $fresh = $this->records->find($id,true);
                    if ($fresh['lease_id'] === $lease) $this->records->reset($id,GoogleProtocol::snapshot((int) $source['header_row']));
                    $this->records->bumpDataVersion();
                });
                return ['source' => $this->public($id),'state_changed' => true,'changed' => false,'more' => true];
            }
            $this->records->failed($id,$lease,$error->status === 409 ? 'configuration' : 'connection',$error->getMessage(),min(60,3 * (2 ** min(5,(int) $source['failure_count']))),$error->status === 409 && !$probe);
            return ['source' => $this->public($id),'error' => $error->getMessage(),'changed' => false,
              'state_changed'=>$source['connection_mode']==='reader' && !$source['initial_complete']];
        }
    }

    public function public(int $id): array
    {
        $source = $this->records->find($id);
        return array_intersect_key($source,array_flip(['id','revision','phase','version','connection_mode','sheet_id','header_row','synced_rows','invalid_rows','conflict_rows','error_code','error_message','next_attempt_at','last_summary','spreadsheet_id','sheet_name','sync_enabled','closes_at','last_synced_at','deadline_passed']));
    }
}
