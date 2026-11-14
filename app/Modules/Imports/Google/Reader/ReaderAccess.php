<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google\Reader;

use App\Core\ApiError;
use App\Core\Environment;
use App\Core\SecretVault;
use App\Modules\Events\EventContext;

final class ReaderAccess
{
    public static function email(): string { return Environment::get('GOOGLE_READER_EMAIL'); }
    public static function ready(): bool { return self::email()!=='' && Environment::get('GOOGLE_READER_AUDIENCE')!==''; }

    public function __construct(private readonly EventContext $event, private readonly ReaderHttp $http) {}

    public function token(): string
    {
        if (!self::ready()) throw new ApiError('Koneksi Google aplikasi belum dikonfigurasi.',503);
        $records = new ReaderRepository($this->event);
        $cached = $records->access();
        if ($cached) return (new SecretVault())->decrypt($cached);
        $identity = $_SERVER['HTTP_X_VERCEL_OIDC_TOKEN'] ?? Environment::get('VERCEL_OIDC_TOKEN');
        if (function_exists('post_message_to_js') && getenv('VERCEL_OIDC_TOKEN')===false) {
            $local = json_decode(post_message_to_js('{"type":"google_reader_identity"}'),true);
            $identity = $local['token'] ?? '';
        }
        if (!$identity) throw new ApiError('Identitas Google aplikasi belum tersedia. Hubungi pengelola aplikasi.',503);
        $federated = $this->http->request('https://sts.googleapis.com/v1/token',null,[
          'audience'=>Environment::get('GOOGLE_READER_AUDIENCE'),'grantType'=>'urn:ietf:params:oauth:grant-type:token-exchange',
          'requestedTokenType'=>'urn:ietf:params:oauth:token-type:access_token','scope'=>'https://www.googleapis.com/auth/cloud-platform',
          'subjectTokenType'=>'urn:ietf:params:oauth:token-type:jwt','subjectToken'=>$identity]);
        $email = self::email();
        if (!preg_match('/^[a-z0-9-]+@[a-z0-9-]+\.iam\.gserviceaccount\.com$/D',$email)) throw new ApiError('Identitas pembaca Google tidak valid.',503);
        $access = $this->http->request('https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/' . $email . ':generateAccessToken',$federated['access_token'] ?? '',[
          'scope'=>['https://www.googleapis.com/auth/spreadsheets.readonly','https://www.googleapis.com/auth/drive.metadata.readonly'],'lifetime'=>'3600s']);
        if (!is_string($access['accessToken'] ?? null) || !is_string($access['expireTime'] ?? null)) throw new ApiError('Token Google belum tersedia.',502);
        $records->cacheAccess((new SecretVault())->encrypt($access['accessToken']),$access['expireTime']);
        return $access['accessToken'];
    }
}
