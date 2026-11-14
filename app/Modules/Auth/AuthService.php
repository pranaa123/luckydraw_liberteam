<?php

declare(strict_types=1);

namespace App\Modules\Auth;

use App\Core\ApiError;
use App\Core\Database;

final class AuthService
{
    private readonly AuthRepository $records;

    public function __construct(private readonly array $config)
    {
        $this->records = new AuthRepository(new Database($config['database']));
    }

    public function session(): ?AuthSession
    {
        $token = $_COOKIE[AuthSession::COOKIE] ?? '';
        if (!is_string($token) || !preg_match('/^[a-f0-9]{64}$/D', $token)) return null;
        $row = $this->records->session(hash('sha256', $token));
        return $row ? new AuthSession($row['id'], $row['user_id'], $row['email'], (int) $row['expires_at'], AuthSession::csrf($token)) : null;
    }

    public function requireSession(): AuthSession
    {
        return $this->session() ?? throw new ApiError('Silakan masuk terlebih dahulu.', 401);
    }

    public function login(array $input): array
    {
        $key = hash('sha256', $_SERVER['REMOTE_ADDR'] ?? 'local');
        if ($this->records->attempt($key) > 10) throw new ApiError('Terlalu banyak percobaan masuk. Coba lagi dalam 10 menit.', 429);
        $email = is_string($input['email'] ?? null) ? strtolower(trim($input['email'])) : '';
        $password = $input['password'] ?? null;
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email)>254 || !is_string($password) || strlen($password)>72) {
            throw new ApiError('Email atau password tidak sesuai.', 401);
        }
        $user = $this->records->user($email);
        // Hash tetap membuat waktu verifikasi akun tak dikenal setara dengan akun yang ada.
        $valid = password_verify($password, $user['password_hash'] ?? '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.');
        if (!$valid || !$user || !$user['enabled']) throw new ApiError('Email atau password tidak sesuai.', 401);
        $token = bin2hex(random_bytes(32));
        $id = AuthSession::uuid();
        $expires = time() + AuthSession::LIFETIME;
        $oldToken = $_COOKIE[AuthSession::COOKIE] ?? null;
        $this->records->createSession($id, $user['id'], hash('sha256', $token), $expires, $key, is_string($oldToken) ? hash('sha256', $oldToken) : null);
        AuthSession::cookie($token, $expires);
        return ['redirect' => '/'];
    }

    public function logout(AuthSession $session): array
    {
        $this->records->revoke($session->id);
        AuthSession::cookie('', time()-3600);
        return ['redirect' => '/login'];
    }

    public function provision(array $input): void
    {
        if ($this->config['environment'] !== 'local') throw new ApiError('Pembuatan akun ini hanya untuk persiapan lokal.', 403);
        $email = strtolower(trim($input['email'] ?? ''));
        $password = $input['password'] ?? '';
        if (!filter_var($email, FILTER_VALIDATE_EMAIL) || strlen($email)>254) throw new ApiError('Email tidak valid.');
        if (!is_string($password) || strlen($password)<8 || strlen($password)>72) throw new ApiError('Password harus 8–72 karakter.');
        $this->records->provision($email, password_hash($password, PASSWORD_BCRYPT, ['cost'=>10]));
    }
}
