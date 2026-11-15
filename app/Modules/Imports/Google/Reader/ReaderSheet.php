<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google\Reader;

use App\Core\ApiError;
use App\Modules\Events\EventContext;
use App\Modules\Imports\Google\GoogleProtocol;

/** Hanya membaca metadata dan rentang kolom yang diminta. */
final class ReaderSheet
{
    private ?string $access = null;
    public function __construct(private readonly EventContext $event,private readonly ReaderHttp $http,private readonly string $spreadsheet) {}
    private function get(string $path,array $query = []): array
    {
        $this->access ??= (new ReaderAccess($this->event,$this->http))->token();
        return $this->http->request('https://sheets.googleapis.com/v4/spreadsheets/' . $this->spreadsheet . $path . ($query ? '?' . http_build_query($query) : ''),$this->access);
    }
    public function version(bool $final = false): string
    {
        $this->access ??= (new ReaderAccess($this->event,$this->http))->token();
        $file = $this->http->request('https://www.googleapis.com/drive/v3/files/' . $this->spreadsheet . '?fields=' . ($final?'trashed,version,id':'id,version,trashed') . '&supportsAllDrives=true',$this->access);
        if (!empty($file['trashed']) || !is_string($file['version'] ?? null)) throw new ApiError('Spreadsheet tidak tersedia. Periksa link dan akses Viewer.',422);
        return $file['version'];
    }
    private const GRID_FIELDS = 'spreadsheetId,sheets(properties(sheetId,title,gridProperties(rowCount,columnCount)),data(startRow,startColumn,rowData(values(formattedValue,effectiveValue))))';

    private function cells(array $sheet): array
    {
        $cells=[];
        foreach ($sheet['data'] ?? [] as $block) foreach ($block['rowData'] ?? [] as $row=>$record) foreach ($record['values'] ?? [] as $column=>$cell) {
            $raw=array_values($cell['effectiveValue'] ?? [])[0] ?? '';
            $cells[(int)($block['startRow'] ?? 0)+$row+1][(int)($block['startColumn'] ?? 0)+$column+1]=[
              'text'=>(string)($cell['formattedValue'] ?? (is_scalar($raw)?$raw:'')),'raw'=>$raw,'error'=>isset($cell['effectiveValue']['errorValue'])];
        }
        return $cells;
    }

    private function describe(array $sheet,int $header,bool $sample): array
    {
        $properties=$sheet['properties'];$rows=(int)$properties['gridProperties']['rowCount'];
        if ($rows<$header || $rows>100001) throw new ApiError('Periksa baris header. Gunakan sheet maksimal 100.000 baris data; hapus baris kosong berlebih bila perlu.',422);
        $width=min(256,(int)$properties['gridProperties']['columnCount']);$cells=$this->cells($sheet);$headers=[];
        for($column=1;$column<=$width;$column++) {
            $label=trim($cells[$header][$column]['text'] ?? '');
            if($label!=='')$headers[]=['column'=>$column,'label'=>mb_strcut($label,0,100,'UTF-8')];
        }
        if(!$headers)throw new ApiError('Header kosong. Periksa baris header pada pengaturan lanjutan.',422);
        $examples=[];
        if($sample)for($row=$header+1;$row<=min($header+5,$rows);$row++){
            $values=[];for($column=1;$column<=$width;$column++)$values[]=mb_substr($cells[$row][$column]['text'] ?? '',0,160);
            if(array_filter($values,static fn($v)=>$v!==''))$examples[]=$values;
        }
        return ['sheet_id'=>$properties['sheetId'],'sheet_name'=>$properties['title'],'header_row'=>$header,'headers'=>$headers,
          'header_hash'=>hash('sha256',json_encode($headers,JSON_THROW_ON_ERROR)),'last_row'=>$rows,'sample'=>$examples];
    }

