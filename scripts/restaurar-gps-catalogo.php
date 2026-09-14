<?php
/**
 * One-shot: tira endereço/GPS trocado pelo Google no catálogo
 * (Água Verde não pode ficar na Rua Eça de Queiroz) e devolve
 * o GPS geocodificado das demais fichas oficiais.
 */
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
$maxId = 1999;
$bloquear = [56]; // AD Água Verde — Google colou na Eça de Queiroz 725
$restaurar = json_decode('__RESTORE_JSON__', true);
if (!is_array($restaurar)) $restaurar = [];

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

$stmt = $pdo->query("SELECT tenant_id, `key`, `value` FROM store WHERE `key` IN ('igrejas_enrich','geo_coords_igrejas')");
$byTenant = [];
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $tid = $row['tenant_id'];
    if (!isset($byTenant[$tid])) $byTenant[$tid] = [];
    $byTenant[$tid][$row['key']] = json_decode($row['value'], true);
}

$out = ['ok' => true, 'apply' => $apply, 'tenants' => []];

foreach ($byTenant as $tid => $bag) {
    $enrich = (isset($bag['igrejas_enrich']) && is_array($bag['igrejas_enrich'])) ? $bag['igrejas_enrich'] : [];
    $coords = (isset($bag['geo_coords_igrejas']) && is_array($bag['geo_coords_igrejas'])) ? $bag['geo_coords_igrejas'] : [];
    $enrichLimpas = 0;
    $coordsBloqueadas = 0;
    $coordsRestauradas = 0;

    foreach (array_keys($enrich) as $key) {
        $id = (int)$key;
        if ($id <= 0 || $id > $maxId) continue;
        $rowE = $enrich[$key];
        if (!is_array($rowE)) continue;
        $mudou = false;
        foreach (['endereco', 'lat', 'lng', 'setor'] as $f) {
            if (array_key_exists($f, $rowE)) {
                unset($rowE[$f]);
                $mudou = true;
            }
        }
        if ($mudou) {
            $enrich[$key] = $rowE;
            $enrich[(int)$key] = $rowE;
            $enrichLimpas++;
        }
    }

    foreach ($bloquear as $id) {
        if (isset($coords[$id]) || isset($coords[(string)$id])) {
            unset($coords[$id], $coords[(string)$id]);
            $coordsBloqueadas++;
        }
    }

    $tenantPrincipal = strpos((string)$tid, 'c0a1b2c3') === 0;
    if ($tenantPrincipal) {
        foreach ($restaurar as $key => $xy) {
            $id = (int)$key;
            if ($id <= 0 || $id > $maxId || in_array($id, $bloquear, true)) continue;
            if (!is_array($xy) || !isset($xy['lat'], $xy['lng'])) continue;
            $coords[(string)$id] = ['lat' => (float)$xy['lat'], 'lng' => (float)$xy['lng']];
            $coordsRestauradas++;
        }
    }

    $rowOut = [
        'tenant' => substr($tid, 0, 8),
        'enrichLimpas' => $enrichLimpas,
        'coordsBloqueadas' => $coordsBloqueadas,
        'coordsRestauradas' => $coordsRestauradas,
    ];

    if ($apply) {
        $upd = $pdo->prepare('UPDATE store SET `value` = ?, updated_at = NOW() WHERE tenant_id = ? AND `key` = ?');
        $upd->execute([json_encode($enrich, JSON_UNESCAPED_UNICODE), $tid, 'igrejas_enrich']);
        $upd->execute([json_encode($coords, JSON_UNESCAPED_UNICODE), $tid, 'geo_coords_igrejas']);
    }

    $out['tenants'][] = $rowOut;
}

echo json_encode($out, JSON_UNESCAPED_UNICODE);
