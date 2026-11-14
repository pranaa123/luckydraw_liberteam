<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google;

use App\Core\ApiError;

final class GoogleTransport
{
    public function exchange(string $endpoint, array $payload, ?string $job = null): array
    {
        GoogleAddress::endpoint($endpoint);
        if (function_exists('post_message_to_js')) {
            $result = json_decode(post_message_to_js(json_encode(['type' => 'google_http', 'endpoint' => $endpoint, 'payload' => $payload, 'job_id' => $job], JSON_THROW_ON_ERROR)), true, 64, JSON_THROW_ON_ERROR);
            if (isset($result['error'])) throw new ApiError($result['error'], 502);
            return $result;
        }
        $body = json_encode($payload, JSON_THROW_ON_ERROR); $url = $endpoint; $deadline = microtime(true) + 10;
        for ($redirect = 0; $redirect < 4; $redirect++) {
            $bytes = ''; $location = null;
            $curl = curl_init($url);
            $options = [CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
              CURLOPT_CONNECTTIMEOUT => 3, CURLOPT_TIMEOUT_MS => max(1,(int) (($deadline - microtime(true)) * 1000)), CURLOPT_FOLLOWLOCATION => false, CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
              CURLOPT_WRITEFUNCTION => static function ($curl, string $chunk) use (&$bytes): int { if (strlen($bytes) + strlen($chunk) > 524288) return 0; $bytes .= $chunk; return strlen($chunk); },
              CURLOPT_HEADERFUNCTION => static function ($curl, string $header) use (&$location): int { if (stripos($header, 'Location:') === 0) $location = trim(substr($header, 9)); return strlen($header); }];
            if ($body === null) $options[CURLOPT_HTTPGET] = true;
            else { $options[CURLOPT_POST] = true; $options[CURLOPT_POSTFIELDS] = $body; }
            curl_setopt_array($curl,$options);
            $ok = curl_exec($curl); $status = curl_getinfo($curl, CURLINFO_RESPONSE_CODE); curl_close($curl);
            if ($ok === false) throw new ApiError('Google belum merespons. Sinkronisasi akan dicoba kembali.', 502);
            if (in_array($status, [301,302,303,307,308], true)) {
                if (!$location || !GoogleAddress::redirect($location)) throw new ApiError('Pengalihan konektor Google tidak valid.', 502);
                $url = $location; $body = null; continue;
            }
            if ($status !== 200) throw new ApiError('Konektor Google belum dapat diakses. Periksa URL dan izin deployment.', 502);
            $result = json_decode($bytes, true, 64);
            if (!is_array($result)) throw new ApiError('Konektor tidak mengembalikan JSON. Periksa izin aplikasi web Google.', 502);
            return ['response' => $result];
        }
        throw new ApiError('Pengalihan konektor Google terlalu banyak.', 502);
    }
}
