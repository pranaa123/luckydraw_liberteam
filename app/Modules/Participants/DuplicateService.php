<?php

declare(strict_types=1);

namespace App\Modules\Participants;

use App\Core\ApiError;
use App\Modules\Events\FieldRepository;
use App\Modules\Events\EventContext;

final class DuplicateService
{
    public const ACTIONS = ['update'];
    public function __construct(private readonly EventContext $event) {}

    public function list(): array
    {
        $fields = (new FieldRepository($this->event))->all();
        $policy = (new DuplicateRepository($this->event))->policy();
        return ['id' => $this->event->id, 'keys' => DuplicatePolicy::decode($policy['duplicate_keys']), 'version' => (int) $policy['duplicate_rule_version'],
          'participants_version' => (int) $policy['participants_version'], 'field_schema' => ParticipantFilter::schema($fields),
          'fields' => [['key' => 'name', 'label' => 'Nama'], ...array_map(static fn ($field) => ['key' => 'field_' . $field['slot'], 'label' => $field['label']], $fields)]];
    }

    public function save(string $action, array $input): array
    {
        return $this->event->mutate('duplicate_rule', 'update', function () use ($input): array {
            $fields = (new FieldRepository($this->event))->all(); $records = new DuplicateRepository($this->event); $old = $records->policy();
            if (($input['version'] ?? null) !== (int) $old['duplicate_rule_version'] || ($input['field_schema'] ?? null) !== ParticipantFilter::schema($fields)) throw new ApiError('Aturan/isian duplikasi sudah berubah. Muat ulang pengaturan.', 409);
            $keys = DuplicatePolicy::keys($input['keys'] ?? null, $fields);
            if ($keys !== DuplicatePolicy::decode($old['duplicate_keys'])) { $records->setPolicy($keys); $records->reconcile(); }
            return $this->list();
        });
    }
}
