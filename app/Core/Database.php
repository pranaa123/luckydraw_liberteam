<?php

declare(strict_types=1);

namespace App\Core;

use PDO;
use RuntimeException;

/** Koneksi dibuat hanya ketika modul benar-benar membutuhkan database. */
final class Database
{
    private ?PDO $connection = null;
    private int $depth = 0;

    public function __construct(private readonly array $config, private readonly ?string $ownerId = null)
    {
    }

    public function connection(): PDO
    {
        if ($this->connection !== null) {
            return $this->connection;
        }

        if (!str_starts_with($this->config['dsn'], 'pgsql:')) {
            throw new RuntimeException('Konfigurasi PostgreSQL belum tersedia.');
        }

        $this->connection = new PDO(
            $this->config['dsn'],
            $this->config['user'],
            $this->config['password'],
            [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                PDO::ATTR_EMULATE_PREPARES => true,
                PDO::ATTR_PERSISTENT => false,
            ],
        );

        return $this->connection;
    }

    /** Parameter values always stay separate from SQL, including in the local portable runtime. */
    public function query(string $sql, array $parameters = []): array
    {
        if ($this->ownerId !== null && $this->depth === 0) {
            return $this->transaction(fn (): array => $this->execute($sql, $parameters));
        }
        return $this->execute($sql, $parameters);
    }

    private function execute(string $sql, array $parameters = []): array
    {
        if (function_exists('post_message_to_js')) {
            $result = json_decode(post_message_to_js(json_encode([
                'type' => 'database', 'sql' => $sql, 'parameters' => array_values($parameters),
            ], JSON_THROW_ON_ERROR)), true, 512, JSON_THROW_ON_ERROR);
            if (isset($result['error'])) {
                throw new RuntimeException($result['error']);
            }
            return $result['rows'];
        }

        $statement = $this->connection()->prepare($sql);
        $statement->execute(array_values($parameters));
        return $statement->columnCount() > 0 ? $statement->fetchAll() : [];
    }

    public function transaction(callable $operation, bool $readOnlySnapshot = false): mixed
    {
        $level = $this->depth;
        if ($level > 0 && $readOnlySnapshot) throw new RuntimeException('Snapshot harus dimulai pada transaksi utama.');
        $this->execute($level === 0 ? ($readOnlySnapshot ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN') : 'SAVEPOINT doorprize_' . $level);
        $this->depth++;
        try {
            if ($level === 0 && $this->ownerId !== null) {
                $this->execute("SELECT set_config('role','doorprize_app',true),set_config('doorprize.owner_id', ?, true)", [$this->ownerId]);
            }
            $result = $operation($this);
            $this->execute($level === 0 ? 'COMMIT' : 'RELEASE SAVEPOINT doorprize_' . $level);
            return $result;
        } catch (\Throwable $error) {
            $this->execute($level === 0 ? 'ROLLBACK' : 'ROLLBACK TO SAVEPOINT doorprize_' . $level);
            throw $error;
        } finally {
            $this->depth--;
        }
    }
}
