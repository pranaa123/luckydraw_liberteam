<?php

declare(strict_types=1);

namespace App\Modules\Operator;

use App\Core\View;
use App\Modules\Participants\ParticipantStatus;

final class OperatorController
{
    public function __construct(private readonly array $config)
    {
    }

    public function show(): void
    {
        $session = (new \App\Modules\Auth\AuthService($this->config))->session();
        if (!$session) { header('Location: /login', true, 303); return; }
        // Shell tidak mengambil data peserta, hadiah, atau riwayat.
        View::render('operator', [
            'appName' => $this->config['name'],
            'statuses' => ParticipantStatus::cases(),
            'session' => $session,
        ]);
    }
}
