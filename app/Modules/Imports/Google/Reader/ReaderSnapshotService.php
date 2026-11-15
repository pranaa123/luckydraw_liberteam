<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google\Reader;

use App\Modules\Events\EventContext;
use App\Modules\Imports\Google\GoogleProtocol;

/** Baca → cocokkan snapshot → terapkan perubahan. HTTP selalu di luar transaksi. */
final class ReaderSnapshotService
{
    private readonly ReaderSnapshotRepository $records;
    public function __construct(private readonly EventContext $event) { $this->records=new ReaderSnapshotRepository($event); }

    public function fetch(array $source,ReaderHttp $http): array
    {
        $cursor=$source['sync_cursor'];
        if(($cursor['protocol'] ?? null)!==2)$source['sync_cursor']=$cursor=self::idle('');
        $base=['protocol'=>1,'spreadsheet_id'=>$source['spreadsheet_id'],'sheet_id'=>(int)$source['sheet_id'],'header_hash'=>$source['header_hash'],'reader_kind'=>$cursor['kind']];
        if(in_array($cursor['kind'],['prepare','apply'],true))return $base;
        $sheet=new ReaderSheet($this->event,$http,$source['spreadsheet_id']);
        if($cursor['kind']==='remove')return [...$base,'version_matches'=>$sheet->version(true)===$cursor['version']];
        return $sheet->page($source);
    }

    /** Dipanggil setelah lease/skema/deadline dan pending draw diperiksa ulang di bawah lock acara. */
    public function plan(array $source,array $reply): array
    {
        $id=(int)$source['id'];$cursor=$source['sync_cursor'];
        $batch=['cursor'=>$cursor,'events'=>[],'snapshot'=>null,'complete'=>false,'more'=>false,'touch'=>null,'clear'=>null];
        $kind=$reply['reader_kind'];
        if($kind==='idle')return [...$batch,'cursor'=>$reply['reader_cursor']];
        if($kind==='scan'){
            $next=$reply['reader_cursor'];$rows=[];
            foreach($reply['rows'] as $row){
                $parsed=GoogleProtocol::rowData($row['values'],$source['column_mapping'],$row['issue'] ?? null);
                $rows[]=['row_number'=>$row['row_number'],'data'=>(object)$parsed['data'],'anchor'=>$row['anchor'],'issue'=>$parsed['issue']];
            }
            $this->records->stage($id,$next['snapshot_id'],$rows,($cursor['snapshot_id'] ?? null)!==$next['snapshot_id']);
            return [...$batch,'cursor'=>$next,'more'=>true];
        }
        $snapshot=$cursor['snapshot_id'];
        if($kind==='prepare'){
            $this->records->prepare($id,$snapshot);
            return [...$batch,'cursor'=>[...$cursor,'kind'=>'apply','after'=>(int)$source['header_row']],'more'=>true];
        }
        if($kind==='apply'){
            $all=$this->records->page($id,$snapshot,(int)$cursor['after']);$more=count($all)>200;$rows=array_slice($all,0,200);$events=[];
            foreach($rows as $row)if(!$row['unchanged'])$events[]=[
              'row_key'=>$row['row_key'],'row_number'=>(int)$row['row_number'],'operation'=>'upsert','data'=>$row['data'],
              'hash'=>hash('sha256',json_encode($row['data'],JSON_THROW_ON_ERROR)),'issue'=>$row['issue'],
              'reader_anchor'=>$row['anchor'],'reader_review'=>(bool)$row['review']];
            $through=$rows ? (int)$rows[array_key_last($rows)]['row_number'] : (int)$cursor['after'];
            $next=$more?[...$cursor,'after'=>$through]:[...$cursor,'kind'=>'remove','after_key'=>'00000000-0000-0000-0000-000000000000'];
            return [...$batch,'cursor'=>$next,'events'=>$events,'snapshot'=>$snapshot,'more'=>true,'touch'=>[(int)$cursor['after'],$through]];
        }
        // Penghapusan ditunda apabila sumber berubah atau ada pencocokan yang masih perlu keputusan.
        if(!$cursor['stable'] || !$reply['version_matches'] || $this->records->hasReview($id,$snapshot))return [...$batch,
          'cursor'=>self::idle($cursor['version']),'complete'=>true,'clear'=>$snapshot];
        $all=$this->records->missing($id,$snapshot,$cursor['after_key']);$more=count($all)>200;$rows=array_slice($all,0,200);$events=[];
        foreach($rows as $row)$events[]=['row_key'=>$row['row_key'],'row_number'=>(int)$row['row_number'],'operation'=>'delete','data'=>[],
          'hash'=>hash('sha256','[]'),'issue'=>null];
        $next=$more?[...$cursor,'after_key'=>$rows[array_key_last($rows)]['row_key']]:self::idle($cursor['version']);
        return [...$batch,'cursor'=>$next,'events'=>$events,'snapshot'=>$snapshot,'complete'=>!$more,'more'=>$more,'clear'=>$more?null:$snapshot];
    }

    public function finish(int $source,array $batch): void
    {
        if($batch['touch'])$this->records->touch($source,$batch['snapshot'],...$batch['touch']);
        if($batch['clear'])$this->records->clear($source,$batch['clear']);
    }

    public static function idle(string $version): array { return ['protocol'=>2,'kind'=>'idle','version'=>$version]; }
}
