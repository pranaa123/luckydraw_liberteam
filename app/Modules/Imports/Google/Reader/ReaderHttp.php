<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google\Reader;

use App\Core\ApiError;
use App\Modules\Events\EventContext;

/** HTTP Google saja, batas waktu/ukuran tetap; tidak membawa SQL atau aturan peserta. */
final class ReaderHttp
{
    private readonly float $deadline;
    public function __construct(private readonly EventContext $event, public ?string $job = null, private readonly string $flow = '')
    {
        if ($job !== null && !preg_match('/^[a-f0-9-]{36}$/D',$job)) throw new ApiError('Permintaan Google tidak valid.');
        $this->deadline = microtime(true) + 10;
    }

    public function request(string $url, ?string $token = null, ?array $body = null): array
    {
        $parts = parse_url($url);
        if (!$parts || ($parts['scheme'] ?? '') !== 'https' || isset($parts['user']) || isset($parts['port']) || !in_array($parts['host'] ?? '',['sts.googleapis.com','iamcredentials.googleapis.com','sheets.googleapis.com','www.googleapis.com'],true)) throw new \LogicException('Alamat pembaca Google tidak diizinkan.');
        $headers = ['Content-Type: application/json'];
        if ($token !== null) $headers[] = 'Authorization: Bearer ' . $token;
        if (function_exists('post_message_to_js')) {
            $reply = json_decode(post_message_to_js(json_encode(['type'=>'google_reader_http','job_id'=>$this->job,'scope'=>$this->event->ownerId . ':' . $this->event->id,'flow'=>$this->flow,'url'=>$url,'headers'=>$headers,'body'=>$body],JSON_THROW_ON_ERROR)),true,64,JSON_THROW_ON_ERROR);
            if (isset($reply['pending'])) throw new ReaderPending($reply['pending']);
            if (isset($reply['error'])) throw new ApiError('Google belum dapat diakses. Data tersimpan tetap tersedia.',502);
            $status = $reply['status']; $data = $reply['data'];
        } else {
            $bytes = ''; $curl = curl_init($url);
            curl_setopt_array($curl,[CURLOPT_HTTPHEADER=>$headers,CURLOPT_CONNECTTIMEOUT=>2,CURLOPT_TIMEOUT_MS=>max(1,(int)(($this->deadline-microtime(true))*1000)),CURLOPT_FOLLOWLOCATION=>false,CURLOPT_PROTOCOLS=>CURLPROTO_HTTPS,
              CURLOPT_WRITEFUNCTION=>static function ($handle,string $chunk) use (&$bytes): int { if (strlen($bytes)+strlen($chunk)>2097152) return 0; $bytes.=$chunk; return strlen($chunk); }]);
            if ($body !== null) curl_setopt_array($curl,[CURLOPT_POST=>true,CURLOPT_POSTFIELDS=>json_encode($body,JSON_THROW_ON_ERROR)]);
            $ok = curl_exec($curl); $status = curl_getinfo($curl,CURLINFO_RESPONSE_CODE); curl_close($curl);
            if ($ok === false) throw new ApiError('Google belum merespons. Data tersimpan tetap tersedia; sinkronisasi akan dicoba kembali.',502);
            $data = json_decode($bytes,true,64);
        }
        if ($status!==200 && in_array($parts['host'],['sts.googleapis.com','iamcredentials.googleapis.com'],true)) throw new ApiError('Identitas Google aplikasi belum dapat digunakan. Hubungi pengelola aplikasi.',503);
        if ($status===403 || $status===404) throw new ApiError('Spreadsheet belum bisa dibaca. Bagikan sebagai Viewer ke email aplikasi, lalu periksa kembali link dan tab sheet.',422);
        if ($status===400) throw new ApiError('Tab atau rentang spreadsheet berubah. Periksa kembali koneksi.',409,'reader_range_changed');
        if ($status===401) {
            (new ReaderRepository($this->event))->clearAccess();
            throw new ApiError('Izin Google sementara kedaluwarsa. Coba lagi.',502);
        }
        if ($status!==200 || !is_array($data)) throw new ApiError('Google belum dapat memproses permintaan. Data tersimpan tetap tersedia.',502);
        return $data;
    }

    public function close(): void
    {
        if($this->job!==null && function_exists('post_message_to_js')){
            post_message_to_js(json_encode(['type'=>'google_reader_done','job_id'=>$this->job,'scope'=>$this->event->ownerId . ':' . $this->event->id,'flow'=>$this->flow],JSON_THROW_ON_ERROR));
            $this->job=null;
        }
    }
}