    public function metadata(?int $gid,int $header,bool $sample=false): array
    {
        $name=null;
        if($gid!==null){
            $book=$this->get('',['fields'=>'sheets(properties(sheetId,title))']);
            foreach($book['sheets'] ?? [] as $item)if(($item['properties']['sheetId'] ?? null)===$gid){$name=$item['properties']['title'];break;}
            if($name===null)throw new ApiError('Tab sheet tidak ditemukan. Salin link dari tab yang ingin digunakan.',422);
        }
        $range=$name===null?'A'.$header.':IV'.($header+($sample?5:0)):self::range($name,1,$header,256,$header+($sample?5:0));
        $book=$this->get('',['fields'=>self::GRID_FIELDS,'ranges'=>$range]);
        foreach($book['sheets'] ?? [] as $sheet)if($gid===null || ($sheet['properties']['sheetId'] ?? null)===$gid)return $this->describe($sheet,$header,$sample);
        throw new ApiError('Tab sheet tidak ditemukan.',422);
    }
    public function page(array $source,bool $retried=false): array
    {
        $cursor = $source['sync_cursor']; $version = $this->version();
        $base = ['protocol'=>1,'spreadsheet_id'=>$this->spreadsheet,'sheet_id'=>(int)$source['sheet_id'],'header_hash'=>$source['header_hash']];
        if (($cursor['kind'] ?? '')==='idle' && ($cursor['version'] ?? '')===$version) return [...$base,'reader_cursor'=>$cursor,'reader_kind'=>'idle','rows'=>[]];
        if (($cursor['kind'] ?? '')!=='scan') $cursor=['protocol'=>2,'kind'=>'scan','after'=>(int)$source['header_row'],'snapshot_id'=>GoogleProtocol::uuid(),'version'=>$version,'stable'=>true];
        $cursor['stable']=$cursor['stable'] && $cursor['version']===$version;
        $start=$cursor['after']+1;$requestedEnd=$cursor['after']+200;
        $anchorColumn=$this->anchorColumn($source['metadata']['headers']);
        $columns=array_values(array_unique([...array_values($source['column_mapping']),...($anchorColumn?[$anchorColumn['column']]:[])]));
        $ranges=[self::range($source['sheet_name'],1,(int)$source['header_row'],256,(int)$source['header_row'])];
        $lastKnown=(int)($cursor['last_row'] ?? $source['metadata']['last_row'] ?? $source['header_row']);
        $withData=$start<=$lastKnown;
        if($withData)foreach($columns as $column)$ranges[]=self::range($source['sheet_name'],$column,$start,$column,$requestedEnd);
        $query=implode('&',array_map(static fn($range)=>'ranges='.rawurlencode($range),$ranges));
        try { $book=$this->get('?fields='.rawurlencode(self::GRID_FIELDS).'&'.$query); }
        catch(ApiError $error) {
            if($error->reason!=='reader_range_changed' || $retried)throw $error;
            $fresh=$this->metadata((int)$source['sheet_id'],(int)$source['header_row']);
            $source['sheet_name']=$fresh['sheet_name'];$source['metadata']=$fresh;
            if(($source['sync_cursor']['kind'] ?? '')==='scan')$source['sync_cursor']['last_row']=$fresh['last_row'];
            return $this->page($source,true);
        }
        $sheet=null;
        foreach($book['sheets'] ?? [] as $candidate)if(($candidate['properties']['sheetId'] ?? null)===(int)$source['sheet_id']){$sheet=$candidate;break;}
        if(!$sheet)throw new ApiError('Tab sheet sumber berubah. Periksa kembali koneksi.',409);
        $metadata=$this->describe($sheet,(int)$source['header_row'],false);
        if($metadata['header_hash']!==$source['header_hash'])throw new ApiError('Kolom spreadsheet berubah. Periksa kembali pemetaan.',409);
        if(!$withData && $start<=$metadata['last_row'] && !$retried){
            $source['metadata']=$metadata;$source['sync_cursor']=[...$cursor,'last_row'=>$metadata['last_row']];
            return $this->page($source,true);
        }
        $cells=$this->cells($sheet);$end=min($metadata['last_row'],$requestedEnd);$events=[];
        if($start<=$end){
            for ($offset=0;$offset<=$end-$start;$offset++) {
                $values=[];
                foreach ($columns as $column) $values[$column]=$cells[$start+$offset][$column]['text'] ?? '';
                $raw=$anchorColumn?($cells[$start+$offset][$anchorColumn['column']]['raw'] ?? null):null;
                $anchor=is_scalar($raw)&&trim((string)$raw)!==''?hash('sha256',json_encode([$anchorColumn['label'],$raw],JSON_THROW_ON_ERROR)):null;
                if($anchor===null && !array_filter($values,static fn($v)=>trim($v)!==''))continue;
                $events[]=['row_number'=>$start+$offset,'values'=>$values,'anchor'=>$anchor,
                  'issue'=>array_filter($columns,static fn($column)=>$cells[$start+$offset][$column]['error'] ?? false)?'CELL_ERROR':null];

            }
        }
        $done=$end>=$metadata['last_row'];
        $next=[...$cursor,'kind'=>$done?'prepare':'scan','after'=>$end,'last_row'=>$metadata['last_row']];
        return [...$base,'reader_kind'=>'scan','sheet_name'=>$metadata['sheet_name'],'rows'=>$events,'reader_cursor'=>$next];
    }

    private function anchorColumn(array $headers): ?array
    {
        // Pilihan bantuan internal, tidak wajib, tidak unik, dan tidak menentukan duplikasi peserta.
        foreach([['timestamp','stempelwaktu','waktupengisian'],['id','idpeserta','responseid','idrespons']] as $names){
            foreach($headers as $header)if(in_array(preg_replace('/[^a-z0-9]/','',strtolower($header['label'])),$names,true))return $header;
        }
        return null;
    }

    private static function range(string $sheet,int $left,int $top,int $right,int $bottom): string
    {
        $letter = static function(int $number): string { $value=''; while($number){$number--; $value=chr(65+$number%26).$value;$number=intdiv($number,26);} return $value; };
        return "'" . str_replace("'","''",$sheet) . "'!" . $letter($left) . $top . ':' . $letter($right) . $bottom;
    }
}
