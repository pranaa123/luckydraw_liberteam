<?php

declare(strict_types=1);

namespace App\Core;

use App\Modules\Events\EventContext;
use App\Modules\Auth\AuthService;

final class JsonApi
{
    public static function respond(array $config, string $service): void
    {
        self::run(static function () use ($config, $service): array {
            $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
            $session = (new AuthService($config))->requireSession();
            $session->assertRequest();
            if ($method === 'POST') {
                self::assertSameOrigin();
                $input = self::input();
                $action = $input['action'] ?? '';
                $allowed = defined($service . '::ACTIONS') ? $service::ACTIONS : ['create', 'update', 'delete'];
                if (!in_array($action, $allowed, true)) throw new ApiError('Aksi tidak dikenal.');
            }
            $module = new $service(new EventContext(new Database($config['database'], $session->userId), $session->userId));
            return $method === 'POST' ? $module->save($action, $input) : $module->list();
        });
    }

    public static function input(): array
    {
        if (!str_starts_with(strtolower($_SERVER['CONTENT_TYPE'] ?? ''), 'application/json')) throw new ApiError('Gunakan format JSON.', 415);
        $body = file_get_contents('php://input', false, null, 0, 65537);
        if (strlen($body) > 65536) throw new ApiError('Data permintaan terlalu besar.', 413);
        $input = json_decode($body, true, 32, JSON_THROW_ON_ERROR);
        if (!is_array($input) || array_is_list($input)) throw new ApiError('Format data tidak valid.');
        return $input;
    }

    public static function assertSameOrigin(): void
    {
        RequestOrigin::assertSameOrigin();
    }

    public static function run(callable $operation): void
    {
        header('Content-Type: application/json; charset=utf-8');
        try {
            echo json_encode($operation(), JSON_THROW_ON_ERROR);
        } catch (ApiError $error) {
            http_response_code($error->status);
            echo json_encode(['error' => $error->getMessage()], JSON_THROW_ON_ERROR);
        } catch (\JsonException $error) {
            http_response_code(422);
            echo json_encode(['error' => 'Format JSON tidak valid.']);
        } catch (\Throwable $error) {
            error_log((string) $error);
            http_response_code(503);
            echo json_encode(['error' => 'Penyimpanan belum dapat diakses. Periksa server dan konfigurasi database.']);
        }
    }
}
