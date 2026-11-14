<?php

declare(strict_types=1);

namespace App\Modules\Presentation;

use App\Core\View;

final class PresentationController
{
    public function __construct(private readonly array $config)
    {
    }

    public function show(): void
    {
        $session = (new \App\Modules\Auth\AuthService($this->config))->session();
        if (!$session) { header('Location: /login', true, 303); return; }
        View::render('presentation', [
            'appName' => $this->config['name'],
            'isPreview' => ($_GET['preview'] ?? '') === '1',
            'session' => $session,
        ]);
    }
}
