<?php

declare(strict_types=1);

use App\Modules\Operator\OperatorController;
use App\Modules\Presentation\PresentationController;
use App\Core\JsonApi;
use App\Modules\Participants\ParticipantService;
use App\Modules\Prizes\PrizeService;
use App\Modules\Events\FieldService;
use App\Modules\Events\SettingsService;
use App\Modules\Presentation\BackgroundAsset;
use App\Modules\Draws\DrawService;
use App\Modules\History\HistoryService;
use App\Modules\Participants\ParticipantFilterService;
use App\Modules\Participants\ParticipantBulkService;

return [
    '/login' => static fn () => (new \App\Modules\Auth\AuthController($config))->show(),
    '/api/login' => ['POST' => static fn () => (new \App\Modules\Auth\AuthController($config))->login()],
    '/api/logout' => ['POST' => static fn () => (new \App\Modules\Auth\AuthController($config))->logout()],
    '/api/session' => ['GET' => static fn () => JsonApi::run(static function () use ($config): array {
        $session = (new \App\Modules\Auth\AuthService($config))->requireSession();
        $session->assertRequest();
        return ['id'=>$session->id];
    })],
    '/api/google-sources' => [
        'GET' => static fn () => JsonApi::respond($config, \App\Modules\Imports\Google\GoogleSourceService::class),
        'POST' => static fn () => JsonApi::respond($config, \App\Modules\Imports\Google\GoogleSourceService::class),
    ],
    '/api/imports' => [
        'GET' => static fn () => JsonApi::respond($config, \App\Modules\Imports\ImportService::class),
        'POST' => static fn () => JsonApi::respond($config, \App\Modules\Imports\ImportService::class),
    ],
    '/api/duplicates' => [
        'GET' => static fn () => JsonApi::respond($config, \App\Modules\Participants\DuplicateService::class),
        'POST' => static fn () => JsonApi::respond($config, \App\Modules\Participants\DuplicateService::class),
    ],
    '/api/participant-filters' => [
        'GET' => static fn () => JsonApi::respond($config, ParticipantFilterService::class),
        'POST' => static fn () => JsonApi::respond($config, ParticipantFilterService::class),
    ],
    '/api/participant-bulk' => ['POST' => static fn () => JsonApi::respond($config, ParticipantBulkService::class)],
    '/api/history' => ['GET' => static fn () => JsonApi::respond($config, HistoryService::class)],
    '/api/winners' => ['GET' => static fn () => JsonApi::respond($config, \App\Modules\History\WinnerService::class)],
    '/api/draws' => [
        'GET' => static fn () => JsonApi::respond($config, DrawService::class),
        'POST' => static fn () => JsonApi::respond($config, DrawService::class),
    ],
    '/' => static fn () => (new OperatorController($config))->show(),
    '/output' => static fn () => (new PresentationController($config))->show(),
    '/api/participants' => [
        'GET' => static fn () => JsonApi::respond($config, ParticipantService::class),
        'POST' => static fn () => JsonApi::respond($config, ParticipantService::class),
    ],
    '/api/prizes' => [
        'GET' => static fn () => JsonApi::respond($config, PrizeService::class),
        'POST' => static fn () => JsonApi::respond($config, PrizeService::class),
    ],
    '/api/fields' => [
        'GET' => static fn () => JsonApi::respond($config, FieldService::class),
        'POST' => static fn () => JsonApi::respond($config, FieldService::class),
    ],
    '/api/settings' => [
        'GET' => static fn () => JsonApi::respond($config, SettingsService::class),
        'POST' => static fn () => JsonApi::respond($config, SettingsService::class),
    ],
    '/api/backgrounds' => [
        'POST' => static fn () => (new \App\Modules\Presentation\BackgroundController($config))->upload(),
    ],
    '/api/health' => static function (): void {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['status' => 'ok', 'stage' => 'foundation'], JSON_THROW_ON_ERROR);
    },
];
