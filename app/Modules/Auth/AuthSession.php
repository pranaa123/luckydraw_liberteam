<?php

declare(strict_types=1);

namespace App\Modules\Auth;

use App\Core\ApiError;

/** Identitas dari sesi server; tidak pernah mengambil owner dari input operator. */
final class AuthSession
{
    public const COOKIE = 'doorprize_baru_session';
    public const LIFETIME = 30 * 86400;

    public function __construct(
        public readonly string $id,
        public readonly string $userId,
        public readonly string $email,
        public readonly int $expiresAt,
        public readonly string $csrf,
    ) {
    }

    public function assertRequest(): void
    {
        if (!hash_equals($this->id, $_SERVER['HTTP_X_DOORPRIZE_SESSION'] ?? '')) {
            throw new ApiError('Sesi halaman sudah berubah. Silakan masuk kembali.', 401);
        }
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST'
            && !hash_equals($this->csrf, $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '')) {
            throw new ApiError('Permintaan tidak valid. Muat ulang halaman.', 403);
        }
    }

    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 15) | 64);
        $bytes[8] = chr((ord($bytes[8]) & 63) | 128);
        $hex = bin2hex($bytes);
        return substr($hex, 0, 8) . '-' . substr($hex, 8, 4) . '-' . substr($hex, 12, 4) . '-' . substr($hex, 16, 4) . '-' . substr($hex, 20);
    }

    public static function csrf(string $token): string
    {
        return hash_hmac('sha256', 'doorprize-baru-csrf', $token);
    }

    public static function cookie(string $token, int $expires): void
    {
        setcookie(self::COOKIE, $token, [
            'expires' => $expires, 'path' => '/',
            'secure' => \App\Core\Environment::get('APP_ENV', 'local') !== 'local' || (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
            'httponly' => true, 'samesite' => 'Lax',
        ]);
    }
}
