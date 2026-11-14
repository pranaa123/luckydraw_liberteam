<?php

declare(strict_types=1);

namespace App\Modules\Auth;

use App\Core\JsonApi;
use App\Core\View;

final class AuthController
{
    public function __construct(private readonly array $config) {}

    public function show(): void
    {
        if ((new AuthService($this->config))->session()) {
            header('Location: /', true, 303);
            return;
        }
        View::render('login', ['appName'=>$this->config['name']]);
    }

    public function login(): void
    {
        JsonApi::run(function (): array {
            JsonApi::assertSameOrigin();
            return (new AuthService($this->config))->login(JsonApi::input());
        });
    }

    public function logout(): void
    {
        JsonApi::run(function (): array {
            JsonApi::assertSameOrigin();
            $service = new AuthService($this->config);
            $session = $service->requireSession();
            $session->assertRequest();
            return $service->logout($session);
        });
    }
}
