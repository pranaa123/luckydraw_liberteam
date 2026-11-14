<?php

declare(strict_types=1);

namespace App\Modules\Presentation;

use App\Core\Database;
use App\Core\JsonApi;
use App\Modules\Auth\AuthService;
use App\Modules\Events\EventContext;

final class BackgroundController
{
    public function __construct(private readonly array $config) {}

    public function upload(): void
    {
        JsonApi::run(function (): array {
            $session = (new AuthService($this->config))->requireSession();
            $session->assertRequest();
            JsonApi::assertSameOrigin();
            $event = new EventContext(new Database($this->config['database'], $session->userId), $session->userId);
            return BackgroundStorage::cloud()
                ? (new CloudBackgroundService($event))->save(JsonApi::input())
                : (new BackgroundAsset($event))->upload($_FILES);
        });
    }
}
