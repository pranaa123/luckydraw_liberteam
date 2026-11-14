<?php

declare(strict_types=1);

namespace App\Modules\Imports\Google\Reader;

/** Hanya runtime lokal WASM: jaringan dilanjutkan tanpa menahan antrean operator. */
final class ReaderPending extends \RuntimeException
{
    public function __construct(public readonly string $job) { parent::__construct('Permintaan Google sedang berjalan.'); }
}
