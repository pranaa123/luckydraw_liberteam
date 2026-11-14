<?php

declare(strict_types=1);

namespace App\Modules\Auth;

use App\Core\Database;

/** SQL autentikasi terpisah dari koneksi data acara yang dibatasi RLS. */
final class AuthRepository
{
    public function __construct(private readonly Database $database) {}

    public function user(string $email): ?array
    {
        return $this->database->query('SELECT id,email,password_hash,enabled FROM doorprize_auth.users WHERE email=?', [$email])[0] ?? null;
    }

    public function session(string $hash): ?array
    {
        return $this->database->query('SELECT s.id,s.user_id,u.email,extract(epoch FROM s.expires_at)::bigint AS expires_at FROM doorprize_auth.sessions s JOIN doorprize_auth.users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>now() AND u.enabled', [$hash])[0] ?? null;
    }

    public function attempt(string $key): int
    {
        return (int) $this->database->query("INSERT INTO doorprize_auth.login_attempts(key,attempts) VALUES (?,1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN login_attempts.started_at<now()-interval '10 minutes' THEN 1 ELSE login_attempts.attempts+1 END, started_at=CASE WHEN login_attempts.started_at<now()-interval '10 minutes' THEN now() ELSE login_attempts.started_at END RETURNING attempts", [$key])[0]['attempts'];
    }

    public function createSession(string $id, string $userId, string $hash, int $expires, string $attemptKey, ?string $oldHash): void
    {
        $this->database->transaction(function () use ($id, $userId, $hash, $expires, $attemptKey, $oldHash): void {
            $this->database->query('DELETE FROM doorprize_auth.sessions WHERE expires_at<=now() OR token_hash=?', [$oldHash ?? '']);
            $this->database->query('DELETE FROM doorprize_auth.login_attempts WHERE key=? OR started_at<now()-interval \'1 day\'', [$attemptKey]);
            $this->database->query('INSERT INTO doorprize_auth.sessions(id,user_id,token_hash,expires_at) VALUES (?,?,?,to_timestamp(?))', [$id,$userId,$hash,$expires]);
        });
    }

    public function revoke(string $id): void
    {
        $this->database->query('DELETE FROM doorprize_auth.sessions WHERE id=?', [$id]);
    }

    public function provision(string $email, string $hash): void
    {
        $this->database->transaction(function () use ($email, $hash): void {
            $this->database->query('SELECT pg_advisory_xact_lock(8091001)');
            if ($this->database->query('SELECT id FROM doorprize_auth.users LIMIT 1')) throw new \App\Core\ApiError('Akun pemilik sudah dibuat.', 409);
            // UUID workspace awal dipertahankan: peserta/riwayat/background tidak dipindahkan.
            $this->database->query('INSERT INTO doorprize_auth.users(id,email,password_hash) VALUES (?,?,?)', ['00000000-0000-4000-8000-000000000001',$email,$hash]);
        });
    }
}
