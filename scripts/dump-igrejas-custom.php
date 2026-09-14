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

$tenant = 'c0a1b2c3-d4e5-4f67-8901-abcdef012345';
$stmt = $pdo->prepare("SELECT `key`, `value` FROM store WHERE tenant_id = ? AND `key` IN ('igrejas_custom','igrejas_enrich','geo_coords_igrejas','pastores_igrejas')");
$stmt->execute([$tenant]);
$out = ['ok' => true, 'tenant' => $tenant];
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $out[$row['key']] = json_decode($row['value'], true);
}
echo json_encode($out, JSON_UNESCAPED_UNICODE);
