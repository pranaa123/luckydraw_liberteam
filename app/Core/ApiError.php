<?php

declare(strict_types=1);

namespace App\Core;

final class ApiError extends \RuntimeException
{
    public function __construct(string $message, public readonly int $status = 422, public readonly ?string $reason = null)
    {
        parent::__construct($message);
    }
}
