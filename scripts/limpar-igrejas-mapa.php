<?php
header('Content-Type: application/json; charset=utf-8');

define('LIMPA_TOKEN', 'campanha-dedupe-igrejas-20260831-k4');
define('DB_HOST', 'localhost');
define('DB_NAME', 'u176739135_campanha');
define('DB_USER', 'u176739135_hospedagem');
define('DB_PASS', 'Xgames12345.');

$token = (string)($_GET['token'] ?? '');
if (!hash_equals(LIMPA_TOKEN, $token)) {
    http_response_code(403);
    echo json_encode(['ok' => false, 'error' => 'token']);
    exit;
}

$apply = isset($_GET['apply']) && $_GET['apply'] === '1';

$vazias = [
    'igrejas_custom' => '[]',
    'igrejas_enrich' => '{}',
    'geo_coords_igrejas' => '{}',
    'igrejas_overrides' => '{}',
    'igrejas_google_places_cache' => '{}',
    'pastores_igrejas' => '{}',
    'igrejas_notas' => '{}',
    'igrejas_prioridades' => '{}',
    'igrejas_visitas' => '{}',
    'igrejas_mapa_geracao' => '2',
];

try {
    $pdo = new PDO(
        'mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',
        DB_USER, DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'db']);
    exit;
}

$tenants = $pdo->query('SELECT DISTINCT tenant_id FROM store')->fetchAll(PDO::FETCH_COLUMN);
$upd = $pdo->prepare('UPDATE store SET `value` = ?, updated_at = NOW() WHERE tenant_id = ? AND `key` = ?');
$ins = $pdo->prepare('INSERT INTO store (tenant_id, `key`, `value`, updated_at) VALUES (?, ?, ?, NOW())');
$chk = $pdo->prepare('SELECT 1 FROM store WHERE tenant_id = ? AND `key` = ? LIMIT 1');

$out = ['ok' => true, 'apply' => $apply, 'tenants' => []];

foreach ($tenants as $tid) {
    $keys = [];
    foreach ($vazias as $key => $valor) {
        $chk->execute([$tid, $key]);
        $existe = (bool)$chk->fetchColumn();
        if ($apply) {
            if ($existe) $upd->execute([$valor, $tid, $key]);
            else $ins->execute([$tid, $key, $valor]);
        }
        $keys[$key] = $existe ? 'update' : 'insert';
    }
    $out['tenants'][] = ['tenant' => substr((string)$tid, 0, 8), 'keys' => $keys];
}

echo json_encode($out, JSON_UNESCAPED_UNICODE);
