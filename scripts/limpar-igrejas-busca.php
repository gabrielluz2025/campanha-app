<?php
/**
 * One-shot: limpa igrejas da busca sem ficha (em branco / nome genérico).
 * Remover este arquivo do servidor depois de usar.
 */
header('Content-Type: application/json; charset=utf-8');

define('LIMPA_TOKEN', 'campanha-limpa-busca-20260831-x7k9');
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

function limpo($v) {
    $s = trim((string)$v);
    if ($s === '' || $s === '—' || $s === '-' || $s === '–' || $s === '/fotos/sem-foto.jpg') return '';
    return $s;
}

function nome_generico($nome) {
    $n = limpo($nome);
    $n = mb_strtoupper($n, 'UTF-8');
    $n = preg_replace('/\s+/', ' ', preg_replace('/[^A-Z0-9 ]/u', ' ',
        iconv('UTF-8', 'ASCII//TRANSLIT//IGNORE', $n) ?: $n));
    $n = trim($n);
    if (strlen($n) < 8) return true;
    return (bool)preg_match('/^(IGREJA|TEMPLO|CAPELA|PAROQUIA|CHURCH|PLACE OF WORSHIP)$/', $n);
}

function da_busca($ig, $maxId) {
    $f = strtolower((string)($ig['fonte'] ?? ''));
    if (in_array($f, ['osm', 'google', 'nominatim'], true)) return true;
    return (int)($ig['id'] ?? 0) > $maxId;
}

function classificar($ig) {
    $endereco = limpo($ig['endereco'] ?? '');
    $culto = limpo($ig['culto'] ?? '');
    $pastor = limpo($ig['pastor1'] ?? '') !== '' || limpo($ig['pastor2'] ?? '') !== '';
    $tel = limpo($ig['telefone'] ?? '') !== '' || limpo($ig['whatsapp'] ?? '') !== '';
    $redes = limpo($ig['instagram'] ?? '') !== '' || limpo($ig['facebook'] ?? '') !== '' || limpo($ig['website'] ?? '') !== '';
    $contato = $pastor || $tel || $redes;
    $endOk = strlen($endereco) >= 8;
    if (!$endOk && !$contato && $culto === '') return 'branco';
    if ($endOk && $contato) return 'presta';
    return 'parcial';
}

function deve_manter($ig, $maxId) {
    if (!da_busca($ig, $maxId)) return true;
    return classificar($ig) === 'presta';
}

try {
    $pdo = new PDO(
        'mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'db']);
    exit;
}

$stmt = $pdo->query("SELECT tenant_id, `key`, `value` FROM store WHERE `key` IN ('igrejas_custom','igrejas_enrich','geo_coords_igrejas')");
$byTenant = [];
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $tid = $row['tenant_id'];
    if (!isset($byTenant[$tid])) $byTenant[$tid] = [];
    $decoded = json_decode($row['value'], true);
    $byTenant[$tid][$row['key']] = $decoded;
}

$out = ['ok' => true, 'apply' => $apply, 'tenants' => []];

foreach ($byTenant as $tid => $bag) {
    $custom = isset($bag['igrejas_custom']) && is_array($bag['igrejas_custom']) ? $bag['igrejas_custom'] : [];
    $counts = ['total' => count($custom), 'busca' => 0, 'branco' => 0, 'parcial' => 0, 'presta' => 0];
    $manter = [];
    $idsFora = [];
    foreach ($custom as $ig) {
        if (!is_array($ig)) continue;
        if (da_busca($ig, $maxId)) {
            $counts['busca']++;
            $nivel = classificar($ig);
            $counts[$nivel] = ($counts[$nivel] ?? 0) + 1;
        }
        if (deve_manter($ig, $maxId)) $manter[] = $ig;
        else $idsFora[] = $ig['id'] ?? null;
    }
    $idsFora = array_values(array_filter($idsFora, fn($x) => $x !== null && $x !== ''));
    $rowOut = [
        'tenant' => substr($tid, 0, 8),
        'counts' => $counts,
        'antes' => count($custom),
        'depois' => count($manter),
        'removidas' => count($custom) - count($manter),
    ];

    if ($apply && count($idsFora) > 0) {
        $upd = $pdo->prepare('UPDATE store SET `value` = ?, updated_at = NOW() WHERE tenant_id = ? AND `key` = ?');
        $upd->execute([json_encode($manter, JSON_UNESCAPED_UNICODE), $tid, 'igrejas_custom']);

        if (isset($bag['igrejas_enrich']) && is_array($bag['igrejas_enrich'])) {
            $enrich = $bag['igrejas_enrich'];
            foreach ($idsFora as $id) {
                unset($enrich[$id], $enrich[(string)$id]);
            }
            $upd->execute([json_encode($enrich, JSON_UNESCAPED_UNICODE), $tid, 'igrejas_enrich']);
        }
        if (isset($bag['geo_coords_igrejas']) && is_array($bag['geo_coords_igrejas'])) {
            $coords = $bag['geo_coords_igrejas'];
            foreach ($idsFora as $id) {
                unset($coords[$id], $coords[(string)$id]);
            }
            $upd->execute([json_encode($coords, JSON_UNESCAPED_UNICODE), $tid, 'geo_coords_igrejas']);
        }
        $rowOut['gravado'] = true;
    }
    $out['tenants'][] = $rowOut;
}

echo json_encode($out, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
