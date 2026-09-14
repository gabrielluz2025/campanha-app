<?php
/**
 * One-shot: apaga igrejas_custom duplicadas (mesmo templo) e lixo (crematório etc.).
 * Remover este arquivo do servidor depois de usar.
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

$DELETE = [
    2041,2044,2056,2065,2101,2162,2167,2168,2194,2196,2197,2208,2210,2213,2214,2215,2216,
    2219,2220,2221,2222,2223,2224,2226,2227,2230,2232,2233,2243,2250,2254,2255,2256,2257,
    2258,2259,2263,2266,2267,2268,2269,2271,2272,2274,2275,2276,2277,2279,2280,2282,2283,
    2284,2285,2287,2290,2293,2294,2296,2298,2301,2302,2303,2304,2306,2307,2308,2309,2310,
    2311,2312,2313,2314,2315,2317,2318,2320,2321,2322,2323,2324,2326,2327,2328,2329,2331,
    2332,2333,2334,2336,2338,2339,2340,2341,2343,2344,2360,2362,2371,2377,2378,2379,2380,
    2381,2382,2383,
];
$REMAP = [
    2041=>56,2044=>1085,2056=>1137,2065=>1070,2101=>1023,2162=>42,2167=>1164,2168=>1106,
    2194=>1027,2196=>1061,2197=>1,2208=>40,2210=>39,2213=>1047,2214=>1155,2215=>1103,
    2216=>1096,2219=>1128,2220=>1070,2221=>1059,2222=>1137,2223=>1149,2224=>1149,2226=>1043,
    2227=>1010,2230=>1079,2232=>1085,2233=>1096,2243=>1034,2250=>42,2254=>2166,2255=>1164,
    2256=>1106,2257=>2169,2258=>2170,2259=>2171,2263=>2175,2266=>2178,2267=>2179,2268=>2180,
    2269=>2181,2271=>2183,2272=>2184,2274=>2186,2275=>2187,2276=>2188,2277=>2189,2279=>2191,
    2280=>2192,2282=>1027,2283=>2195,2284=>1061,2285=>1,2287=>2199,2290=>2202,2293=>2205,
    2294=>2206,2296=>40,2298=>39,2301=>1047,2302=>1155,2303=>1103,2304=>1096,2306=>2218,
    2307=>1128,2308=>1070,2309=>1059,2310=>1137,2311=>1149,2312=>1149,2313=>2225,2314=>1043,
    2315=>1010,2317=>2229,2318=>1079,2320=>1085,2321=>1096,2322=>2234,2323=>2235,2324=>2236,
    2326=>2238,2327=>2239,2328=>2240,2329=>2241,2331=>1034,2332=>2244,2333=>2245,2334=>2246,
    2336=>2248,2338=>22,2339=>63,2340=>9,2341=>18,2343=>48,2344=>17,2360=>19,2362=>82,
    2371=>41,2377=>2370,2378=>41,2379=>2372,2380=>2373,2381=>2374,2382=>2375,2383=>2376,
];

function nome_lixo($nome) {
    $n = mb_strtoupper((string)$nome, 'UTF-8');
    $n = preg_replace('/\s+/', ' ', $n);
    $needles = [
        'CREMATÓRIO', 'CREMATORIO', 'HEKARA', 'ÁRVORE SAGRADA', 'ARVORE SAGRADA',
        'AUTOCONHECIMENTO', 'CLUBE DE AVENTUREIROS', 'CHOSEN KIDS',
        'MONUMENTO 500',
    ];
    foreach ($needles as $k) {
        if (mb_strpos($n, $k) !== false) return true;
    }
    return false;
}

function limpo($v) {
    $s = trim((string)$v);
    if ($s === '' || $s === '—' || $s === '-' || $s === '–') return '';
    return $s;
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

$deleteSet = array_fill_keys($DELETE, true);
$stmt = $pdo->query("SELECT tenant_id, `key`, `value` FROM store WHERE `key` IN ('igrejas_custom','igrejas_enrich','geo_coords_igrejas','igrejas_visitas','pastores_igrejas')");
$byTenant = [];
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    $tid = $row['tenant_id'];
    if (!isset($byTenant[$tid])) $byTenant[$tid] = [];
    $byTenant[$tid][$row['key']] = json_decode($row['value'], true);
}

$out = ['ok' => true, 'apply' => $apply, 'tenants' => []];

foreach ($byTenant as $tid => $bag) {
    $custom = (isset($bag['igrejas_custom']) && is_array($bag['igrejas_custom'])) ? $bag['igrejas_custom'] : [];
    $enrich = (isset($bag['igrejas_enrich']) && is_array($bag['igrejas_enrich'])) ? $bag['igrejas_enrich'] : [];
    $coords = (isset($bag['geo_coords_igrejas']) && is_array($bag['geo_coords_igrejas'])) ? $bag['geo_coords_igrejas'] : [];
    $visitas = (isset($bag['igrejas_visitas']) && is_array($bag['igrejas_visitas'])) ? $bag['igrejas_visitas'] : [];
    $pastores = (isset($bag['pastores_igrejas']) && is_array($bag['pastores_igrejas'])) ? $bag['pastores_igrejas'] : [];

    $byCustomId = [];
    foreach ($custom as $ig) {
        if (is_array($ig) && isset($ig['id'])) $byCustomId[(int)$ig['id']] = $ig;
    }

    $manter = [];
    $idsFora = [];
    $lixo = 0;
    foreach ($custom as $ig) {
        if (!is_array($ig)) continue;
        $id = (int)($ig['id'] ?? 0);
        $isLixo = nome_lixo($ig['nome'] ?? '');
        if ($isLixo) $lixo++;
        if (($id && isset($deleteSet[$id])) || $isLixo) {
            $idsFora[] = $id;
            $keepId = $REMAP[$id] ?? null;
            if ($keepId && !$isLixo) {
                $patch = [];
                foreach (['telefone','whatsapp','website','instagram','facebook','cep','googlePlaceId'] as $f) {
                    if (limpo($ig[$f] ?? '')) $patch[$f] = $ig[$f];
                }
                if ($patch) {
                    $prev = $enrich[$keepId] ?? $enrich[(string)$keepId] ?? [];
                    $enrich[$keepId] = array_merge(is_array($prev) ? $prev : [], $patch);
                    if (isset($byCustomId[$keepId])) {
                        $byCustomId[$keepId] = array_merge($byCustomId[$keepId], $patch);
                    }
                }
            }
            continue;
        }
        $manter[] = $ig;
    }

    foreach ($manter as $i => $ig) {
        $id = (int)($ig['id'] ?? 0);
        if ($id && isset($byCustomId[$id])) $manter[$i] = $byCustomId[$id];
    }

    foreach ($idsFora as $id) {
        unset($enrich[$id], $enrich[(string)$id], $coords[$id], $coords[(string)$id]);
        $keepId = $REMAP[$id] ?? null;
        if ($keepId) {
            if (!empty($visitas[$id]) && empty($visitas[$keepId])) $visitas[$keepId] = $visitas[$id];
            if (!empty($pastores[$id]) && empty($pastores[$keepId])) $pastores[$keepId] = $pastores[$id];
        }
        unset($visitas[$id], $visitas[(string)$id], $pastores[$id], $pastores[(string)$id]);
    }

    $rowOut = [
        'tenant' => substr($tid, 0, 8),
        'antes' => count($custom),
        'depois' => count($manter),
        'removidas' => count($custom) - count($manter),
        'lixo' => $lixo,
    ];

    if ($apply) {
        $upd = $pdo->prepare('UPDATE store SET `value` = ?, updated_at = NOW() WHERE tenant_id = ? AND `key` = ?');
        $upd->execute([json_encode(array_values($manter), JSON_UNESCAPED_UNICODE), $tid, 'igrejas_custom']);
        $upd->execute([json_encode($enrich, JSON_UNESCAPED_UNICODE), $tid, 'igrejas_enrich']);
        $upd->execute([json_encode($coords, JSON_UNESCAPED_UNICODE), $tid, 'geo_coords_igrejas']);
        $upd->execute([json_encode($visitas, JSON_UNESCAPED_UNICODE), $tid, 'igrejas_visitas']);
        $upd->execute([json_encode($pastores, JSON_UNESCAPED_UNICODE), $tid, 'pastores_igrejas']);
    }

    $out['tenants'][] = $rowOut;
}

echo json_encode($out, JSON_UNESCAPED_UNICODE);
