<meta name="auth-scope" content="<?= \App\Core\View::escape($session->id) ?>">
<meta name="csrf-token" content="<?= \App\Core\View::escape($session->csrf) ?>">
<meta name="auth-expires" content="<?= $session->expiresAt ?>">
<meta name="background-driver" content="<?= \App\Modules\Presentation\BackgroundStorage::cloud() ? 'supabase' : 'local' ?>">
