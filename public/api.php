<?php
/**
 * API multi-tenant: cada cliente = 1 campanha; vários e-mails compartilham os dados.
 */
$secretsFile = __DIR__.'/api-secrets.php';
if (!file_exists($secretsFile)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'System misconfiguration.']);
    exit;
}
$secrets = require $secretsFile;
if (!is_array($secrets)) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'System misconfiguration.']);
    exit;
}

define('DB_HOST', (string)($secrets['DB_HOST'] ?? 'localhost'));
define('DB_NAME', (string)($secrets['DB_NAME'] ?? ''));
define('DB_USER', (string)($secrets['DB_USER'] ?? ''));
define('DB_PASS', (string)($secrets['DB_PASS'] ?? ''));
define('DEFAULT_TENANT_ID', (string)($secrets['DEFAULT_TENANT_ID'] ?? ''));
define('DEFAULT_TENANT_NAME', (string)($secrets['DEFAULT_TENANT_NAME'] ?? 'Campanha'));
define('SUPABASE_URL', (string)($secrets['SUPABASE_URL'] ?? ''));
define('SUPABASE_ANON_KEY', (string)($secrets['SUPABASE_ANON_KEY'] ?? ''));
define('APP_PUBLIC_URL', (string)($secrets['APP_PUBLIC_URL'] ?? 'https://campanha.space'));
define('BOOTSTRAP_OWNER_EMAILS', (string)($secrets['BOOTSTRAP_OWNER_EMAILS'] ?? ''));

$serviceRole = $secrets['SUPABASE_SERVICE_ROLE_KEY'] ?? getenv('SUPABASE_SERVICE_ROLE_KEY') ?? '';
define('SUPABASE_SERVICE_ROLE_KEY', is_string($serviceRole) && $serviceRole !== '' ? $serviceRole : '');

header('Content-Type: application/json; charset=utf-8');
$allowedOrigins = [
    'https://campanha.space',
    'http://campanha.space',
    'https://www.campanha.space',
    'http://localhost:5173',
    'http://127.0.0.1:5173',
];
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $allowedOrigins, true)) {
    header('Access-Control-Allow-Origin: '.$origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Tenant-Id');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

$RAW_BODY = file_get_contents('php://input') ?: '';
$JSON_BODY = json_decode($RAW_BODY, true);
if (!is_array($JSON_BODY)) $JSON_BODY = null;

try {
    $pdo = new PDO(
        'mysql:host='.DB_HOST.';dbname='.DB_NAME.';charset=utf8mb4',
        DB_USER,
        DB_PASS,
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB: '.$e->getMessage()]);
    exit;
}

ensureSchema($pdo);

$method = $_SERVER['REQUEST_METHOD'];
$action = trim($_GET['action'] ?? '');
$key    = trim($_GET['key'] ?? '');
$bulk   = isset($_GET['bulk']);

// Público: consulta CEP (proxy — ViaCEP falha em alguns celulares/redes)
if ($action === 'cep' && $method === 'GET') {
    $digits = preg_replace('/\D+/', '', (string)($_GET['cep'] ?? ''));
    if (strlen($digits) !== 8) {
        http_response_code(400);
        echo json_encode(['error' => 'CEP inválido.']);
        exit;
    }
    $found = lookupCepServer($digits);
    if (!$found) {
        http_response_code(404);
        echo json_encode(['error' => 'CEP não encontrado.', 'erro' => true]);
        exit;
    }
    echo json_encode($found, JSON_UNESCAPED_UNICODE);
    exit;
}

// Público: extrai Instagram/Facebook do HTML de um site (proxy — evita CORS no app)
if ($action === 'igreja_redes' && $method === 'GET') {
    $url = trim((string)($_GET['url'] ?? ''));
    if (!validateExternalHttpUrl($url)) {
        http_response_code(400);
        echo json_encode(['error' => 'URL inválida ou não permitida.']);
        exit;
    }
    $html = fetchUrlHtml($url, 250000, 3);
    if (!$html) {
        http_response_code(502);
        echo json_encode(['error' => 'Não foi possível ler o site.', 'instagram' => '', 'facebook' => '']);
        exit;
    }
    $redes = extrairRedesSociaisHtml($html);
    echo json_encode($redes, JSON_UNESCAPED_UNICODE);
    exit;
}

// Público: dados do convite (sem login) — tela de criar senha
if ($action === 'invite_info' && $method === 'GET') {
    $token = trim((string)($_GET['token'] ?? ''));
    $info = getInviteInfo($pdo, $token);
    if (!$info) {
        http_response_code(404);
        echo json_encode(['error' => 'Convite inválido ou expirado.']);
        exit;
    }
    echo json_encode($info, JSON_UNESCAPED_UNICODE);
    exit;
}

// Público: info do formulário de cadastro de apoiadores
if ($action === 'lead_form_info' && $method === 'GET') {
    $key = trim((string)($_GET['token'] ?? $_GET['slug'] ?? ''));
    $form = resolveLeadForm($pdo, $key);
    if (!$form || !(int)$form['active']) {
        http_response_code(404);
        echo json_encode(['error' => 'Link de cadastro inválido ou desativado.']);
        exit;
    }
    $stmt = $pdo->prepare('SELECT name FROM tenants WHERE id = ? LIMIT 1');
    $stmt->execute([$form['tenant_id']]);
    $tenantName = (string)($stmt->fetchColumn() ?: 'Campanha');
    leadBumpView($pdo, $form['token'], $form['tenant_id']);
    echo json_encode([
        'ok' => true,
        'tenant_name' => $tenantName,
        'titulo' => $form['titulo'] ?: ('Cadastre-se — '.$tenantName),
        'whatsapp' => $form['whatsapp'] ?: '',
        'token' => $form['token'],
        'slug' => $form['slug'] ?: '',
        'config' => decodeLeadFormConfig($form['config'] ?? null),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Público: clique no botão "Entrar no canal" (WhatsApp Channel)
if ($action === 'lead_canal_click' && $method === 'POST') {
    $token = trim((string)(($JSON_BODY['token'] ?? $_GET['token'] ?? '')));
    $form = resolveLeadForm($pdo, $token);
    if (!$form || !(int)$form['active']) {
        http_response_code(404);
        echo json_encode(['error' => 'Link inválido.']);
        exit;
    }
    leadBumpCanalClick($pdo, $form['token'], $form['tenant_id']);
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit;
}

// Público: envio do formulário (anti-duplicata por telefone)
if ($action === 'lead_form_submit' && $method === 'POST') {
    enforceRateLimit('lead_form_submit', 5);
    $token = trim((string)(($JSON_BODY['token'] ?? $_GET['token'] ?? '')));
    $form = resolveLeadForm($pdo, $token);
    if (!$form || !(int)$form['active']) {
        http_response_code(404);
        echo json_encode(['error' => 'Link de cadastro inválido ou desativado.']);
        exit;
    }

    // Honeypot — bots preenchem; responde sucesso falso
    $honey = trim((string)($JSON_BODY['website'] ?? $JSON_BODY['company'] ?? ''));
    if ($honey !== '') {
        echo json_encode(['ok' => true, 'created' => false, 'updated' => false, 'skipped' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    $nome = trim((string)($JSON_BODY['nome'] ?? ''));
    $email = strtolower(trim((string)($JSON_BODY['email'] ?? '')));
    $telefone = trim((string)($JSON_BODY['telefone'] ?? ''));
    $cidade = trim((string)($JSON_BODY['cidade'] ?? ''));
    $bairro = trim((string)($JSON_BODY['bairro'] ?? ''));
    $profissao = trim((string)($JSON_BODY['profissao'] ?? ''));
    $lgpd = !empty($JSON_BODY['lgpd']);
    $interesses = $JSON_BODY['interesses'] ?? [];
    if (!is_array($interesses)) $interesses = [];
    $extrasIn = $JSON_BODY['extras'] ?? [];
    if (!is_array($extrasIn)) $extrasIn = [];

    $cfg = decodeLeadFormConfig($form['config'] ?? null);
    $camposAtivos = [];
    foreach (($cfg['campos'] ?? []) as $c) {
        if (!empty($c['ativo'])) $camposAtivos[$c['id']] = $c;
    }

    foreach ($camposAtivos as $cid => $c) {
        if (empty($c['obrigatorio'])) continue;
        $label = $c['label'] ?? 'campo';
        if ($cid === 'nome' && mb_strlen($nome) < 2) {
            http_response_code(400);
            echo json_encode(['error' => 'Informe: '.$label], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($cid === 'telefone' && strlen(leadPhoneDigits($telefone)) < 10) {
            http_response_code(400);
            echo json_encode(['error' => 'Informe um celular / WhatsApp válido com DDD.']);
            exit;
        }
        if ($cid === 'email' && $email === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Informe: '.$label], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($cid === 'cidade' && $cidade === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Informe: '.$label], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($cid === 'bairro' && $bairro === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Informe: '.$label], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if ($cid === 'profissao' && $profissao === '') {
            http_response_code(400);
            echo json_encode(['error' => 'Informe: '.$label], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (empty($c['sistema']) || strpos((string)$cid, 'custom_') === 0) {
            if (trim((string)($extrasIn[$cid] ?? '')) === '') {
                http_response_code(400);
                echo json_encode(['error' => 'Informe: '.$label], JSON_UNESCAPED_UNICODE);
                exit;
            }
        }
    }

    if (mb_strlen($nome) < 2) {
        http_response_code(400);
        echo json_encode(['error' => 'Informe seu nome completo.']);
        exit;
    }
    $digTel = leadPhoneDigits($telefone);
    if (strlen($digTel) < 10) {
        http_response_code(400);
        echo json_encode(['error' => 'Informe um celular / WhatsApp válido com DDD.']);
        exit;
    }
    if (!empty($cfg['mostrarLgpd']) && !$lgpd) {
        http_response_code(400);
        echo json_encode(['error' => 'É necessário aceitar a Política de Privacidade (LGPD).']);
        exit;
    }
    if ($email !== '' && !filter_var($email, FILTER_VALIDATE_EMAIL)) {
        http_response_code(400);
        echo json_encode(['error' => 'E-mail inválido.']);
        exit;
    }

    $extras = [];
    foreach ($camposAtivos as $cid => $c) {
        if (!empty($c['sistema']) && in_array($cid, ['nome','email','telefone','cidade','bairro','profissao'], true)) continue;
        $rawVal = $extrasIn[$cid] ?? '';
        if (is_array($rawVal)) $rawVal = $rawVal['value'] ?? '';
        $extras[$cid] = [
            'label' => $c['label'] ?? $cid,
            'value' => trim((string)$rawVal),
        ];
    }
    // ISO auxiliar do front (se enviado)
    if (!empty($extrasIn['data_nascimento_iso'])) {
        $extras['data_nascimento_iso'] = [
            'label' => 'data_nascimento_iso',
            'value' => trim((string)$extrasIn['data_nascimento_iso']),
        ];
    }

    $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
    if (!leadAllowSubmit($pdo, $token, $ip, $digTel)) {
        http_response_code(429);
        echo json_encode(['error' => 'Muitas tentativas. Aguarde um momento e tente de novo.']);
        exit;
    }

    $tenantId = $form['tenant_id'];
    $result = upsertLeadApoiador($pdo, $tenantId, [
        'nome' => $nome,
        'email' => $email,
        'telefone' => leadFormatPhone($digTel),
        'telefone_digits' => $digTel,
        'cidade' => $cidade,
        'bairro' => $bairro !== '' ? $bairro : ($cidade !== '' ? $cidade : 'A definir'),
        'profissao' => $profissao,
        'cep' => trim((string)(is_array($extrasIn['cep'] ?? null) ? ($extrasIn['cep']['value'] ?? '') : ($extrasIn['cep'] ?? ''))),
        'logradouro' => trim((string)(is_array($extrasIn['logradouro'] ?? null) ? ($extrasIn['logradouro']['value'] ?? '') : ($extrasIn['logradouro'] ?? ''))),
        'numero' => trim((string)(is_array($extrasIn['numero'] ?? null) ? ($extrasIn['numero']['value'] ?? '') : ($extrasIn['numero'] ?? ''))),
        'complemento' => trim((string)(is_array($extrasIn['complemento'] ?? null) ? ($extrasIn['complemento']['value'] ?? '') : ($extrasIn['complemento'] ?? ''))),
        'cpf' => trim((string)(is_array($extrasIn['cpf'] ?? null) ? ($extrasIn['cpf']['value'] ?? '') : ($extrasIn['cpf'] ?? ''))),
        'data_nascimento' => trim((string)(is_array($extrasIn['data_nascimento'] ?? null) ? ($extrasIn['data_nascimento']['value'] ?? '') : ($extrasIn['data_nascimento'] ?? ''))),
        'interesses' => array_values(array_filter(array_map('strval', $interesses))),
        'extras' => $extras,
    ]);
    leadLogSubmit($pdo, $token, $ip, $digTel);

    $wa = preg_replace('/\D+/', '', (string)($form['whatsapp'] ?? ''));
    echo json_encode([
        'ok' => true,
        'created' => !empty($result['created']),
        'updated' => !empty($result['updated']),
        'whatsapp' => $wa,
        'message' => !empty($result['updated'])
            ? 'Você já estava na nossa base — atualizamos seus dados. Obrigado!'
            : 'Cadastro recebido! Bem-vindo(a) ao time.',
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// Público: formulário de retirada de material — carregar estoque/coordenadores
if ($action === 'retirada_info' && $method === 'GET') {
    $shareId = trim((string)($_GET['shareId'] ?? ''));
    if ($shareId === '' || !preg_match('/^[a-zA-Z0-9_-]{6,40}$/', $shareId)) {
        http_response_code(400);
        echo json_encode(['error' => 'Link inválido.']);
        exit;
    }
    $key = 'materiais_retirada_pub_'.$shareId;
    $stmt = $pdo->prepare('SELECT `value` FROM store WHERE `key` = ? ORDER BY updated_at DESC LIMIT 1');
    $stmt->execute([$key]);
    $raw = $stmt->fetchColumn();
    if (!$raw) {
        http_response_code(404);
        echo json_encode(['error' => 'Formulário ainda não publicado.']);
        exit;
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        http_response_code(500);
        echo json_encode(['error' => 'Dados inválidos.']);
        exit;
    }
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

// Público: enviar pedido de retirada
if ($action === 'retirada_submit' && $method === 'POST') {
    $shareId = trim((string)(($JSON_BODY['shareId'] ?? $_GET['shareId'] ?? '')));
    $pedido = $JSON_BODY['pedido'] ?? null;
    if ($shareId === '' || !preg_match('/^[a-zA-Z0-9_-]{6,40}$/', $shareId) || !is_array($pedido)) {
        http_response_code(400);
        echo json_encode(['error' => 'Pedido inválido.']);
        exit;
    }
    $pubKey = 'materiais_retirada_pub_'.$shareId;
    $stmt = $pdo->prepare('SELECT tenant_id, `value` FROM store WHERE `key` = ? ORDER BY updated_at DESC LIMIT 1');
    $stmt->execute([$pubKey]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'Formulário não encontrado.']);
        exit;
    }
    $bundle = json_decode($row['value'], true);
    if (!is_array($bundle) || (isset($bundle['ativo']) && !$bundle['ativo'])) {
        http_response_code(403);
        echo json_encode(['error' => 'Formulário desativado.']);
        exit;
    }
    $tenantId = $row['tenant_id'];
    $inboxKey = 'materiais_retirada_inbox_'.$shareId;
    $stmtIn = $pdo->prepare('SELECT `value` FROM store WHERE tenant_id = ? AND `key` = ? LIMIT 1');
    $stmtIn->execute([$tenantId, $inboxKey]);
    $inboxRaw = $stmtIn->fetchColumn();
    $inbox = $inboxRaw ? json_decode($inboxRaw, true) : null;
    $pedidos = [];
    if (is_array($inbox)) {
        $pedidos = isset($inbox['pedidos']) && is_array($inbox['pedidos']) ? $inbox['pedidos'] : (array_values($inbox) === $inbox ? $inbox : []);
    }
    $pid = (string)($pedido['id'] ?? '');
    if ($pid === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Pedido sem id.']);
        exit;
    }
    $pedidos = array_values(array_filter($pedidos, function ($p) use ($pid) {
        return !is_array($p) || (string)($p['id'] ?? '') !== $pid;
    }));
    array_unshift($pedidos, $pedido);
    if (count($pedidos) > 500) $pedidos = array_slice($pedidos, 0, 500);
    $payload = json_encode([
        'pedidos' => $pedidos,
        'atualizadoEm' => date('c'),
    ], JSON_UNESCAPED_UNICODE);
    $stmtSave = $pdo->prepare(
        'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
    );
    $stmtSave->execute([$tenantId, $inboxKey, $payload]);
    echo json_encode(['ok' => true, 'id' => $pid], JSON_UNESCAPED_UNICODE);
    exit;
}

// Público: conferir / carregar contrato para assinar (sem login)
if ($action === 'contrato_info' && $method === 'GET') {
    $c = trim((string)($_GET['c'] ?? $_GET['codigo'] ?? ''));
    $found = contratoAuthLoad($pdo, $c);
    if (!$found) {
        http_response_code(404);
        echo json_encode(['error' => 'Contrato não encontrado.']);
        exit;
    }
    echo json_encode(contratoAuthPublicPayload($found['data']), JSON_UNESCAPED_UNICODE);
    exit;
}

// Público: contratado assina (só atualiza traço + data; não altera o texto)
if ($action === 'contrato_assinar' && $method === 'POST') {
    $c = trim((string)($JSON_BODY['c'] ?? $JSON_BODY['codigo'] ?? $_GET['c'] ?? ''));
    $found = contratoAuthLoad($pdo, $c);
    if (!$found) {
        http_response_code(404);
        echo json_encode(['error' => 'Contrato não encontrado.']);
        exit;
    }
    $data = $found['data'];
    if (!empty($data['assinadoContratadoEm']) && !empty($data['assinaturaContratado'])) {
        echo json_encode(['ok' => true, 'registro' => contratoAuthPublicPayload($data)], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $cpf = preg_replace('/\D+/', '', (string)($JSON_BODY['cpf'] ?? ''));
    if (strlen($cpf) !== 11) {
        http_response_code(400);
        echo json_encode(['error' => 'Informe o CPF completo com 11 dígitos.']);
        exit;
    }
    $cpfHash = (string)($data['cpfHash'] ?? '');
    if ($cpfHash === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Este contrato não tem CPF cadastrado. A campanha precisa salvar de novo.']);
        exit;
    }
    if (hash('sha256', 'cpf:'.$cpf) !== $cpfHash) {
        http_response_code(400);
        echo json_encode(['error' => 'CPF não confere com o cadastro deste contrato.']);
        exit;
    }
    $metodo = strtolower(trim((string)($JSON_BODY['metodo'] ?? 'govbr')));
    if (!in_array($metodo, ['tela', 'govbr'], true)) $metodo = 'govbr';
    if ($metodo === 'govbr') {
        $data['assinaturaContratado'] = 'govbr';
        $data['metodoAssinaturaContratado'] = 'govbr';
    } else {
        if (empty($data['permitirAssinaturaMaoLivre'])) {
            http_response_code(403);
            echo json_encode(['error' => 'A campanha ainda não autorizou a assinatura à mão livre. Siga o passo a passo do Gov.br ou peça a liberação.']);
            exit;
        }
        $img = (string)($JSON_BODY['assinaturaContratado'] ?? '');
        if (strlen($img) < 80 || strlen($img) > 400000 || strpos($img, 'data:image/') !== 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Assinatura inválida. Desenhe de novo no quadro da direita.']);
            exit;
        }
        $data['assinaturaContratado'] = $img;
        $data['metodoAssinaturaContratado'] = 'tela';
    }
    $data['assinadoContratadoEm'] = date('c');
    $data['status'] = !empty($data['assinadoDeputadoEm']) ? 'completo' : 'contratado';
    $data['atualizadoEm'] = $data['assinadoContratadoEm'];
    $encoded = json_encode($data, JSON_UNESCAPED_UNICODE);
    $stmtSave = $pdo->prepare(
        'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
    );
    $stmtSave->execute([$found['tenant_id'], $found['key'], $encoded]);
    echo json_encode(['ok' => true, 'registro' => contratoAuthPublicPayload($data)], JSON_UNESCAPED_UNICODE);
    exit;
}

// Público: rota de carro (proxy OSRM — evita 403/CORS no navegador)
if ($action === 'osrm_route' && $method === 'GET') {
    $coords = trim((string)($_GET['coords'] ?? ''));
    if ($coords === '' || !preg_match('/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?(?:;-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)+$/', $coords)) {
        http_response_code(400);
        echo json_encode(['error' => 'Coordenadas inválidas.']);
        exit;
    }
    if (strlen($coords) > 8000) {
        http_response_code(413);
        echo json_encode(['error' => 'Muitos pontos na rota.']);
        exit;
    }
    $url = 'https://router.project-osrm.org/route/v1/driving/'.$coords.'?overview=full&geometries=geojson';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 18,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT => 'CampanhaApp/1.0 (+https://campanha.space)',
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200 || !$raw) {
        http_response_code($code >= 400 && $code < 600 ? $code : 502);
        echo json_encode(['error' => 'Serviço de rota indisponível.']);
        exit;
    }
    header('Content-Type: application/json; charset=utf-8');
    echo $raw;
    exit;
}

// Público: otimização TSP (proxy OSRM trip)
if ($action === 'osrm_trip' && $method === 'GET') {
    $coords = trim((string)($_GET['coords'] ?? ''));
    if ($coords === '' || !preg_match('/^-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?(?:;-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?)+$/', $coords)) {
        http_response_code(400);
        echo json_encode(['error' => 'Coordenadas inválidas.']);
        exit;
    }
    if (strlen($coords) > 8000) {
        http_response_code(413);
        echo json_encode(['error' => 'Muitos pontos na rota.']);
        exit;
    }
    $qs = trim((string)($_GET['source'] ?? '')) !== ''
        ? http_build_query(array_intersect_key($_GET, array_flip(['source', 'destination', 'roundtrip', 'overview', 'geometries'])))
        : 'source=any&destination=any&roundtrip=false&overview=full&geometries=geojson';
    $url = 'https://router.project-osrm.org/trip/v1/driving/'.$coords.'?'.$qs;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 18,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_USERAGENT => 'CampanhaApp/1.0 (+https://campanha.space)',
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200 || !$raw) {
        http_response_code($code >= 400 && $code < 600 ? $code : 502);
        echo json_encode(['error' => 'Serviço de rota indisponível.']);
        exit;
    }
    header('Content-Type: application/json; charset=utf-8');
    echo $raw;
    exit;
}

// Público: payload da rota (paradas) para o link curto #/rota-equipe/{shareId}
if ($action === 'rota_share') {
    $shareId = parseShareId($JSON_BODY['shareId'] ?? $_GET['shareId'] ?? '', $method === 'POST' ? 12 : 6, $pdo, ['rota_share_']);
    if ($shareId === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Link inválido.']);
        exit;
    }
    $shareKey = 'rota_share_'.$shareId;
    $pubKey   = 'rota_execucao_pub_'.$shareId;

    if ($method === 'GET') {
        assertRotaShareAtivo($pdo, $shareId);
        $stmt = $pdo->prepare('SELECT `value` FROM store WHERE `key` = ? ORDER BY updated_at DESC LIMIT 1');
        $stmt->execute([$shareKey]);
        $raw = $stmt->fetchColumn();
        echo $raw ? $raw : 'null';
        exit;
    }

    if ($method === 'POST') {
        $share = $JSON_BODY['share'] ?? null;
        if (!is_array($share)) {
            http_response_code(400);
            echo json_encode(['error' => 'Dados inválidos.']);
            exit;
        }
        $share['shareId'] = $shareId;
        $share['atualizadoEm'] = date('c');
        if (empty($share['encerrada']) && empty($share['expiraEm']) && empty($share['validoAte'])) {
            $share['expiraEm'] = date('c', time() + 14 * 86400);
        }
        $encoded = json_encode($share, JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded) || strlen($encoded) > 1500000) {
            http_response_code(413);
            echo json_encode(['error' => 'Dados grandes demais.']);
            exit;
        }
        $tenantId = DEFAULT_TENANT_ID;
        $find = $pdo->prepare('SELECT tenant_id FROM store WHERE `key` IN (?, ?) ORDER BY updated_at DESC LIMIT 1');
        $find->execute([$shareKey, $pubKey]);
        $foundTenant = $find->fetchColumn();
        if ($foundTenant) $tenantId = $foundTenant;
        $stmtSave = $pdo->prepare(
            'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
        );
        $stmtSave->execute([$tenantId, $shareKey, $encoded]);
        echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido.']);
    exit;
}

// Público: posição GPS ao vivo (payload leve — atualiza em tempo real sem fotos)
if ($action === 'rota_posicao') {
    if ($method === 'POST') {
        enforceRateLimit('rota_posicao', 120);
    }
    $shareId = parseShareId($JSON_BODY['shareId'] ?? $_GET['shareId'] ?? '', $method === 'POST' ? 12 : 6, $pdo, ['rota_posicao_', 'rota_execucao_', 'rota_execucao_pub_']);
    if ($shareId === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Link inválido.']);
        exit;
    }
    assertRotaShareAtivo($pdo, $shareId);
    $posKey  = 'rota_posicao_'.$shareId;
    $execKey = 'rota_execucao_'.$shareId;
    $pubKey  = 'rota_execucao_pub_'.$shareId;

    if ($method === 'GET') {
        $stmt = $pdo->prepare('SELECT `value` FROM store WHERE `key` = ? ORDER BY updated_at DESC LIMIT 1');
        $stmt->execute([$posKey]);
        $raw = $stmt->fetchColumn();
        $etag = '"'.md5($raw ?: 'null').'"';
        header('ETag: '.$etag);
        header('Cache-Control: no-cache, must-revalidate');
        $inm = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
        if ($inm && trim($inm) === $etag) {
            http_response_code(304);
            exit;
        }
        echo $raw ? $raw : 'null';
        exit;
    }

    if ($method === 'POST') {
        $pos = $JSON_BODY['posicao'] ?? null;
        if (!is_array($pos)) {
            http_response_code(400);
            echo json_encode(['error' => 'Posição inválida.']);
            exit;
        }
        if (!isset($pos['atualizadoEm'])) {
            $pos['atualizadoEm'] = date('c');
        }
        $encoded = json_encode($pos, JSON_UNESCAPED_UNICODE);
        $tenantId = DEFAULT_TENANT_ID;
        $find = $pdo->prepare('SELECT tenant_id FROM store WHERE `key` IN (?, ?, ?) ORDER BY updated_at DESC LIMIT 1');
        $find->execute([$posKey, $execKey, $pubKey]);
        $foundTenant = $find->fetchColumn();
        if ($foundTenant) $tenantId = $foundTenant;
        $stmtSave = $pdo->prepare(
            'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
        );
        $stmtSave->execute([$tenantId, $posKey, $encoded]);
        echo json_encode(['ok' => true, 'atualizadoEm' => $pos['atualizadoEm']], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido.']);
    exit;
}

// Autenticado: lista sessões ao vivo do tenant (centro de comando)
if ($action === 'rota_live_sessions' && $method === 'GET') {
    $user = requireAuth($JSON_BODY);
    $tenantId = requireTenantId($JSON_BODY);
    requireMember($pdo, $tenantId, strtolower($user['email']), false);

    $stmt = $pdo->prepare(
        "SELECT `key`, `value`, updated_at FROM store
         WHERE tenant_id = ? AND `key` LIKE 'rota_share_%'
         ORDER BY updated_at DESC LIMIT 100"
    );
    $stmt->execute([$tenantId]);
    $sessions = [];
    while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
        $shareId = preg_replace('/^rota_share_/', '', $row['key']);
        if (!$shareId) continue;
        $share = json_decode($row['value'], true);
        if (!is_array($share) || !empty($share['encerrada'])) continue;
        $posStmt = $pdo->prepare('SELECT `value`, updated_at FROM store WHERE tenant_id = ? AND `key` = ? LIMIT 1');
        $posStmt->execute([$tenantId, 'rota_posicao_'.$shareId]);
        $posRow = $posStmt->fetch(PDO::FETCH_ASSOC);
        $posicao = $posRow ? json_decode($posRow['value'], true) : null;
        $sessions[] = [
            'shareId' => $shareId,
            'rotaId' => $share['rotaId'] ?? '',
            'nome' => $share['nome'] ?? '',
            'membro' => $share['membro'] ?? '',
            'membroId' => $share['membroId'] ?? '',
            'encerrada' => false,
            'posicao' => is_array($posicao) ? $posicao : null,
            'atualizadoEm' => $row['updated_at'] ?? null,
        ];
    }
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['sessions' => $sessions], JSON_UNESCAPED_UNICODE);
    exit;
}

// Público: trilha GPS persistida (replay)
if ($action === 'rota_trilha') {
    $shareId = parseShareId($JSON_BODY['shareId'] ?? $_GET['shareId'] ?? '', $method === 'POST' ? 12 : 6, $pdo, ['rota_trilha_', 'rota_share_']);
    if ($shareId === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Link inválido.']);
        exit;
    }
    assertRotaShareAtivo($pdo, $shareId);
    $trailKey = 'rota_trilha_'.$shareId;

    if ($method === 'GET') {
        $stmt = $pdo->prepare('SELECT `value` FROM store WHERE `key` = ? LIMIT 1');
        $stmt->execute([$trailKey]);
        $raw = $stmt->fetchColumn();
        $data = $raw ? json_decode($raw, true) : ['pontos' => []];
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['pontos' => $data['pontos'] ?? []], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($method === 'POST') {
        $ponto = $JSON_BODY['ponto'] ?? null;
        if (!is_array($ponto) || !isset($ponto['lat'], $ponto['lng'])) {
            http_response_code(400);
            echo json_encode(['error' => 'Ponto inválido.']);
            exit;
        }
        $stmt = $pdo->prepare('SELECT `value`, tenant_id FROM store WHERE `key` = ? LIMIT 1');
        $stmt->execute([$trailKey]);
        $found = $stmt->fetch(PDO::FETCH_ASSOC);
        $tenantId = $found['tenant_id'] ?? DEFAULT_TENANT_ID;
        $pontos = [];
        if ($found && $found['value']) {
            $prev = json_decode($found['value'], true);
            $pontos = is_array($prev['pontos'] ?? null) ? $prev['pontos'] : [];
        }
        $pontos[] = [
            'lat' => (float)$ponto['lat'],
            'lng' => (float)$ponto['lng'],
            't' => $ponto['t'] ?? date('c'),
        ];
        if (count($pontos) > 500) {
            $pontos = array_slice($pontos, -500);
        }
        $encoded = json_encode(['pontos' => $pontos], JSON_UNESCAPED_UNICODE);
        $stmtSave = $pdo->prepare(
            'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
        );
        $stmtSave->execute([$tenantId, $trailKey, $encoded]);
        echo json_encode(['ok' => true, 'total' => count($pontos)], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido.']);
    exit;
}

// Público: long-poll de posição GPS (espera mudança até ~25s)
if ($action === 'rota_posicao_wait' && $method === 'GET') {
    $shareId = parseShareId($_GET['shareId'] ?? '', 6, $pdo, ['rota_posicao_', 'rota_execucao_', 'rota_execucao_pub_']);
    if ($shareId === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Link inválido.']);
        exit;
    }
    assertRotaShareAtivo($pdo, $shareId);
    $posKey = 'rota_posicao_'.$shareId;
    $since = trim((string)($_GET['since'] ?? ''));
    header('Cache-Control: no-cache, must-revalidate');
    for ($i = 0; $i < 125; $i++) {
        if (connection_aborted()) break;
        $stmt = $pdo->prepare('SELECT `value` FROM store WHERE `key` = ? ORDER BY updated_at DESC LIMIT 1');
        $stmt->execute([$posKey]);
        $raw = $stmt->fetchColumn();
        $hash = md5($raw ?: 'null');
        if (!$since || $since !== $hash) {
            header('ETag: "'.$hash.'"');
            echo $raw ? $raw : 'null';
            exit;
        }
        usleep(200000);
    }
    http_response_code(304);
    exit;
}

// Público: SSE stream de posição GPS
if ($action === 'rota_stream' && $method === 'GET') {
    $shareId = parseShareId($_GET['shareId'] ?? '', 6, $pdo, ['rota_posicao_', 'rota_share_']);
    if ($shareId === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Link inválido.']);
        exit;
    }
    assertRotaShareAtivo($pdo, $shareId);
    header('Content-Type: text/event-stream; charset=utf-8');
    header('Cache-Control: no-cache, no-store');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no');
    @ini_set('output_buffering', 'off');
    @ini_set('zlib.output_compression', '0');
    if (function_exists('apache_setenv')) {
        @apache_setenv('no-gzip', '1');
    }
    $posKey = 'rota_posicao_'.$shareId;
    $lastHash = '';
    $keepaliveAt = time();
    while (!connection_aborted()) {
        $stmt = $pdo->prepare('SELECT `value` FROM store WHERE `key` = ? LIMIT 1');
        $stmt->execute([$posKey]);
        $raw = $stmt->fetchColumn();
        $hash = md5($raw ?: '');
        if ($hash !== $lastHash && $raw) {
            echo "event: posicao\n";
            echo 'data: '.$raw."\n\n";
            $lastHash = $hash;
            @ob_flush();
            @flush();
        }
        if (time() - $keepaliveAt >= 15) {
            echo ": keepalive\n\n";
            @ob_flush();
            @flush();
            $keepaliveAt = time();
        }
        usleep(200000);
    }
    exit;
}

// Público: execução de rota no celular (foto / justificativa / GPS) — sem login
if ($action === 'rota_execucao') {
    $shareId = parseShareId($JSON_BODY['shareId'] ?? $_GET['shareId'] ?? '', $method === 'POST' ? 12 : 6, $pdo, ['rota_execucao_', 'rota_execucao_pub_']);
    if ($shareId === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Link inválido.']);
        exit;
    }
    assertRotaShareAtivo($pdo, $shareId);
    $execKey = 'rota_execucao_'.$shareId;
    $pubKey  = 'rota_execucao_pub_'.$shareId;

    if ($method === 'GET') {
        $stmt = $pdo->prepare('SELECT `value` FROM store WHERE `key` = ? ORDER BY updated_at DESC LIMIT 1');
        $stmt->execute([$execKey]);
        $raw = $stmt->fetchColumn();
        echo $raw ? $raw : 'null';
        exit;
    }

    if ($method === 'POST') {
        $exec = $JSON_BODY['execucao'] ?? null;
        if (!is_array($exec)) {
            http_response_code(400);
            echo json_encode(['error' => 'Dados inválidos.']);
            exit;
        }
        $exec['shareId'] = $shareId;
        $exec['atualizadoEm'] = date('c');
        $encoded = json_encode($exec, JSON_UNESCAPED_UNICODE);
        if (!is_string($encoded) || strlen($encoded) > 4500000) {
            http_response_code(413);
            echo json_encode(['error' => 'Dados grandes demais.']);
            exit;
        }
        $tenantId = DEFAULT_TENANT_ID;
        $find = $pdo->prepare('SELECT tenant_id FROM store WHERE `key` IN (?, ?) ORDER BY updated_at DESC LIMIT 1');
        $find->execute([$execKey, $pubKey]);
        $foundTenant = $find->fetchColumn();
        if ($foundTenant) $tenantId = $foundTenant;
        $stmtSave = $pdo->prepare(
            'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
        );
        $stmtSave->execute([$tenantId, $execKey, $encoded]);
        echo json_encode(['ok' => true, 'atualizadoEm' => $exec['atualizadoEm']], JSON_UNESCAPED_UNICODE);
        exit;
    }

    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido.']);
    exit;
}

// Público: foto da visita no campo (não exige login; o shareId é o segredo)
if ($action === 'rota_foto' && $method === 'POST') {
    enforceRateLimit('rota_foto', 10);
    $shareId = parseShareId($JSON_BODY['shareId'] ?? '', 12, $pdo, ['rota_share_']);
    if ($shareId === null) {
        http_response_code(400);
        echo json_encode(['error' => 'Link inválido.']);
        exit;
    }
    $shareKey = 'rota_share_'.$shareId;
    $chk = $pdo->prepare('SELECT 1 FROM store WHERE `key` = ? LIMIT 1');
    $chk->execute([$shareKey]);
    if (!$chk->fetchColumn()) {
        http_response_code(404);
        echo json_encode(['error' => 'Rota não encontrada.']);
        exit;
    }
    $dataUrl = (string)($JSON_BODY['dataUrl'] ?? '');
    if (!preg_match('#^data:image/(jpeg|jpg|png|webp|gif);base64,#i', $dataUrl, $m)) {
        http_response_code(400);
        echo json_encode(['error' => 'Imagem inválida.']);
        exit;
    }
    $ext = strtolower($m[1]);
    if ($ext === 'jpeg' || $ext === 'jpg') $ext = 'jpg';
    $comma = strpos($dataUrl, ',');
    $bin = $comma === false ? false : base64_decode(substr($dataUrl, $comma + 1), true);
    if ($bin === false || strlen($bin) < 64) {
        http_response_code(400);
        echo json_encode(['error' => 'Não foi possível ler a foto.']);
        exit;
    }
    if (strlen($bin) > 950000) {
        http_response_code(400);
        echo json_encode(['error' => 'Foto grande demais.']);
        exit;
    }
    $dir = __DIR__ . '/uploads/rotas';
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'Não criou pasta de fotos.']);
        exit;
    }
    $safeKey = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($JSON_BODY['paradaKey'] ?? 'foto'));
    if ($safeKey === '') $safeKey = 'foto';
    if (strlen($safeKey) > 48) $safeKey = substr($safeKey, 0, 48);
    $fname = $shareId . '-' . $safeKey . '-' . substr(hash('sha256', $bin), 0, 10) . '.' . $ext;
    if (@file_put_contents($dir . '/' . $fname, $bin) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Falha ao gravar a foto.']);
        exit;
    }
    echo json_encode(['ok' => true, 'url' => '/uploads/rotas/' . $fname], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action !== '') {
    $user = requireAuth($JSON_BODY);
    $email = strtolower($user['email']);

    if ($action === 'lead_form_link' && ($method === 'GET' || $method === 'POST')) {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, false);
        $row = ensureLeadForm($pdo, $tenantId);
        if ($method === 'POST') {
            $hasWa = array_key_exists('whatsapp', $JSON_BODY ?? []);
            $wa = '';
            if ($hasWa) {
                $wa = preg_replace('/\D+/', '', (string)($JSON_BODY['whatsapp'] ?? ''));
                if (strlen($wa) > 13) $wa = substr($wa, 0, 13);
            }
            $hasSlug = array_key_exists('slug', $JSON_BODY ?? []);
            $slugIn = null;
            if ($hasSlug) {
                $slugIn = normalizeLeadSlug((string)($JSON_BODY['slug'] ?? ''));
                if ($slugIn === '') {
                    $slugIn = ''; // empty = clear / regenerate later
                } elseif (!isValidLeadSlug($slugIn)) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Link curto inválido. Use 3–40 letras, números ou hífen (ex: ismael).']);
                    exit;
                } else {
                    $clash = $pdo->prepare('SELECT tenant_id FROM lead_forms WHERE slug = ? AND tenant_id <> ? LIMIT 1');
                    $clash->execute([$slugIn, $tenantId]);
                    if ($clash->fetchColumn()) {
                        http_response_code(409);
                        echo json_encode(['error' => 'Este link curto já está em uso. Escolha outro.']);
                        exit;
                    }
                }
            }
            $titulo = trim((string)($JSON_BODY['titulo'] ?? ''));
            if (mb_strlen($titulo) > 180) $titulo = mb_substr($titulo, 0, 180);
            $active = array_key_exists('active', $JSON_BODY ?? []) ? (!empty($JSON_BODY['active']) ? 1 : 0) : null;
            $cfgJson = null;
            if (array_key_exists('config', $JSON_BODY ?? [])) {
                $cfg = decodeLeadFormConfig($JSON_BODY['config']);
                $cfgJson = json_encode($cfg, JSON_UNESCAPED_UNICODE);
                if (strlen($cfgJson) > 1200000) {
                    http_response_code(400);
                    echo json_encode(['error' => 'Configuração muito grande (reduza as fotos).']);
                    exit;
                }
                if ($titulo === '' && !empty($cfg['titulo'])) {
                    $titulo = mb_substr((string)$cfg['titulo'], 0, 180);
                }
            }
            // WhatsApp: se a chave veio no body, grava (vazio = remove). Se não veio, mantém.
            $sets = [];
            $params = [];
            if ($hasWa) {
                $sets[] = 'whatsapp = ?';
                $params[] = $wa !== '' ? $wa : null;
            }
            if ($hasSlug) {
                $sets[] = 'slug = ?';
                $params[] = $slugIn !== '' ? $slugIn : null;
            }
            $sets[] = 'titulo = CASE WHEN ? = \'\' THEN titulo ELSE ? END';
            $params[] = $titulo;
            $params[] = $titulo;
            $sets[] = 'active = COALESCE(?, active)';
            $params[] = $active;
            if ($cfgJson !== null) {
                $sets[] = 'config = ?';
                $params[] = $cfgJson;
            }
            $params[] = $tenantId;
            $upd = $pdo->prepare('UPDATE lead_forms SET '.implode(', ', $sets).' WHERE tenant_id = ?');
            $upd->execute($params);
            $row = ensureLeadForm($pdo, $tenantId);
        }
        $url = publicLeadFormUrl($row);
        echo json_encode([
            'ok' => true,
            'token' => $row['token'],
            'slug' => $row['slug'] ?: '',
            'url' => $url,
            'whatsapp' => $row['whatsapp'] ?: '',
            'titulo' => $row['titulo'] ?: '',
            'active' => (int)$row['active'] === 1,
            'config' => decodeLeadFormConfig($row['config'] ?? null),
            'stats' => leadFormStats($pdo, $row['token'], $tenantId),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'me' && $method === 'GET') {
        maybeBootstrapOwner($pdo, $email);
        $tenants = listTenantsForEmail($pdo, $email);
        $pendingAccess = findPendingAccessRequestAny($pdo, $email);
        // Verifica se este email é bootstrapped (dono forçado da campanha principal)
        $isBootstrap = false;
        $raw = trim(BOOTSTRAP_OWNER_EMAILS);
        if ($raw !== '') {
            $blist = array_filter(array_map(function($e) { return strtolower(trim($e)); }, explode(',', $raw)));
            $isBootstrap = in_array(strtolower($email), $blist, true);
        }
        echo json_encode([
            'email' => $email,
            'tenants' => $tenants,
            'canClaimLegacy' => canClaimLegacy($pdo),
            'canCreateTenant' => canCreateTenant($pdo, $email),
            'defaultTenantId' => DEFAULT_TENANT_ID,
            'defaultTenantName' => DEFAULT_TENANT_NAME,
            'accessRequest' => $pendingAccess,
            'forceDefaultTenant' => $isBootstrap,  // força redirect para campanha principal
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'claim_legacy' && $method === 'POST') {
        if (!canClaimLegacy($pdo)) {
            http_response_code(409);
            echo json_encode(['error' => 'Campanha principal já tem dono. Peça um convite.']);
            exit;
        }
        ensureTenant($pdo, DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME);
        addMember($pdo, DEFAULT_TENANT_ID, $email, 'owner');
        echo json_encode([
            'ok' => true,
            'tenant' => ['id' => DEFAULT_TENANT_ID, 'name' => DEFAULT_TENANT_NAME, 'role' => 'owner'],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'create_tenant' && $method === 'POST') {
        if (!canCreateTenant($pdo, $email)) {
            http_response_code(403);
            echo json_encode(['error' => 'Para usar a ferramenta como candidato, solicite liberação ao administrador.']);
            exit;
        }
        $name = trim((string)(($JSON_BODY['name'] ?? '')));
        if ($name === '' || mb_strlen($name) < 2) {
            http_response_code(400);
            echo json_encode(['error' => 'Informe o nome da campanha.']);
            exit;
        }
        if (mb_strlen($name) > 80) $name = mb_substr($name, 0, 80);
        $id = uuidV4();
        ensureTenant($pdo, $id, $name);
        addMember($pdo, $id, $email, 'owner');
        $lead = ensureLeadForm($pdo, $id);
        echo json_encode([
            'ok' => true,
            'tenant' => ['id' => $id, 'name' => $name, 'role' => 'owner'],
            'lead_form' => [
                'slug' => $lead['slug'] ?: '',
                'url' => publicLeadFormUrl($lead),
            ],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'request_access' && $method === 'POST') {
        $kind = strtolower(trim((string)($JSON_BODY['kind'] ?? 'team')));
        if (!in_array($kind, ['team', 'tool'], true)) $kind = 'team';
        $campaignName = trim((string)($JSON_BODY['campaign_name'] ?? $JSON_BODY['campaignName'] ?? ''));
        if (mb_strlen($campaignName) > 80) $campaignName = mb_substr($campaignName, 0, 80);

        // Pedidos são revisados pelo dono da campanha principal (gatekeeper da ferramenta)
        $tenantId = DEFAULT_TENANT_ID;
        ensureTenant($pdo, $tenantId, DEFAULT_TENANT_NAME);

        if ($kind === 'team') {
            $chk = $pdo->prepare('SELECT 1 FROM tenant_members WHERE tenant_id = ? AND email = ?');
            $chk->execute([$tenantId, $email]);
            if ($chk->fetchColumn()) {
                http_response_code(409);
                echo json_encode(['error' => 'Você já tem acesso a esta campanha.']);
                exit;
            }
        } else {
            // tool: já é dono de alguma campanha?
            if (canCreateTenant($pdo, $email) && count(listTenantsForEmail($pdo, $email)) > 0) {
                http_response_code(409);
                echo json_encode(['error' => 'Você já pode usar a ferramenta (já é dono de uma campanha).']);
                exit;
            }
            if ($campaignName === '' || mb_strlen($campaignName) < 2) {
                http_response_code(400);
                echo json_encode(['error' => 'Informe o nome da sua campanha (ex.: Deputado Silva 2026).']);
                exit;
            }
        }

        $existing = findPendingAccessRequestAny($pdo, $email);
        if ($existing) {
            echo json_encode(['ok' => true, 'accessRequest' => $existing, 'already' => true], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $id = uuidV4();
        $ins = $pdo->prepare(
            "INSERT INTO access_requests (id, tenant_id, email, kind, campaign_name, status)
             VALUES (?, ?, ?, ?, ?, 'pending')"
        );
        $ins->execute([$id, $tenantId, $email, $kind, $kind === 'tool' ? $campaignName : null]);
        $req = findPendingAccessRequestAny($pdo, $email);
        echo json_encode(['ok' => true, 'accessRequest' => $req], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'access_requests' && $method === 'GET') {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, true);
        // Só o dono da campanha principal vê/aprova pedidos da plataforma
        if ($tenantId !== DEFAULT_TENANT_ID) {
            echo json_encode(['requests' => [], 'count' => 0], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $stmt = $pdo->prepare(
            "SELECT id, tenant_id, email, kind, campaign_name, status, created_at
             FROM access_requests
             WHERE tenant_id = ? AND status = 'pending'
             ORDER BY created_at ASC"
        );
        $stmt->execute([$tenantId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        echo json_encode(['requests' => $rows, 'count' => count($rows)], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'access_review' && $method === 'POST') {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, true);
        if ($tenantId !== DEFAULT_TENANT_ID) {
            http_response_code(403);
            echo json_encode(['error' => 'Somente o dono da campanha principal libera estes pedidos.']);
            exit;
        }
        $id = trim((string)($JSON_BODY['id'] ?? ''));
        $decision = strtolower(trim((string)($JSON_BODY['decision'] ?? '')));
        if ($id === '' || !in_array($decision, ['approve', 'reject'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Informe id e decision (approve|reject).']);
            exit;
        }
        $stmt = $pdo->prepare(
            "SELECT * FROM access_requests WHERE id = ? AND tenant_id = ? AND status = 'pending' LIMIT 1"
        );
        $stmt->execute([$id, $tenantId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Pedido não encontrado ou já revisado.']);
            exit;
        }
        $target = strtolower((string)$row['email']);
        $kind = strtolower((string)($row['kind'] ?? 'team'));
        if ($decision === 'approve') {
            $newTenant = null;
            $tabs = normalizeAllowedTabs($JSON_BODY['allowed_tabs'] ?? $JSON_BODY['allowedTabs'] ?? null);
            $finance = normalizeCanViewFinance($JSON_BODY['can_view_finance'] ?? $JSON_BODY['canViewFinance'] ?? false);
            if (is_array($tabs) && count($tabs) === 0) {
                http_response_code(400);
                echo json_encode(['error' => 'Selecione ao menos uma aba/módulo para liberar.']);
                exit;
            }
            if ($kind === 'tool') {
                $name = trim((string)($row['campaign_name'] ?? ''));
                if ($name === '') $name = 'Campanha '.preg_replace('/@.*/', '', $target);
                if (mb_strlen($name) > 80) $name = mb_substr($name, 0, 80);
                $newId = uuidV4();
                ensureTenant($pdo, $newId, $name);
                // Dono da campanha nova, mas limitado aos módulos escolhidos (null = tudo)
                addMember($pdo, $newId, $target, 'owner', $tabs, $finance ? 1 : 0);
                ensureLeadForm($pdo, $newId);
                $newTenant = [
                    'id' => $newId,
                    'name' => $name,
                    'role' => 'owner',
                    'allowed_tabs' => $tabs,
                    'allowedTabs' => $tabs,
                    'can_view_finance' => (bool)$finance,
                    'canViewFinance' => (bool)$finance,
                ];
            } else {
                addMember($pdo, $tenantId, $target, 'member', $tabs, $finance ? 1 : 0);
            }
            $upd = $pdo->prepare(
                "UPDATE access_requests SET status = 'approved', reviewed_at = NOW(), reviewed_by = ? WHERE id = ?"
            );
            $upd->execute([$email, $id]);
            echo json_encode([
                'ok' => true,
                'decision' => 'approved',
                'kind' => $kind,
                'email' => $target,
                'tenant' => $newTenant,
                'allowed_tabs' => $tabs,
                'can_view_finance' => (bool)$finance,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $upd = $pdo->prepare(
            "UPDATE access_requests SET status = 'rejected', reviewed_at = NOW(), reviewed_by = ? WHERE id = ?"
        );
        $upd->execute([$email, $id]);
        echo json_encode(['ok' => true, 'decision' => 'rejected', 'kind' => $kind, 'email' => $target], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Lista todos os candidatos/campanhas liberadas (só admin da campanha principal)
    if ($action === 'list_candidates' && $method === 'GET') {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, true);
        if ($tenantId !== DEFAULT_TENANT_ID) {
            http_response_code(403);
            echo json_encode(['error' => 'Somente o administrador da campanha principal vê todos os candidatos.']);
            exit;
        }
        $stmt = $pdo->prepare(
            "SELECT t.id AS tenant_id, t.name AS tenant_name, t.created_at AS tenant_created_at,
                    m.email AS owner_email, m.allowed_tabs, m.can_view_finance, m.created_at AS member_since
             FROM tenants t
             INNER JOIN tenant_members m ON m.tenant_id = t.id AND m.role = 'owner'
             WHERE t.id <> ?
             ORDER BY t.name ASC, m.email ASC"
        );
        $stmt->execute([DEFAULT_TENANT_ID]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
        $candidates = [];
        foreach ($rows as $row) {
            $tabs = decodeAllowedTabs($row['allowed_tabs'] ?? null);
            $finance = (bool)normalizeCanViewFinance($row['can_view_finance'] ?? null);
            if ($tabs === null) $finance = true;
            $candidates[] = [
                'tenant_id' => $row['tenant_id'],
                'tenantId' => $row['tenant_id'],
                'name' => $row['tenant_name'],
                'email' => strtolower((string)$row['owner_email']),
                'allowed_tabs' => $tabs,
                'allowedTabs' => $tabs,
                'can_view_finance' => $finance,
                'canViewFinance' => $finance,
                'created_at' => $row['tenant_created_at'] ?: $row['member_since'],
            ];
        }
        // Também traz pedidos aprovados de ferramenta (histórico), mesmo se o tenant sumiu
        $hist = [];
        try {
            $h = $pdo->prepare(
                "SELECT email, campaign_name, reviewed_at, status
                 FROM access_requests
                 WHERE tenant_id = ? AND kind = 'tool' AND status = 'approved'
                 ORDER BY reviewed_at DESC LIMIT 100"
            );
            $h->execute([DEFAULT_TENANT_ID]);
            $hist = $h->fetchAll(PDO::FETCH_ASSOC) ?: [];
        } catch (Exception $e) { $hist = []; }

        echo json_encode([
            'candidates' => $candidates,
            'count' => count($candidates),
            'history' => $hist,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Admin principal altera módulos de um candidato liberado
    if ($action === 'update_candidate' && $method === 'POST') {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, true);
        if ($tenantId !== DEFAULT_TENANT_ID) {
            http_response_code(403);
            echo json_encode(['error' => 'Somente o administrador da campanha principal pode alterar candidatos.']);
            exit;
        }
        $targetTenant = trim((string)($JSON_BODY['target_tenant_id'] ?? $JSON_BODY['targetTenantId'] ?? ''));
        $targetEmail = strtolower(trim((string)($JSON_BODY['email'] ?? '')));
        if ($targetTenant === '' || $targetTenant === DEFAULT_TENANT_ID) {
            http_response_code(400);
            echo json_encode(['error' => 'Informe a campanha do candidato.']);
            exit;
        }
        if ($targetEmail === '' || !filter_var($targetEmail, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'E-mail do candidato inválido.']);
            exit;
        }
        $chk = $pdo->prepare('SELECT role FROM tenant_members WHERE tenant_id = ? AND email = ? LIMIT 1');
        $chk->execute([$targetTenant, $targetEmail]);
        $ex = $chk->fetch(PDO::FETCH_ASSOC);
        if (!$ex) {
            http_response_code(404);
            echo json_encode(['error' => 'Candidato não encontrado nesta campanha.']);
            exit;
        }
        $tabs = normalizeAllowedTabs($JSON_BODY['allowed_tabs'] ?? $JSON_BODY['allowedTabs'] ?? null);
        if (is_array($tabs) && count($tabs) === 0) {
            http_response_code(400);
            echo json_encode(['error' => 'Selecione ao menos uma aba.']);
            exit;
        }
        $finance = normalizeCanViewFinance($JSON_BODY['can_view_finance'] ?? $JSON_BODY['canViewFinance'] ?? false);
        addMember($pdo, $targetTenant, $targetEmail, $ex['role'] ?: 'owner', $tabs, $finance ? 1 : 0);
        echo json_encode([
            'ok' => true,
            'tenant_id' => $targetTenant,
            'email' => $targetEmail,
            'allowed_tabs' => $tabs,
            'can_view_finance' => (bool)$finance,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'invite' && $method === 'POST') {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, true);
        $inviteEmail = strtolower(trim((string)($JSON_BODY['email'] ?? '')));
        $role = trim((string)($JSON_BODY['role'] ?? 'member'));
        $password = (string)($JSON_BODY['password'] ?? '');
        if (!filter_var($inviteEmail, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'E-mail inválido.']);
            exit;
        }
        if (!in_array($role, ['owner', 'member'], true)) $role = 'member';
        $tabs = normalizeAllowedTabs($JSON_BODY['allowed_tabs'] ?? $JSON_BODY['allowedTabs'] ?? null);
        $finance = normalizeCanViewFinance($JSON_BODY['can_view_finance'] ?? $JSON_BODY['canViewFinance'] ?? false);
        if ($role === 'owner') $finance = 1;

        $passwordSet = false;
        if ($password !== '') {
            $pwCheck = validateMemberPassword($password);
            if ($pwCheck !== null) {
                http_response_code(400);
                echo json_encode(['error' => $pwCheck]);
                exit;
            }
            $set = supabaseSetUserPassword($inviteEmail, $password);
            if (empty($set['ok'])) {
                http_response_code(400);
                echo json_encode(['error' => $set['error'] ?? 'Não foi possível definir a senha.']);
                exit;
            }
            $passwordSet = true;
        }

        addMember($pdo, $tenantId, $inviteEmail, $role, $tabs, $finance);
        $tenantName = fetchTenantName($pdo, $tenantId);

        if ($passwordSet) {
            $emailSent = sendAccessReadyEmail($inviteEmail, $tenantName);
            echo json_encode([
                'ok' => true,
                'allowed_tabs' => $tabs,
                'can_view_finance' => (bool)$finance,
                'password_set' => true,
                'email_sent' => $emailSent,
                'invite_url' => null,
            ], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $invite = createInvite($pdo, $tenantId, $inviteEmail);
        $inviteUrl = rtrim(APP_PUBLIC_URL, '/').'/?convite='.urlencode($invite['token']);
        $emailSent = sendInviteEmail($inviteEmail, $tenantName, $inviteUrl);
        echo json_encode([
            'ok' => true,
            'allowed_tabs' => $tabs,
            'can_view_finance' => (bool)$finance,
            'password_set' => false,
            'invite_url' => $inviteUrl,
            'invite_token' => $invite['token'],
            'email_sent' => $emailSent,
            'expires_at' => $invite['expires_at'],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'set_member_password' && $method === 'POST') {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, true);
        $target = strtolower(trim((string)($JSON_BODY['email'] ?? '')));
        $password = (string)($JSON_BODY['password'] ?? '');
        if ($target === '' || !filter_var($target, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'E-mail inválido.']);
            exit;
        }
        $pwCheck = validateMemberPassword($password);
        if ($pwCheck !== null) {
            http_response_code(400);
            echo json_encode(['error' => $pwCheck]);
            exit;
        }
        $stmt = $pdo->prepare('SELECT role FROM tenant_members WHERE tenant_id = ? AND email = ?');
        $stmt->execute([$tenantId, $target]);
        $memberRole = $stmt->fetchColumn();
        if (!$memberRole) {
            http_response_code(404);
            echo json_encode(['error' => 'Membro não encontrado nesta campanha.']);
            exit;
        }
        if ($memberRole === 'owner' && $target !== strtolower($email)) {
            http_response_code(403);
            echo json_encode(['error' => 'Não é possível alterar a senha de outro dono.']);
            exit;
        }
        $set = supabaseSetUserPassword($target, $password);
        if (empty($set['ok'])) {
            http_response_code(400);
            echo json_encode(['error' => $set['error'] ?? 'Não foi possível definir a senha.']);
            exit;
        }
        echo json_encode([
            'ok' => true,
            'email' => $target,
            'password_set' => true,
            'created' => !empty($set['created']),
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'invite_claim' && $method === 'POST') {
        $token = trim((string)($JSON_BODY['token'] ?? ''));
        $info = getInviteInfo($pdo, $token);
        if (!$info) {
            http_response_code(404);
            echo json_encode(['error' => 'Convite inválido ou expirado.']);
            exit;
        }
        if (strtolower($info['email']) !== $email) {
            http_response_code(403);
            echo json_encode(['error' => 'Entre com o e-mail do convite: '.$info['email']]);
            exit;
        }
        markInviteUsed($pdo, $token);
        echo json_encode([
            'ok' => true,
            'tenant_id' => $info['tenant_id'],
            'tenant_name' => $info['tenant_name'],
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'update_member' && $method === 'POST') {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, true);
        $target = strtolower(trim((string)($JSON_BODY['email'] ?? '')));
        if ($target === '' || !filter_var($target, FILTER_VALIDATE_EMAIL)) {
            http_response_code(400);
            echo json_encode(['error' => 'E-mail inválido.']);
            exit;
        }
        $stmt = $pdo->prepare('SELECT role, allowed_tabs, can_view_finance FROM tenant_members WHERE tenant_id = ? AND email = ?');
        $stmt->execute([$tenantId, $target]);
        $existing = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$existing) {
            http_response_code(404);
            echo json_encode(['error' => 'Membro não encontrado.']);
            exit;
        }
        $existingRole = $existing['role'];
        $role = array_key_exists('role', $JSON_BODY ?? [])
            ? trim((string)$JSON_BODY['role'])
            : $existingRole;
        if (!in_array($role, ['owner', 'member'], true)) $role = $existingRole;
        // Dono sempre tem todas as abas + financeiro
        if ($role === 'owner') {
            $tabs = null;
            $finance = 1;
        } else {
            if (array_key_exists('allowed_tabs', $JSON_BODY ?? []) || array_key_exists('allowedTabs', $JSON_BODY ?? [])) {
                $tabs = normalizeAllowedTabs($JSON_BODY['allowed_tabs'] ?? $JSON_BODY['allowedTabs'] ?? null);
            } else {
                $tabs = decodeAllowedTabs($existing['allowed_tabs'] ?? null);
            }
            if (array_key_exists('can_view_finance', $JSON_BODY ?? []) || array_key_exists('canViewFinance', $JSON_BODY ?? [])) {
                $finance = normalizeCanViewFinance($JSON_BODY['can_view_finance'] ?? $JSON_BODY['canViewFinance'] ?? false);
            } else {
                $finance = normalizeCanViewFinance($existing['can_view_finance'] ?? null);
            }
        }
        addMember($pdo, $tenantId, $target, $role, $tabs, $finance);
        echo json_encode([
            'ok' => true,
            'email' => $target,
            'role' => $role,
            'allowed_tabs' => $tabs,
            'can_view_finance' => (bool)$finance,
        ], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'members' && $method === 'GET') {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, false);
        $stmt = $pdo->prepare(
            'SELECT email, role, allowed_tabs, can_view_finance, created_at FROM tenant_members WHERE tenant_id = ? ORDER BY role DESC, email ASC'
        );
        $stmt->execute([$tenantId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) {
            $tabs = decodeAllowedTabs($row['allowed_tabs'] ?? null);
            $row['allowed_tabs'] = $tabs;
            $row['allowedTabs'] = $tabs;
            $isFullOwner = (($row['role'] ?? '') === 'owner') && $tabs === null;
            $finance = $isFullOwner
                ? true
                : (bool)normalizeCanViewFinance($row['can_view_finance'] ?? null);
            $row['can_view_finance'] = $finance;
            $row['canViewFinance'] = $finance;
        }
        unset($row);
        echo json_encode(['members' => $rows], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'remove_member' && $method === 'POST') {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, true);
        $target = strtolower(trim((string)($JSON_BODY['email'] ?? '')));
        if ($target === '' || $target === $email) {
            http_response_code(400);
            echo json_encode(['error' => 'Não é possível remover este e-mail.']);
            exit;
        }
        $stmt = $pdo->prepare('DELETE FROM tenant_members WHERE tenant_id = ? AND email = ?');
        $stmt->execute([$tenantId, $target]);
        echo json_encode(['ok' => true]);
        exit;
    }

    if ($action === 'submit_pending' && $method === 'POST') {
        // Compat: clientes antigos ainda podem chamar submit_pending.
        // Agora grava direto no store (sem fila de aprovação).
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, false);
        $appKey = trim((string)($JSON_BODY['key'] ?? ''));
        $act = trim((string)($JSON_BODY['change_action'] ?? 'set'));
        if ($appKey === '' || $appKey[0] === '_' || !preg_match('/^[a-zA-Z0-9_.:-]{1,191}$/', $appKey)) {
            http_response_code(400);
            echo json_encode(['error' => 'Chave inválida.']);
            exit;
        }
        if (!isPendingAppKey($appKey)) {
            echo json_encode(['ok' => true, 'skipped' => true, 'awaiting_approval' => false], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (!in_array($act, ['set', 'delete'], true)) $act = 'set';
        $value = array_key_exists('value', $JSON_BODY ?? []) ? $JSON_BODY['value'] : null;

        if ($act === 'delete') {
            $del = $pdo->prepare('DELETE FROM store WHERE tenant_id = ? AND `key` = ?');
            $del->execute([$tenantId, $appKey]);
        } else {
            $decoded = is_string($value) ? json_decode($value, true) : $value;
            if (is_string($value) && json_last_error() !== JSON_ERROR_NONE) {
                $decoded = $value;
            }
            $encoded = encodeStoreValue($pdo, $tenantId, $appKey, $decoded);
            $ins = $pdo->prepare(
                'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
                 ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
            );
            $ins->execute([$tenantId, $appKey, $encoded]);
        }

        // Descarta pendências antigas da mesma chave
        $pdo->prepare(
            "UPDATE pending_changes SET status = 'approved', reviewed_at = NOW(), reviewed_by = ?
             WHERE tenant_id = ? AND author_email = ? AND app_key = ? AND status = 'pending'"
        )->execute([$email, $tenantId, $email, $appKey]);

        echo json_encode(['ok' => true, 'awaiting_approval' => false, 'applied' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'pending_list' && $method === 'GET') {
        $tenantId = requireTenantId($JSON_BODY);
        $role = requireMember($pdo, $tenantId, $email, false);
        // Libera alterações que ficaram presas na fila antiga
        promotePendingChanges($pdo, $tenantId, $email);

        // Descarta lixo técnico que entrou na fila (ex.: campanha_active_tenant_meta)
        $pdo->prepare(
            "UPDATE pending_changes SET status = 'rejected', reviewed_at = NOW(), reviewed_by = 'system'
             WHERE tenant_id = ? AND status = 'pending'
               AND (app_key LIKE 'campanha_active%' OR app_key LIKE 'campanha_sync%' OR app_key = 'campanha_theme')"
        )->execute([$tenantId]);

        if ($role === 'owner') {
            $stmt = $pdo->prepare(
                "SELECT id, author_email, app_key, action, value, status, created_at
                 FROM pending_changes WHERE tenant_id = ? AND status = 'pending'
                 ORDER BY created_at DESC LIMIT 200"
            );
            $stmt->execute([$tenantId]);
        } else {
            $stmt = $pdo->prepare(
                "SELECT id, author_email, app_key, action, status, created_at
                 FROM pending_changes WHERE tenant_id = ? AND author_email = ? AND status = 'pending'
                 ORDER BY created_at DESC LIMIT 100"
            );
            $stmt->execute([$tenantId, $email]);
        }
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as &$row) {
            $key = $row['app_key'] ?? '';
            $row['label'] = pendingKeyLabel($key);
            $row['aba'] = pendingKeyAba($key);
            if ($role === 'owner') {
                $cur = $pdo->prepare('SELECT `value` FROM store WHERE tenant_id = ? AND `key` = ?');
                $cur->execute([$tenantId, $key]);
                $oldVal = $cur->fetchColumn();
                if ($oldVal === false) $oldVal = null;
                $desc = describePendingChange($key, $row['action'] ?? 'set', $row['value'] ?? null, $oldVal);
                $row['summary'] = $desc['summary'];
                $row['items'] = $desc['items'];
                // Não manda o JSON bruto enorme na listagem
                unset($row['value']);
            } else {
                unset($row['value']);
            }
        }
        unset($row);
        echo json_encode(['pending' => $rows, 'count' => count($rows)], JSON_UNESCAPED_UNICODE);
        exit;
    }

    if ($action === 'pending_review' && $method === 'POST') {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, true);
        $id = trim((string)($JSON_BODY['id'] ?? ''));
        $decision = strtolower(trim((string)($JSON_BODY['decision'] ?? '')));
        if ($id === '' || !in_array($decision, ['approve', 'reject'], true)) {
            http_response_code(400);
            echo json_encode(['error' => 'Informe id e decision (approve|reject).']);
            exit;
        }
        $stmt = $pdo->prepare(
            "SELECT * FROM pending_changes WHERE id = ? AND tenant_id = ? AND status = 'pending' LIMIT 1"
        );
        $stmt->execute([$id, $tenantId]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        if (!$row) {
            http_response_code(404);
            echo json_encode(['error' => 'Pendência não encontrada.']);
            exit;
        }
        if ($decision === 'approve') {
            $appKey = (string)($row['app_key'] ?? '');
            $changeAction = (($row['action'] ?? 'set') === 'delete') ? 'delete' : 'set';
            $appliedValue = null;
            if ($changeAction === 'delete') {
                $del = $pdo->prepare('DELETE FROM store WHERE tenant_id = ? AND `key` = ?');
                $del->execute([$tenantId, $appKey]);
            } else {
                $decoded = json_decode($row['value'] ?? 'null', true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    $decoded = $row['value'] ?? null;
                }
                $encoded = encodeStoreValue($pdo, $tenantId, $appKey, $decoded);
                $ins = $pdo->prepare(
                    'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
                );
                $ins->execute([$tenantId, $appKey, $encoded]);
                $appliedValue = json_decode($encoded, true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    $appliedValue = $encoded;
                }
            }
            $upd = $pdo->prepare(
                "UPDATE pending_changes SET status = 'approved', reviewed_at = NOW(), reviewed_by = ? WHERE id = ?"
            );
            $upd->execute([$email, $id]);
            echo json_encode([
                'ok' => true,
                'status' => 'approved',
                'key' => $appKey,
                'action' => $changeAction,
                'value' => $appliedValue,
            ], JSON_UNESCAPED_UNICODE);
        } else {
            $upd = $pdo->prepare(
                "UPDATE pending_changes SET status = 'rejected', reviewed_at = NOW(), reviewed_by = ? WHERE id = ?"
            );
            $upd->execute([$email, $id]);
            echo json_encode([
                'ok' => true,
                'status' => 'rejected',
                'key' => (string)($row['app_key'] ?? ''),
                'action' => (($row['action'] ?? 'set') === 'delete') ? 'delete' : 'set',
            ], JSON_UNESCAPED_UNICODE);
        }
        exit;
    }

    if ($action === 'pending_reject_all' && $method === 'POST') {
        $tenantId = requireTenantId($JSON_BODY);
        requireMember($pdo, $tenantId, $email, true);
        $stmt = $pdo->prepare(
            "UPDATE pending_changes SET status = 'rejected', reviewed_at = NOW(), reviewed_by = ?
             WHERE tenant_id = ? AND status = 'pending'"
        );
        $stmt->execute([$email, $tenantId]);
        echo json_encode(['ok' => true, 'rejected' => $stmt->rowCount()], JSON_UNESCAPED_UNICODE);
        exit;
    }

    // Ações tratadas fora deste bloco (segundo bloco de autenticação)
    $actionsSegundoBloco = [
        'media_upload', 'church_catalog', 'church_meta',
        'backup_list', 'backup_get', 'backup_restore', 'backup_create',
        'store_meta', 'presence_ping', 'presence_list',
        'store_sync_token', 'store_sync_wait',
        'bulk_delete',
    ];
    if (!in_array($action, $actionsSegundoBloco, true)) {
        http_response_code(400);
        echo json_encode(['error' => 'Ação desconhecida.']);
        exit;
    }
    // cai no segundo bloco abaixo ↓
}

$user = requireAuth($JSON_BODY);
$email = strtolower($user['email']);
$tenantId = requireTenantId($JSON_BODY);
$memberRole = requireMember($pdo, $tenantId, $email, false);
$memberCanViewFinance = memberCanViewFinance($pdo, $tenantId, $email, $memberRole);

// Membros autorizados gravam direto no store (sem fila de aprovação).
// Pendências antigas (quando ainda exigia approve) entram em vigor agora.
promotePendingChanges($pdo, $tenantId, $email);

$churchStoreKeys = [
    'igrejas_custom',
    'igrejas_enrich',
    'geo_coords_igrejas',
    'pastores_igrejas',
    'igrejas_overrides',
    'igrejas_ocultas',
];

if ($action === 'church_meta' && $method === 'GET') {
    $custom = storeGetJson($pdo, $tenantId, 'igrejas_custom');
    $enrich = storeGetJson($pdo, $tenantId, 'igrejas_enrich');
    $coords = storeGetJson($pdo, $tenantId, 'geo_coords_igrejas');
    $n = is_array($custom) ? count($custom) : 0;
    $enrichN = is_array($enrich) ? count($enrich) : 0;
    $coordsN = is_array($coords) ? count($coords) : 0;
    $clearedRaw = storeGetJson($pdo, $tenantId, 'igrejas_cadastro_limpo_em');
    $clearedAt = is_numeric($clearedRaw) ? (float)$clearedRaw : (float)(is_string($clearedRaw) ? $clearedRaw : 0);
    echo json_encode([
        'ok' => true,
        'count' => $n,
        'enrich' => $enrichN,
        'coords' => $coordsN,
        'clearedAt' => $clearedAt,
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'church_catalog') {
    if ($method === 'GET') {
        $data = [];
        $counts = [];
        foreach ($churchStoreKeys as $k) {
            $val = storeGetJson($pdo, $tenantId, $k);
            $data[$k] = $val;
            if ($k === 'igrejas_custom') {
                $counts[$k] = is_array($val) ? count($val) : 0;
            } else {
                $counts[$k] = is_array($val) ? count($val) : 0;
            }
        }
        echo json_encode(['ok' => true, 'data' => $data, 'counts' => $counts], JSON_UNESCAPED_UNICODE);
        exit;
    }
    if ($method === 'POST') {
        if (!is_array($JSON_BODY)) {
            http_response_code(400);
            echo json_encode(['error' => 'JSON inválido']);
            exit;
        }
        $stmt = $pdo->prepare(
            'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
        );
        $counts = [];
        $replaceSet = [];
        if (isset($JSON_BODY['_replace']) && is_array($JSON_BODY['_replace'])) {
            foreach ($JSON_BODY['_replace'] as $rk) {
                $replaceSet[(string)$rk] = true;
            }
        }
        $ocultas = (isset($JSON_BODY['igrejas_ocultas']) && is_array($JSON_BODY['igrejas_ocultas']))
            ? $JSON_BODY['igrejas_ocultas'] : null;
        foreach ($churchStoreKeys as $k) {
            if (!array_key_exists($k, $JSON_BODY)) continue;
            $incoming = $JSON_BODY[$k];
            $existing = storeGetJson($pdo, $tenantId, $k);
            $doReplace = isset($replaceSet[$k]);
            if ($k === 'igrejas_ocultas') {
                $merged = mergeIgrejasOcultasPhp($incoming, $existing);
            } elseif ($k === 'igrejas_custom') {
                $merged = mergeIgrejasCustomPhp($incoming, $existing, $doReplace, $ocultas);
            } elseif ($doReplace) {
                $merged = is_array($incoming) ? $incoming : [];
            } else {
                $merged = mergeIgrejasObjectsPhp($incoming, $existing);
            }
            $encoded = json_encode($merged, JSON_UNESCAPED_UNICODE);
            $stmt->execute([$tenantId, $k, $encoded]);
            $counts[$k] = $k === 'igrejas_custom' ? count($merged) : count((array)$merged);
        }
        echo json_encode(['ok' => true, 'counts' => $counts], JSON_UNESCAPED_UNICODE);
        exit;
    }
    http_response_code(405);
    echo json_encode(['error' => 'Método não permitido']);
    exit;
}

// ── Backups versionados da campanha ──────────────────────────
if ($action === 'backup_list' && $method === 'GET') {
    $stmt = $pdo->prepare(
        "SELECT id, label, kind, created_by, resumo, created_at
         FROM data_backups WHERE tenant_id = ?
         ORDER BY created_at DESC LIMIT 40"
    );
    $stmt->execute([$tenantId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $items = [];
    foreach ($rows as $row) {
        $resumo = null;
        if (!empty($row['resumo'])) {
            $decoded = json_decode($row['resumo'], true);
            $resumo = is_array($decoded) ? $decoded : null;
        }
        $items[] = [
            'id' => $row['id'],
            'label' => $row['label'],
            'kind' => $row['kind'],
            'createdBy' => $row['created_by'],
            'createdAt' => $row['created_at'],
            'resumo' => $resumo,
        ];
    }
    echo json_encode(['ok' => true, 'items' => $items], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'backup_get' && $method === 'GET') {
    $id = trim((string)($_GET['id'] ?? ''));
    if ($id === '') {
        http_response_code(400);
        echo json_encode(['error' => 'id obrigatório']);
        exit;
    }
    $stmt = $pdo->prepare(
        "SELECT id, label, kind, created_by, resumo, payload, created_at
         FROM data_backups WHERE tenant_id = ? AND id = ? LIMIT 1"
    );
    $stmt->execute([$tenantId, $id]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) {
        http_response_code(404);
        echo json_encode(['error' => 'Backup não encontrado']);
        exit;
    }
    $payload = json_decode($row['payload'], true);
    $resumo = json_decode($row['resumo'] ?? 'null', true);
    echo json_encode([
        'ok' => true,
        'backup' => [
            'id' => $row['id'],
            'label' => $row['label'],
            'kind' => $row['kind'],
            'createdBy' => $row['created_by'],
            'createdAt' => $row['created_at'],
            'resumo' => is_array($resumo) ? $resumo : null,
            'dados' => is_array($payload) ? ($payload['dados'] ?? $payload) : null,
        ],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'backup_save' && $method === 'POST') {
    if (!is_array($JSON_BODY)) {
        http_response_code(400);
        echo json_encode(['error' => 'JSON inválido']);
        exit;
    }
    $dados = $JSON_BODY['dados'] ?? null;
    if (!is_array($dados) || !count($dados)) {
        http_response_code(400);
        echo json_encode(['error' => 'dados vazios']);
        exit;
    }
    $label = trim((string)($JSON_BODY['label'] ?? 'Snapshot'));
    if ($label === '') $label = 'Snapshot';
    $kind = trim((string)($JSON_BODY['kind'] ?? 'manual'));
    if (!in_array($kind, ['manual', 'daily', 'pre_deploy', 'pre_restore'], true)) {
        $kind = 'manual';
    }
    $materiais = 0;
    $rotas = 0;
    $equipe = 0;
    if (isset($dados['materiais_estoque'])) {
        $tmp = is_string($dados['materiais_estoque'])
            ? json_decode($dados['materiais_estoque'], true)
            : $dados['materiais_estoque'];
        $materiais = is_array($tmp) ? count($tmp) : 0;
    }
    if (isset($dados['rotas_logistica'])) {
        $tmp = is_string($dados['rotas_logistica'])
            ? json_decode($dados['rotas_logistica'], true)
            : $dados['rotas_logistica'];
        $rotas = is_array($tmp) ? count($tmp) : 0;
    }
    if (isset($dados['equipe_membros'])) {
        $tmp = is_string($dados['equipe_membros'])
            ? json_decode($dados['equipe_membros'], true)
            : $dados['equipe_membros'];
        $equipe = is_array($tmp) ? count($tmp) : 0;
    }
    $resumo = [
        'keys' => count($dados),
        'materiais' => $materiais,
        'rotas' => $rotas,
        'equipe' => $equipe,
    ];
    $id = uuidV4();
    $payload = json_encode([
        '_app' => 'campanha-app',
        '_versao' => 2,
        'dados' => $dados,
    ], JSON_UNESCAPED_UNICODE);
    if ($payload === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Falha ao serializar backup']);
        exit;
    }
    $stmt = $pdo->prepare(
        "INSERT INTO data_backups (id, tenant_id, label, kind, created_by, resumo, payload)
         VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    try {
        $stmt->execute([
            $id,
            $tenantId,
            mb_substr($label, 0, 180),
            $kind,
            $email,
            json_encode($resumo, JSON_UNESCAPED_UNICODE),
            $payload,
        ]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['error' => 'Não gravou o backup (payload grande demais ou erro de banco).']);
        exit;
    }

    // Retenção: 14 diários + 20 manuais/outros
    if ($kind === 'daily') {
        $pdo->prepare(
            "DELETE FROM data_backups WHERE tenant_id = ? AND kind = 'daily' AND id NOT IN (
                SELECT id FROM (
                    SELECT id FROM data_backups WHERE tenant_id = ? AND kind = 'daily'
                    ORDER BY created_at DESC LIMIT 14
                ) t
            )"
        )->execute([$tenantId, $tenantId]);
    } else {
        $pdo->prepare(
            "DELETE FROM data_backups WHERE tenant_id = ? AND kind <> 'daily' AND id NOT IN (
                SELECT id FROM (
                    SELECT id FROM data_backups WHERE tenant_id = ? AND kind <> 'daily'
                    ORDER BY created_at DESC LIMIT 20
                ) t
            )"
        )->execute([$tenantId, $tenantId]);
    }

    echo json_encode([
        'ok' => true,
        'backup' => [
            'id' => $id,
            'label' => $label,
            'kind' => $kind,
            'createdAt' => date('Y-m-d H:i:s'),
            'resumo' => $resumo,
        ],
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── Fotos por URL (materiais / equipe) — fora do JSON do store ──
if ($action === 'media_upload' && $method === 'POST') {
    if (!is_array($JSON_BODY)) {
        http_response_code(400);
        echo json_encode(['error' => 'JSON inválido']);
        exit;
    }
    $scope = strtolower(preg_replace('/[^a-z0-9_]/', '', (string)($JSON_BODY['scope'] ?? 'materiais')));
    if (!in_array($scope, ['materiais', 'equipe'], true)) {
        $scope = 'materiais';
    }
    $entityId = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($JSON_BODY['entityId'] ?? ''));
    if ($entityId === '') {
        $entityId = bin2hex(random_bytes(6));
    }
    if (strlen($entityId) > 64) {
        $entityId = substr($entityId, 0, 64);
    }
    $dataUrl = (string)($JSON_BODY['dataUrl'] ?? '');
    if (!preg_match('#^data:image/(jpeg|jpg|png|webp|gif);base64,#i', $dataUrl, $m)) {
        http_response_code(400);
        echo json_encode(['error' => 'Imagem inválida (use JPEG/PNG/WebP).']);
        exit;
    }
    $ext = strtolower($m[1]);
    if ($ext === 'jpeg' || $ext === 'jpg') $ext = 'jpg';
    $comma = strpos($dataUrl, ',');
    if ($comma === false) {
        http_response_code(400);
        echo json_encode(['error' => 'dataUrl inválido']);
        exit;
    }
    $bin = base64_decode(substr($dataUrl, $comma + 1), true);
    if ($bin === false || strlen($bin) < 64) {
        http_response_code(400);
        echo json_encode(['error' => 'Não foi possível decodificar a imagem.']);
        exit;
    }
    if (strlen($bin) > 950000) {
        http_response_code(400);
        echo json_encode(['error' => 'Arquivo muito grande (máx. ~900 KB).']);
        exit;
    }
    if (@getimagesizefromstring($bin) === false) {
        http_response_code(400);
        echo json_encode(['error' => 'Arquivo não é uma imagem válida.']);
        exit;
    }
    $tenantSafe = preg_replace('/[^a-zA-Z0-9_-]/', '', (string)$tenantId);
    if ($tenantSafe === '') {
        http_response_code(400);
        echo json_encode(['error' => 'Tenant inválido']);
        exit;
    }
    $dir = __DIR__ . '/uploads/' . $tenantSafe . '/' . $scope;
    if (!is_dir($dir) && !@mkdir($dir, 0755, true)) {
        http_response_code(500);
        echo json_encode(['error' => 'Não criou pasta de uploads']);
        exit;
    }
    $hash = substr(hash('sha256', $bin), 0, 12);
    $fname = $entityId . '-' . $hash . '.' . $ext;
    $path = $dir . '/' . $fname;
    if (@file_put_contents($path, $bin) === false) {
        http_response_code(500);
        echo json_encode(['error' => 'Falha ao gravar arquivo']);
        exit;
    }
    $url = '/uploads/' . $tenantSafe . '/' . $scope . '/' . $fname;
    echo json_encode([
        'ok' => true,
        'url' => $url,
        'scope' => $scope,
        'bytes' => strlen($bin),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── Presença em tempo real ────────────────────────────────────
if ($action === 'presence_ping' && $method === 'POST') {
    $nome = mb_substr(trim((string)($JSON_BODY['nome'] ?? '')), 0, 120);
    $tabId = mb_substr(preg_replace('/[^a-zA-Z0-9_-]/', '', (string)($JSON_BODY['tabId'] ?? '')), 0, 64);
    $stmt = $pdo->prepare(
        "INSERT INTO user_presence (tenant_id, email, nome, tab_id, last_seen)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE nome = VALUES(nome), tab_id = VALUES(tab_id), last_seen = NOW()"
    );
    $stmt->execute([$tenantId, $email, $nome ?: null, $tabId ?: null]);
    // Limpa presenças muito antigas (> 10 min)
    $pdo->prepare("DELETE FROM user_presence WHERE tenant_id = ? AND last_seen < DATE_SUB(NOW(), INTERVAL 10 MINUTE)")
        ->execute([$tenantId]);
    // Retorna lista atualizada (ativos nos últimos 2 min)
    $list = $pdo->prepare(
        "SELECT email, nome, last_seen FROM user_presence
         WHERE tenant_id = ? AND last_seen >= DATE_SUB(NOW(), INTERVAL 2 MINUTE)
         ORDER BY last_seen DESC"
    );
    $list->execute([$tenantId]);
    $users = $list->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['ok' => true, 'users' => $users, 'count' => count($users)], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'presence_list' && $method === 'GET') {
    $windowMin = max(1, min(10, (int)($_GET['window'] ?? 2)));
    $stmt = $pdo->prepare(
        "SELECT email, nome, last_seen FROM user_presence
         WHERE tenant_id = ? AND last_seen >= DATE_SUB(NOW(), INTERVAL ? MINUTE)
         ORDER BY last_seen DESC"
    );
    $stmt->execute([$tenantId, $windowMin]);
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC);
    echo json_encode(['ok' => true, 'users' => $users, 'count' => count($users)], JSON_UNESCAPED_UNICODE);
    exit;
}

// ── store_meta: retorna apenas chaves + timestamps (usado pelo pull incremental) ──

if ($action === 'store_meta' && $method === 'GET') {
    $stmt = $pdo->prepare('SELECT `key`, updated_at FROM store WHERE tenant_id = ? ORDER BY `key`');
    $stmt->execute([$tenantId]);
    $rows = filterStoreRowsForMember($stmt->fetchAll(PDO::FETCH_ASSOC), $memberRole, $memberCanViewFinance);
    $updated = [];
    $keys = [];
    foreach ($rows as $r) {
        $updated[$r['key']] = $r['updated_at'];
        $keys[] = $r['key'];
    }
    echo json_encode(['ok' => true, 'updated' => $updated, 'keys' => $keys], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'store_sync_token' && $method === 'GET') {
    echo json_encode([
        'ok' => true,
        'token' => tenantStoreSyncToken($pdo, $tenantId),
    ], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($action === 'store_sync_wait' && $method === 'GET') {
    $since = trim((string)($_GET['since'] ?? ''));
    $timeoutSec = max(5, min(28, (int)($_GET['timeout'] ?? 25)));
    $deadline = time() + $timeoutSec;
    $baseline = $since !== '' ? $since : tenantStoreSyncToken($pdo, $tenantId);
    while (time() < $deadline && !connection_aborted()) {
        $token = tenantStoreSyncToken($pdo, $tenantId);
        if ($token !== $baseline) {
            echo json_encode(['ok' => true, 'changed' => true, 'token' => $token], JSON_UNESCAPED_UNICODE);
            exit;
        }
        usleep(250000);
    }
    http_response_code(304);
    exit;
}

if ($method === 'GET') {
    if ($key !== '') {
        if (!memberCanAccessStoreKey($key, $memberRole, $memberCanViewFinance)) {
            http_response_code(403);
            echo json_encode(['error' => 'Sem permissão para acessar estes dados.']);
            exit;
        }
        $stmt = $pdo->prepare('SELECT `value` FROM store WHERE tenant_id = ? AND `key` = ?');
        $stmt->execute([$tenantId, $key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        echo $row ? $row['value'] : 'null';
        exit;
    }
    $keysParam = trim((string)($_GET['keys'] ?? ''));
    $since = trim((string)($_GET['since'] ?? ''));
    if ($keysParam !== '') {
        $keyList = array_values(array_unique(array_filter(array_map('trim', explode(',', $keysParam)))));
        if (!count($keyList)) {
            echo json_encode(['data' => (object)[], 'updated' => (object)[]], JSON_UNESCAPED_UNICODE);
            exit;
        }
        if (count($keyList) > 48) {
            $keyList = array_slice($keyList, 0, 48);
        }
        $keyList = filterStoreKeysForMember($keyList, $memberRole, $memberCanViewFinance);
        if (!count($keyList)) {
            echo json_encode(['data' => (object)[], 'updated' => (object)[]], JSON_UNESCAPED_UNICODE);
            exit;
        }
        $placeholders = implode(',', array_fill(0, count($keyList), '?'));
        $stmt = $pdo->prepare(
            "SELECT `key`, `value`, updated_at FROM store WHERE tenant_id = ? AND `key` IN ($placeholders)"
        );
        $stmt->execute(array_merge([$tenantId], $keyList));
    } elseif ($since !== '') {
        $stmt = $pdo->prepare(
            'SELECT `key`, `value`, updated_at FROM store WHERE tenant_id = ? AND updated_at > ? ORDER BY updated_at ASC'
        );
        $stmt->execute([$tenantId, $since]);
    } else {
        $stmt = $pdo->prepare('SELECT `key`, `value`, updated_at FROM store WHERE tenant_id = ?');
        $stmt->execute([$tenantId]);
    }
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    $rows = filterStoreRowsForMember($rows, $memberRole, $memberCanViewFinance);
    $out = [];
    $meta = [];
    foreach ($rows as $r) {
        $out[$r['key']] = json_decode($r['value'], true);
        $meta[$r['key']] = $r['updated_at'];
    }
    echo json_encode(['data' => $out, 'updated' => $meta], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST' && $bulk) {
    if (!is_array($JSON_BODY)) {
        http_response_code(400);
        echo json_encode(['error' => 'JSON inválido']);
        exit;
    }
    $stmt = $pdo->prepare(
        'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
    );
    $n = 0;
    // Removidos ANTES da lista — senão o merge ressuscita quem acabou de apagar
    $bulkKeys = array_keys($JSON_BODY);
    usort($bulkKeys, function ($a, $b) {
        $rank = function ($k) {
            if ($k === 'apoiadores_removidos' || $k === 'equipe_removidos' || $k === 'rotas_logistica_removidos') return 0;
            if ($k === 'materiais_removidos' || $k === 'materiais_distribuicao_removidos' || $k === 'materiais_retiradas_removidos') return 0;
            if ($k === 'apoiadores_lista') return 1;
            if ($k === 'equipe_membros') return 2;
            if ($k === 'rotas_logistica') return 2;
            return 3;
        };
        return $rank($a) - $rank($b);
    });
    $errors = [];
    $conflicts = [];
    $replaceSet = [];
    $expectedUpdated = is_array($JSON_BODY['_expectedUpdated'] ?? null) ? $JSON_BODY['_expectedUpdated'] : [];
    if (isset($JSON_BODY['_replace']) && is_array($JSON_BODY['_replace'])) {
        foreach ($JSON_BODY['_replace'] as $rk) {
            $replaceSet[(string)$rk] = true;
        }
    }
    foreach ($bulkKeys as $appKey) {
        $val = $JSON_BODY[$appKey];
        if (!is_string($appKey) || $appKey === '' || $appKey[0] === '_') continue;
        if (!memberCanAccessStoreKey($appKey, $memberRole, $memberCanViewFinance)) {
            $errors[] = $appKey.': sem permissão';
            continue;
        }
        // Truncar chaves muito longas para evitar erro no MySQL VARCHAR(191)
        if (strlen($appKey) > 191) {
            $errors[] = substr($appKey, 0, 60) . '… (chave longa demais)';
            continue;
        }
        try {
            if (!storeWriteAllowed($pdo, $tenantId, $appKey, $expectedUpdated, isset($replaceSet[$appKey]))) {
                $conflicts[] = $appKey;
                continue;
            }
            if ($appKey === 'apoiadores_lista' || $appKey === 'apoiadores_removidos' || $appKey === 'equipe_removidos' || $appKey === 'equipe_membros'
                || $appKey === 'rotas_logistica' || $appKey === 'rotas_logistica_removidos'
                || $appKey === 'rotas_diarias' || $appKey === 'rotas_diarias_removidos'
                || $appKey === 'materiais_removidos' || $appKey === 'materiais_distribuicao_removidos' || $appKey === 'materiais_retiradas_removidos'
                || $appKey === 'materiais_distribuicao' || $appKey === 'materiais_retiradas' || $appKey === 'materiais_entradas') {
                $encoded = encodeStoreValue($pdo, $tenantId, $appKey, $val, isset($replaceSet[$appKey]));
            } else {
                $encoded = json_encode($val, JSON_UNESCAPED_UNICODE);
            }
            $encoded = keepFilledIgrejasIfIncomingEmpty($pdo, $tenantId, $appKey, $encoded, isset($replaceSet[$appKey]));
            $encoded = mergeIgrejasStoreOnSave($pdo, $tenantId, $appKey, $encoded, isset($replaceSet[$appKey]));
            $stmt->execute([$tenantId, $appKey, $encoded]);
            $n++;
        } catch (Exception $e) {
            $errors[] = $appKey . ': ' . $e->getMessage();
        }
    }
    if ($conflicts && !$n) {
        http_response_code(409);
        echo json_encode(['ok' => false, 'conflict' => true, 'keys' => $conflicts]);
        exit;
    }
    if ($errors && !$n) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => implode('; ', array_slice($errors, 0, 3))]);
        exit;
    }
    echo json_encode(['ok' => true, 'count' => $n, 'errors' => $errors, 'conflicts' => $conflicts]);
    exit;
}

if ($method === 'POST') {
    if ($key === '' || $RAW_BODY === '') {
        http_response_code(400);
        echo json_encode(['error' => 'key e body obrigatórios']);
        exit;
    }
    if (!memberCanAccessStoreKey($key, $memberRole, $memberCanViewFinance)) {
        http_response_code(403);
        echo json_encode(['error' => 'Sem permissão para alterar estes dados.']);
        exit;
    }
    if (strlen($key) > 191) {
        http_response_code(400);
        echo json_encode(['ok' => false, 'error' => 'Chave muito longa (max 191 chars): ' . substr($key, 0, 60)]);
        exit;
    }
    try {
        $doReplace = isset($_GET['replace']);
        $expectedHeader = trim((string)($_SERVER['HTTP_X_EXPECTED_UPDATED_AT'] ?? ''));
        if (!$doReplace && $expectedHeader !== '') {
            $cur = storeKeyUpdatedAt($pdo, $tenantId, $key);
            if ($cur !== null && $cur !== '') {
                $curTs = strtotime($cur);
                $expTs = strtotime($expectedHeader);
                if ($curTs !== false && $expTs !== false && $curTs > $expTs + 1) {
                    http_response_code(409);
                    echo json_encode(['ok' => false, 'conflict' => true, 'key' => $key]);
                    exit;
                }
            }
        }
        if ($key === 'apoiadores_lista' || $key === 'apoiadores_removidos' || $key === 'equipe_membros'
            || $key === 'rotas_logistica' || $key === 'rotas_logistica_removidos'
            || $key === 'rotas_diarias' || $key === 'rotas_diarias_removidos'
            || $key === 'materiais_removidos' || $key === 'materiais_distribuicao_removidos' || $key === 'materiais_retiradas_removidos'
            || $key === 'materiais_distribuicao' || $key === 'materiais_retiradas' || $key === 'materiais_entradas') {
            $decoded = json_decode($RAW_BODY, true);
            $encoded = encodeStoreValue($pdo, $tenantId, $key, $decoded);
        } else {
            $encoded = $RAW_BODY;
        }
        $stmt = $pdo->prepare(
            'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
        );
        $encoded = keepFilledIgrejasIfIncomingEmpty($pdo, $tenantId, $key, $encoded, isset($_GET['replace']));
        $encoded = mergeIgrejasStoreOnSave($pdo, $tenantId, $key, $encoded, isset($_GET['replace']));
        $stmt->execute([$tenantId, $key, $encoded]);
        echo json_encode(['ok' => true]);
    } catch (Exception $e) {
        http_response_code(500);
        echo json_encode(['ok' => false, 'error' => 'Erro ao salvar "' . $key . '": ' . $e->getMessage()]);
    }
    exit;
}

if ($method === 'DELETE') {
    if ($key === '') {
        http_response_code(400);
        echo json_encode(['error' => 'key obrigatório']);
        exit;
    }
    if (!memberCanAccessStoreKey($key, $memberRole, $memberCanViewFinance)) {
        http_response_code(403);
        echo json_encode(['error' => 'Sem permissão para apagar estes dados.']);
        exit;
    }
    $stmt = $pdo->prepare('DELETE FROM store WHERE tenant_id = ? AND `key` = ?');
    $stmt->execute([$tenantId, $key]);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Método não permitido']);
exit;

function ensureSchema(PDO $pdo) {
    $pdo->exec("CREATE TABLE IF NOT EXISTS tenants (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(120) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS tenant_members (
        tenant_id VARCHAR(36) NOT NULL,
        email VARCHAR(191) NOT NULL,
        role ENUM('owner','member') NOT NULL DEFAULT 'member',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, email),
        KEY idx_members_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    try {
        $hasTabs = count($pdo->query("SHOW COLUMNS FROM tenant_members LIKE 'allowed_tabs'")->fetchAll()) > 0;
        if (!$hasTabs) {
            $pdo->exec("ALTER TABLE tenant_members ADD COLUMN allowed_tabs TEXT NULL AFTER role");
        }
    } catch (Exception $e) { /* ignore */ }

    try {
        $hasFinance = count($pdo->query("SHOW COLUMNS FROM tenant_members LIKE 'can_view_finance'")->fetchAll()) > 0;
        if (!$hasFinance) {
            // NULL = legado (mantém acesso); novos convites definem 0 ou 1 explicitamente
            $pdo->exec("ALTER TABLE tenant_members ADD COLUMN can_view_finance TINYINT(1) NULL DEFAULT NULL AFTER allowed_tabs");
        }
    } catch (Exception $e) { /* ignore */ }

    $pdo->exec("CREATE TABLE IF NOT EXISTS tenant_invites (
        token VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        email VARCHAR(191) NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        used_at DATETIME NULL,
        KEY idx_invite_tenant_email (tenant_id, email),
        KEY idx_invite_expires (expires_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS access_requests (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        email VARCHAR(191) NOT NULL,
        kind ENUM('team','tool') NOT NULL DEFAULT 'team',
        campaign_name VARCHAR(120) NULL,
        status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME NULL,
        reviewed_by VARCHAR(191) NULL,
        KEY idx_ar_tenant_status (tenant_id, status),
        KEY idx_ar_email (email)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    try {
        $hasKind = count($pdo->query("SHOW COLUMNS FROM access_requests LIKE 'kind'")->fetchAll()) > 0;
        if (!$hasKind) {
            $pdo->exec("ALTER TABLE access_requests ADD COLUMN kind ENUM('team','tool') NOT NULL DEFAULT 'team' AFTER email");
        }
    } catch (Exception $e) { /* ignore */ }
    try {
        $hasCn = count($pdo->query("SHOW COLUMNS FROM access_requests LIKE 'campaign_name'")->fetchAll()) > 0;
        if (!$hasCn) {
            $pdo->exec("ALTER TABLE access_requests ADD COLUMN campaign_name VARCHAR(120) NULL AFTER kind");
        }
    } catch (Exception $e) { /* ignore */ }

    $pdo->exec("CREATE TABLE IF NOT EXISTS pending_changes (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        author_email VARCHAR(191) NOT NULL,
        app_key VARCHAR(191) NOT NULL,
        action ENUM('set','delete') NOT NULL DEFAULT 'set',
        value LONGTEXT NULL,
        status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        reviewed_at DATETIME NULL,
        reviewed_by VARCHAR(191) NULL,
        KEY idx_pending_tenant_status (tenant_id, status),
        KEY idx_pending_author (tenant_id, author_email, status)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS lead_forms (
        token VARCHAR(64) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        whatsapp VARCHAR(32) NULL,
        titulo VARCHAR(180) NULL,
        config LONGTEXT NULL,
        slug VARCHAR(48) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uq_lead_tenant (tenant_id),
        UNIQUE KEY uq_lead_slug (slug)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    try {
        $hasCfg = count($pdo->query("SHOW COLUMNS FROM lead_forms LIKE 'config'")->fetchAll()) > 0;
        if (!$hasCfg) {
            $pdo->exec("ALTER TABLE lead_forms ADD COLUMN config LONGTEXT NULL AFTER titulo");
        }
    } catch (Exception $e) { /* ignore */ }

    try {
        $hasSlug = count($pdo->query("SHOW COLUMNS FROM lead_forms LIKE 'slug'")->fetchAll()) > 0;
        if (!$hasSlug) {
            $pdo->exec("ALTER TABLE lead_forms ADD COLUMN slug VARCHAR(48) NULL AFTER config");
        }
    } catch (Exception $e) { /* ignore */ }

    try {
        $idx = $pdo->query("SHOW INDEX FROM lead_forms WHERE Key_name = 'uq_lead_slug'")->fetchAll();
        if (!$idx) {
            $pdo->exec("ALTER TABLE lead_forms ADD UNIQUE KEY uq_lead_slug (slug)");
        }
    } catch (Exception $e) { /* ignore */ }

    $pdo->exec("CREATE TABLE IF NOT EXISTS lead_submits (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(64) NOT NULL,
        ip VARCHAR(64) NULL,
        phone_digits VARCHAR(20) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_lead_sub_token_time (token, created_at),
        KEY idx_lead_sub_phone (phone_digits, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS lead_views (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(36) NOT NULL,
        ip VARCHAR(64) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_lead_view_token_time (token, created_at),
        KEY idx_lead_view_tenant_time (tenant_id, created_at),
        KEY idx_lead_view_ip (token, ip, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS lead_canal_clicks (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        token VARCHAR(64) NOT NULL,
        tenant_id VARCHAR(36) NOT NULL,
        ip VARCHAR(64) NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_lead_canal_token_time (token, created_at),
        KEY idx_lead_canal_tenant_time (tenant_id, created_at),
        KEY idx_lead_canal_ip (token, ip, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $pdo->exec("CREATE TABLE IF NOT EXISTS data_backups (
        id VARCHAR(36) PRIMARY KEY,
        tenant_id VARCHAR(36) NOT NULL,
        label VARCHAR(180) NOT NULL,
        kind VARCHAR(32) NOT NULL DEFAULT 'manual',
        created_by VARCHAR(191) NULL,
        resumo TEXT NULL,
        payload LONGTEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        KEY idx_backup_tenant_time (tenant_id, created_at),
        KEY idx_backup_tenant_kind (tenant_id, kind, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

    $hasStore = false;
    try { $pdo->query('SELECT 1 FROM store LIMIT 1'); $hasStore = true; } catch (Exception $e) {}

    $hasTenantCol = false;
    if ($hasStore) {
        try {
            $hasTenantCol = count($pdo->query("SHOW COLUMNS FROM store LIKE 'tenant_id'")->fetchAll()) > 0;
        } catch (Exception $e) {}
    }

    if (!$hasStore) {
        $pdo->exec("CREATE TABLE store (
            tenant_id VARCHAR(36) NOT NULL,
            `key` VARCHAR(191) NOT NULL,
            `value` LONGTEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (tenant_id, `key`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
    } elseif (!$hasTenantCol) {
        $pdo->exec("CREATE TABLE IF NOT EXISTS store_v2 (
            tenant_id VARCHAR(36) NOT NULL,
            `key` VARCHAR(191) NOT NULL,
            `value` LONGTEXT NOT NULL,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (tenant_id, `key`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

        $pdo->exec('INSERT IGNORE INTO tenants (id, name) VALUES ('.
            $pdo->quote(DEFAULT_TENANT_ID).', '.$pdo->quote(DEFAULT_TENANT_NAME).')');

        $pdo->exec(
            'INSERT IGNORE INTO store_v2 (tenant_id, `key`, `value`, updated_at)
             SELECT '.$pdo->quote(DEFAULT_TENANT_ID).', `key`, `value`, updated_at FROM store'
        );
        $pdo->exec('RENAME TABLE store TO store_legacy_pre_tenant, store_v2 TO store');
    }

    ensureTenant($pdo, DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME);

    // Tabela de presença (usuários ativos em tempo real)
    $pdo->exec("CREATE TABLE IF NOT EXISTS user_presence (
        tenant_id VARCHAR(36) NOT NULL,
        email VARCHAR(191) NOT NULL,
        nome VARCHAR(120) NULL,
        tab_id VARCHAR(64) NULL,
        last_seen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (tenant_id, email),
        KEY idx_presence_tenant_seen (tenant_id, last_seen)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
}

function ensureTenant(PDO $pdo, $id, $name) {
    $stmt = $pdo->prepare('INSERT IGNORE INTO tenants (id, name) VALUES (?, ?)');
    $stmt->execute([$id, $name]);
}

function addMember(PDO $pdo, $tenantId, $email, $role, $allowedTabs = null, $canViewFinance = null) {
    $tabsJson = $allowedTabs === null ? null : json_encode(array_values($allowedTabs), JSON_UNESCAPED_UNICODE);
    // Dono sem restrição de abas: financeiro sempre ligado.
    // Dono com abas limitadas (candidato liberado): respeita o flag.
    if ($role === 'owner' && $allowedTabs === null) {
        $canViewFinance = 1;
    } elseif ($canViewFinance === null) {
        $canViewFinance = ($role === 'owner') ? 1 : null;
    } else {
        $canViewFinance = (int)((bool)$canViewFinance);
    }
    $stmt = $pdo->prepare(
        'INSERT INTO tenant_members (tenant_id, email, role, allowed_tabs, can_view_finance) VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE role = VALUES(role), allowed_tabs = VALUES(allowed_tabs), can_view_finance = VALUES(can_view_finance)'
    );
    $stmt->execute([$tenantId, strtolower($email), $role, $tabsJson, $canViewFinance]);
}

/** null legado = true; 0 = false; 1 = true */
function normalizeCanViewFinance($raw) {
    if ($raw === null || $raw === '') return 1; // legado: mantém acesso financeiro
    if (is_bool($raw)) return $raw ? 1 : 0;
    if (is_numeric($raw)) return ((int)$raw) ? 1 : 0;
    $s = strtolower(trim((string)$raw));
    if (in_array($s, ['0', 'false', 'no', 'nao', 'não', 'off'], true)) return 0;
    if (in_array($s, ['1', 'true', 'yes', 'sim', 'on'], true)) return 1;
    return 1;
}

function decodeAllowedTabs($raw) {
    if ($raw === null || $raw === '') return null;
    if (is_array($raw)) return array_values(array_filter(array_map('strval', $raw)));
    $decoded = json_decode((string)$raw, true);
    if (!is_array($decoded)) return null;
    return array_values(array_filter(array_map('strval', $decoded)));
}

/** null = todas as abas; array = só essas */
function normalizeAllowedTabs($raw) {
    if ($raw === null || $raw === '' || $raw === false) return null;
    if (!is_array($raw)) {
        if (is_string($raw)) {
            $decoded = json_decode($raw, true);
            if (!is_array($decoded)) return null;
            $raw = $decoded;
        } else {
            return null;
        }
    }
    $allowed = [];
    $valid = [
        'dashboard', 'previsao', 'tesouraria', 'agenda', 'equipe', 'contratos', 'eleitores', 'mapa', 'rotas',
        'mapaeleitoral', 'mapasc', 'pesquisas', 'materiais', 'apoiadores', 'empresas',
        'relatorio', 'configuracoes',
    ];
    $validSet = array_flip($valid);
    foreach ($raw as $id) {
        $id = trim((string)$id);
        if ($id !== '' && isset($validSet[$id])) $allowed[$id] = true;
    }
    return array_keys($allowed);
}

function listTenantsForEmail(PDO $pdo, $email) {
    $stmt = $pdo->prepare(
        'SELECT t.id, t.name, m.role, m.allowed_tabs, m.can_view_finance FROM tenant_members m
         JOIN tenants t ON t.id = m.tenant_id
         WHERE m.email = ? ORDER BY t.name ASC'
    );
    $stmt->execute([strtolower($email)]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($rows as &$row) {
        $tabs = decodeAllowedTabs($row['allowed_tabs'] ?? null);
        // Dono com allowed_tabs gravado = módulos limitados (candidato liberado)
        $row['allowed_tabs'] = $tabs;
        $row['allowedTabs'] = $tabs;
        $isFullOwner = (($row['role'] ?? '') === 'owner') && $tabs === null;
        $finance = $isFullOwner
            ? true
            : (bool)normalizeCanViewFinance($row['can_view_finance'] ?? null);
        $row['can_view_finance'] = $finance;
        $row['canViewFinance'] = $finance;
    }
    unset($row);
    return $rows;
}

function canClaimLegacy(PDO $pdo) {
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM tenant_members WHERE tenant_id = ?');
    $stmt->execute([DEFAULT_TENANT_ID]);
    return ((int)$stmt->fetchColumn()) === 0;
}

/** Criar campanha livre só se já for dono (após liberação tool) ou se ainda não há dono na principal. */
function canCreateTenant(PDO $pdo, $email) {
    if (canClaimLegacy($pdo)) return true;
    $tenants = listTenantsForEmail($pdo, $email);
    foreach ($tenants as $t) {
        if (($t['role'] ?? '') === 'owner') return true;
    }
    return false;
}

function findPendingAccessRequestAny(PDO $pdo, $email) {
    $stmt = $pdo->prepare(
        "SELECT id, tenant_id, email, kind, campaign_name, status, created_at
         FROM access_requests
         WHERE email = ? AND status = 'pending'
         ORDER BY created_at DESC LIMIT 1"
    );
    $stmt->execute([strtolower($email)]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function contratoAuthStoreKey($codigo) {
    $raw = strtoupper(preg_replace('/[^A-Z0-9]/', '', (string)$codigo));
    if (strlen($raw) < 8 || strlen($raw) > 20) return '';
    return 'contrato_auth_'.$raw;
}

function contratoAuthLoad(PDO $pdo, $codigo) {
    $key = contratoAuthStoreKey($codigo);
    if ($key === '') return null;
    $stmt = $pdo->prepare('SELECT tenant_id, `value` FROM store WHERE `key` = ? ORDER BY updated_at DESC LIMIT 1');
    $stmt->execute([$key]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    $data = json_decode($row['value'], true);
    if (!is_array($data) || empty($data['codigo'])) return null;
    return ['tenant_id' => $row['tenant_id'], 'key' => $key, 'data' => $data];
}

function contratoAuthPublicPayload(array $data) {
    unset($data['_tenant_id'], $data['_access_token']);
    return $data;
}

function maybeBootstrapOwner(PDO $pdo, $email) {
    $raw = trim(BOOTSTRAP_OWNER_EMAILS);
    if ($raw === '') return;
    $list = array_filter(array_map(function ($e) {
        return strtolower(trim($e));
    }, explode(',', $raw)));
    if (!in_array($email, $list, true)) return;
    ensureTenant($pdo, DEFAULT_TENANT_ID, DEFAULT_TENANT_NAME);
    addMember($pdo, DEFAULT_TENANT_ID, $email, 'owner');
    // Garante acesso total: sem restrição de abas, dono pleno
    $pdo->prepare(
        "UPDATE tenant_members SET role = 'owner', allowed_tabs = NULL, can_view_finance = 1
         WHERE tenant_id = ? AND email = ?"
    )->execute([DEFAULT_TENANT_ID, strtolower($email)]);
}

function requireAuth($jsonBody) {
    unset($jsonBody);
    $hdr = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    $jwt = '';
    if (preg_match('/Bearer\s+(\S+)/i', $hdr, $m)) $jwt = $m[1];
    if ($jwt === '') {
        http_response_code(401);
        echo json_encode(['error' => 'Faça login para continuar.']);
        exit;
    }
    $user = verifySupabaseJwt($jwt);
    if (!$user || empty($user['email'])) {
        http_response_code(401);
        echo json_encode(['error' => 'Sessão inválida ou expirada.']);
        exit;
    }
    return $user;
}

function verifySupabaseJwt($jwt) {
    $url = rtrim(SUPABASE_URL, '/').'/auth/v1/user';
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_HTTPHEADER => [
            'Authorization: Bearer '.$jwt,
            'apikey: '.SUPABASE_ANON_KEY,
        ],
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code !== 200 || !$raw) return null;
    $data = json_decode($raw, true);
    return (is_array($data) && !empty($data['email'])) ? $data : null;
}

function requireTenantId($jsonBody) {
    $tid = trim($_SERVER['HTTP_X_TENANT_ID'] ?? '');
    if ($tid === '') $tid = trim($_GET['tenant_id'] ?? '');
    if ($tid === '' && is_array($jsonBody) && !empty($jsonBody['_tenant_id'])) {
        $tid = (string)$jsonBody['_tenant_id'];
    }
    if ($tid === '' || !preg_match('/^[a-zA-Z0-9_-]{8,64}$/', $tid)) {
        http_response_code(400);
        echo json_encode(['error' => 'Campanha (tenant) não informada.']);
        exit;
    }
    return $tid;
}

function requireMember(PDO $pdo, $tenantId, $email, $ownerOnly) {
    $stmt = $pdo->prepare('SELECT role FROM tenant_members WHERE tenant_id = ? AND email = ?');
    $stmt->execute([$tenantId, strtolower($email)]);
    $role = $stmt->fetchColumn();
    if (!$role) {
        http_response_code(403);
        echo json_encode(['error' => 'Sem acesso a esta campanha.']);
        exit;
    }
    if ($ownerOnly && $role !== 'owner') {
        http_response_code(403);
        echo json_encode(['error' => 'Apenas o dono pode fazer isso.']);
        exit;
    }
    return $role;
}

function uuidV4() {
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function fetchTenantName(PDO $pdo, $tenantId) {
    $stmt = $pdo->prepare('SELECT name FROM tenants WHERE id = ?');
    $stmt->execute([$tenantId]);
    $n = $stmt->fetchColumn();
    return $n ? (string)$n : 'Campanha';
}

function createInvite(PDO $pdo, $tenantId, $email) {
    $email = strtolower($email);
    // Invalida convites anteriores do mesmo e-mail nesta campanha
    $pdo->prepare(
        'UPDATE tenant_invites SET used_at = NOW() WHERE tenant_id = ? AND email = ? AND used_at IS NULL'
    )->execute([$tenantId, $email]);

    $token = bin2hex(random_bytes(24));
    $expires = date('Y-m-d H:i:s', time() + 7 * 24 * 3600);
    $stmt = $pdo->prepare(
        'INSERT INTO tenant_invites (token, tenant_id, email, expires_at) VALUES (?, ?, ?, ?)'
    );
    $stmt->execute([$token, $tenantId, $email, $expires]);
    return ['token' => $token, 'expires_at' => $expires];
}

function getInviteInfo(PDO $pdo, $token) {
    if ($token === '' || !preg_match('/^[a-f0-9]{32,64}$/i', $token)) return null;
    $stmt = $pdo->prepare(
        'SELECT i.token, i.tenant_id, i.email, i.expires_at, i.used_at, t.name AS tenant_name
         FROM tenant_invites i
         JOIN tenants t ON t.id = i.tenant_id
         WHERE i.token = ? LIMIT 1'
    );
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    if (!empty($row['used_at'])) return null;
    if (strtotime($row['expires_at']) < time()) return null;
    // Ainda precisa estar na lista de membros
    $m = $pdo->prepare('SELECT 1 FROM tenant_members WHERE tenant_id = ? AND email = ?');
    $m->execute([$row['tenant_id'], strtolower($row['email'])]);
    if (!$m->fetchColumn()) return null;
    return [
        'email' => strtolower($row['email']),
        'tenant_id' => $row['tenant_id'],
        'tenant_name' => $row['tenant_name'],
        'expires_at' => $row['expires_at'],
    ];
}

function markInviteUsed(PDO $pdo, $token) {
    $stmt = $pdo->prepare('UPDATE tenant_invites SET used_at = NOW() WHERE token = ? AND used_at IS NULL');
    $stmt->execute([$token]);
}

function lookupCepHttpGet($url) {
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 8,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_HTTPHEADER => [
            'Accept: application/json',
            'User-Agent: CampanhaApp/1.0',
        ],
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code < 200 || $code >= 300 || !$raw) return null;
    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

/** Normaliza respostas ViaCEP / BrasilAPI / OpenCEP para o formato do app. */
function normalizeCepPayload($data) {
    if (!is_array($data) || !empty($data['erro']) || !empty($data['error'])) return null;

    $logradouro = trim((string)($data['logradouro'] ?? $data['street'] ?? ''));
    $bairro = trim((string)($data['bairro'] ?? $data['neighborhood'] ?? ''));
    $localidade = trim((string)($data['localidade'] ?? $data['city'] ?? ''));
    $uf = strtoupper(trim((string)($data['uf'] ?? $data['state'] ?? '')));
    $cep = preg_replace('/\D+/', '', (string)($data['cep'] ?? ''));

    if ($localidade === '' && $uf === '' && $logradouro === '') return null;
    if (strlen($uf) > 2) $uf = substr($uf, 0, 2);

    return [
        'cep' => $cep,
        'logradouro' => $logradouro,
        'bairro' => $bairro,
        'localidade' => $localidade,
        'uf' => $uf,
        'ibge' => (string)($data['ibge'] ?? (is_array($data['ibge'] ?? null) ? ($data['ibge']['city'] ?? '') : '')),
        'complemento' => trim((string)($data['complemento'] ?? '')),
    ];
}

function lookupCepServer($digits) {
    $digits = preg_replace('/\D+/', '', (string)$digits);
    if (strlen($digits) !== 8) return null;

    $sources = [
        'https://viacep.com.br/ws/'.$digits.'/json/',
        'https://brasilapi.com.br/api/cep/v2/'.$digits,
        'https://opencep.com/v1/'.$digits,
    ];
    foreach ($sources as $url) {
        $raw = lookupCepHttpGet($url);
        $norm = normalizeCepPayload($raw);
        if ($norm) return $norm;
    }
    return null;
}

/** Busca HTML de URL externa (sites de igrejas). */
function fetchUrlHtml($url, $maxBytes = 250000, $timeoutSec = 12) {
    $url = trim((string)$url);
    if (!validateExternalHttpUrl($url)) return null;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => max(1, (int)$timeoutSec),
        CURLOPT_CONNECTTIMEOUT => min(3, max(1, (int)$timeoutSec)),
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS => 3,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_REDIR_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_USERAGENT => 'CampanhaApp/1.0 (church enrich)',
        CURLOPT_HTTPHEADER => ['Accept: text/html,application/xhtml+xml'],
    ]);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($code < 200 || $code >= 400 || !$raw) return null;
    if (strlen($raw) > $maxBytes) {
        $raw = substr($raw, 0, $maxBytes);
    }
    return $raw;
}

/** Extrai links de Instagram e Facebook de HTML de site. */
function extrairRedesSociaisHtml($html) {
    $out = ['instagram' => '', 'facebook' => ''];
    if (!is_string($html) || $html === '') return $out;

    $lower = strtolower($html);

    if (preg_match_all('/https?:\/\/(?:www\.)?instagram\.com\/([A-Za-z0-9._]+)/i', $html, $m)) {
        foreach ($m[1] as $user) {
            $u = strtolower($user);
            if (in_array($u, ['p', 'reel', 'reels', 'stories', 'explore', 'accounts', 'about'], true)) continue;
            $out['instagram'] = 'https://instagram.com/'.$user;
            break;
        }
    }

    if (preg_match_all('/https?:\/\/(?:www\.|m\.)?facebook\.com\/([A-Za-z0-9._\-]+)/i', $html, $m)) {
        foreach ($m[1] as $page) {
            $p = strtolower($page);
            if (in_array($p, ['sharer', 'share', 'plugins', 'dialog', 'login', 'help', 'policy', 'watch'], true)) continue;
            if (strpos($p, 'share.php') !== false) continue;
            $out['facebook'] = 'https://facebook.com/'.$page;
            break;
        }
    }

  // meta og:url alternativas
    if ($out['instagram'] === '' && preg_match('/property=["\']og:url["\']\s+content=["\']https?:\/\/(?:www\.)?instagram\.com\/([^"\']+)/i', $html, $og)) {
        $out['instagram'] = 'https://instagram.com/'.$og[1];
    }
    if ($out['facebook'] === '' && preg_match('/property=["\']og:url["\']\s+content=["\']https?:\/\/(?:www\.|m\.)?facebook\.com\/([^"\']+)/i', $html, $og)) {
        $out['facebook'] = 'https://facebook.com/'.$og[1];
    }

    return $out;
}

function validateMemberPassword($password) {
    if (!is_string($password) || strlen($password) < 6) {
        return 'A senha precisa ter ao menos 6 caracteres.';
    }
    if (strlen($password) > 72) {
        return 'A senha é longa demais.';
    }
    return null;
}

function supabaseAdminRequest($method, $path, $body = null) {
    $key = SUPABASE_SERVICE_ROLE_KEY;
    if ($key === '') {
        return ['code' => 0, 'data' => null, 'raw' => '', 'error' => 'Chave service_role não configurada no servidor.'];
    }
    $url = rtrim(SUPABASE_URL, '/').$path;
    $headers = [
        'Authorization: Bearer '.$key,
        'apikey: '.$key,
        'Content-Type: application/json',
    ];
    $ch = curl_init($url);
    $opts = [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 20,
        CURLOPT_CUSTOMREQUEST => strtoupper($method),
        CURLOPT_HTTPHEADER => $headers,
    ];
    if ($body !== null) {
        $opts[CURLOPT_POSTFIELDS] = json_encode($body, JSON_UNESCAPED_UNICODE);
    }
    curl_setopt_array($ch, $opts);
    $raw = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $cerr = curl_error($ch);
    curl_close($ch);
    if ($raw === false) {
        return ['code' => 0, 'data' => null, 'raw' => '', 'error' => $cerr ?: 'Falha de rede no Supabase.'];
    }
    $data = json_decode($raw, true);
    return ['code' => $code, 'data' => is_array($data) ? $data : null, 'raw' => $raw, 'error' => null];
}

function supabaseFindUserIdByEmail($email) {
    $email = strtolower(trim((string)$email));
    $res = supabaseAdminRequest('GET', '/auth/v1/admin/users?page=1&per_page=200');
    if ($res['code'] !== 200 || !is_array($res['data'])) return null;
    $users = $res['data']['users'] ?? $res['data'];
    if (!is_array($users)) return null;
    foreach ($users as $u) {
        if (!is_array($u)) continue;
        if (strtolower((string)($u['email'] ?? '')) === $email) {
            return (string)($u['id'] ?? '');
        }
    }
    $res2 = supabaseAdminRequest('GET', '/auth/v1/admin/users?email='.rawurlencode($email));
    if ($res2['code'] === 200 && is_array($res2['data'])) {
        $users2 = $res2['data']['users'] ?? $res2['data'];
        if (is_array($users2)) {
            foreach ($users2 as $u) {
                if (!is_array($u)) continue;
                if (strtolower((string)($u['email'] ?? '')) === $email) {
                    return (string)($u['id'] ?? '');
                }
            }
        }
        if (!empty($res2['data']['id']) && strtolower((string)($res2['data']['email'] ?? '')) === $email) {
            return (string)$res2['data']['id'];
        }
    }
    return null;
}

function supabaseSetUserPassword($email, $password) {
    $email = strtolower(trim((string)$email));
    if (SUPABASE_SERVICE_ROLE_KEY === '') {
        return [
            'ok' => false,
            'error' => 'Para criar senha pelo sistema, configure a chave service_role do Supabase no servidor (.env.deploy).',
        ];
    }
    $create = supabaseAdminRequest('POST', '/auth/v1/admin/users', [
        'email' => $email,
        'password' => $password,
        'email_confirm' => true,
    ]);
    if ($create['code'] === 200 || $create['code'] === 201) {
        return ['ok' => true, 'created' => true];
    }
    $msg = '';
    if (is_array($create['data'])) {
        $msg = (string)($create['data']['msg'] ?? $create['data']['message'] ?? $create['data']['error_description'] ?? $create['data']['error'] ?? '');
    }
    $already = $create['code'] === 422
        || $create['code'] === 400
        || stripos($msg, 'already') !== false
        || stripos($msg, 'registered') !== false
        || stripos($msg, 'exists') !== false;

    $userId = supabaseFindUserIdByEmail($email);
    if ($userId === null || $userId === '') {
        if ($already) {
            return ['ok' => false, 'error' => 'Conta já existe, mas não foi possível localizá-la para atualizar a senha.'];
        }
        return ['ok' => false, 'error' => $msg !== '' ? $msg : 'Falha ao criar usuário no login (HTTP '.$create['code'].').'];
    }
    $upd = supabaseAdminRequest('PUT', '/auth/v1/admin/users/'.rawurlencode($userId), [
        'password' => $password,
        'email_confirm' => true,
    ]);
    if ($upd['code'] === 200 || $upd['code'] === 201) {
        return ['ok' => true, 'created' => false];
    }
    $umsg = '';
    if (is_array($upd['data'])) {
        $umsg = (string)($upd['data']['msg'] ?? $upd['data']['message'] ?? $upd['data']['error'] ?? '');
    }
    return ['ok' => false, 'error' => $umsg !== '' ? $umsg : 'Falha ao atualizar senha (HTTP '.$upd['code'].').'];
}

function sendAccessReadyEmail($to, $tenantName) {
    $tenantName = htmlspecialchars((string)$tenantName, ENT_QUOTES, 'UTF-8');
    $linkEsc = htmlspecialchars(rtrim(APP_PUBLIC_URL, '/').'/', ENT_QUOTES, 'UTF-8');
    $subject = '=?UTF-8?B?'.base64_encode('Acesso liberado — '.$tenantName).'?=';
    $html = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px">'
        .'<div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:28px">'
        .'<h2 style="margin:0 0 12px;color:#fbbf24">Acesso liberado</h2>'
        .'<p style="line-height:1.5;color:#cbd5e1">A campanha <strong style="color:#fff">'.$tenantName.'</strong> liberou seu acesso com senha definida pelo dono.</p>'
        .'<p style="line-height:1.5;color:#cbd5e1">Peça a senha ao responsável e entre com este e-mail no sistema.</p>'
        .'<p style="margin:28px 0"><a href="'.$linkEsc.'" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px">Entrar no sistema</a></p>'
        .'</div></body></html>';
    $headers = "MIME-Version: 1.0\r\n"
        ."Content-type: text/html; charset=UTF-8\r\n"
        ."From: Campanha <noreply@campanha.space>\r\n"
        ."Reply-To: noreply@campanha.space\r\n";
    return @mail($to, $subject, $html, $headers);
}

function sendInviteEmail($to, $tenantName, $link) {
    $tenantName = htmlspecialchars((string)$tenantName, ENT_QUOTES, 'UTF-8');
    $linkEsc = htmlspecialchars((string)$link, ENT_QUOTES, 'UTF-8');
    $subject = '=?UTF-8?B?'.base64_encode('Convite para a campanha '.$tenantName).'?=';
    $html = '<!DOCTYPE html><html><body style="font-family:Arial,sans-serif;background:#0f172a;color:#e2e8f0;padding:24px">'
        .'<div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:16px;padding:28px">'
        .'<h2 style="margin:0 0 12px;color:#fbbf24">Você foi convidado</h2>'
        .'<p style="line-height:1.5;color:#cbd5e1">A campanha <strong style="color:#fff">'.$tenantName.'</strong> liberou seu acesso.</p>'
        .'<p style="line-height:1.5;color:#cbd5e1">Clique no botão abaixo, confirme e <strong>crie sua senha</strong> para entrar no sistema.</p>'
        .'<p style="margin:28px 0"><a href="'.$linkEsc.'" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px">Criar senha e entrar</a></p>'
        .'<p style="font-size:12px;color:#94a3b8;word-break:break-all">Se o botão não funcionar, copie este link:<br>'.$linkEsc.'</p>'
        .'<p style="font-size:11px;color:#64748b;margin-top:20px">O link vale por 7 dias.</p>'
        .'</div></body></html>';
    $headers = "MIME-Version: 1.0\r\n"
        ."Content-type: text/html; charset=UTF-8\r\n"
        ."From: Campanha <noreply@campanha.space>\r\n"
        ."Reply-To: noreply@campanha.space\r\n";
    return @mail($to, $subject, $html, $headers);
}

function isPendingAppKey($key) {
    if ($key === '' || $key[0] === '_') return false;
    if (strpos($key, 'campanha_active') === 0) return false;
    if (strpos($key, 'campanha_sync') === 0) return false;
    if ($key === 'campanha_theme') return false;
    return (bool)preg_match('/^(previsao|agenda|equipe|eleitores|metas|meta|pastores|geo|igrejas|pesquisas|materiais|apoiadores|empresas|mapa|rotas)/', $key);
}

/**
 * Aplica pendências antigas direto no store (modo sem aprovação).
 * Retorna quantas foram promovidas.
 */
function promotePendingChanges(PDO $pdo, $tenantId, $reviewedBy = 'system-auto') {
    try {
        $stmt = $pdo->prepare(
            "SELECT * FROM pending_changes
             WHERE tenant_id = ? AND status = 'pending'
             ORDER BY created_at ASC
             LIMIT 300"
        );
        $stmt->execute([$tenantId]);
        $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    } catch (Exception $e) {
        return 0;
    }
    if (!$rows) return 0;

    $n = 0;
    $by = $reviewedBy !== '' ? $reviewedBy : 'system-auto';
    foreach ($rows as $row) {
        $appKey = (string)($row['app_key'] ?? '');
        if ($appKey === '' || !isPendingAppKey($appKey)) {
            try {
                $pdo->prepare(
                    "UPDATE pending_changes SET status = 'rejected', reviewed_at = NOW(), reviewed_by = ?
                     WHERE id = ?"
                )->execute([$by, $row['id']]);
            } catch (Exception $e) { /* ignore */ }
            continue;
        }
        $changeAction = (($row['action'] ?? 'set') === 'delete') ? 'delete' : 'set';
        try {
            if ($changeAction === 'delete') {
                $del = $pdo->prepare('DELETE FROM store WHERE tenant_id = ? AND `key` = ?');
                $del->execute([$tenantId, $appKey]);
            } else {
                $decoded = json_decode($row['value'] ?? 'null', true);
                if (json_last_error() !== JSON_ERROR_NONE) {
                    $decoded = $row['value'] ?? null;
                }
                $encoded = encodeStoreValue($pdo, $tenantId, $appKey, $decoded);
                $ins = $pdo->prepare(
                    'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
                     ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
                );
                $ins->execute([$tenantId, $appKey, $encoded]);
            }
            $pdo->prepare(
                "UPDATE pending_changes SET status = 'approved', reviewed_at = NOW(), reviewed_by = ?
                 WHERE id = ?"
            )->execute([$by, $row['id']]);
            $n++;
        } catch (Exception $e) {
            // Mantém pending se falhar
        }
    }
    return $n;
}

function pendingKeyAba($key) {
    if (strpos($key, 'equipe') === 0) return 'Equipe';
    if (strpos($key, 'agenda') === 0) return 'Agenda';
    if (strpos($key, 'empresas') === 0) return 'Empresas';
    if (strpos($key, 'apoiadores') === 0) return 'Apoiadores';
    if (strpos($key, 'materiais') === 0) return 'Materiais';
    if (strpos($key, 'eleitores') === 0 || strpos($key, 'metas') === 0 || strpos($key, 'meta_') === 0) return 'Eleitores';
    if (strpos($key, 'previsao') === 0) return 'Previsão';
    if (strpos($key, 'mapa') === 0 || strpos($key, 'rotas') === 0 || strpos($key, 'geo') === 0) return 'Mapa';
    if (strpos($key, 'igrejas') === 0 || strpos($key, 'pastores') === 0) return 'Igrejas';
    if (strpos($key, 'pesquisas') === 0) return 'Pesquisas';
    return pendingKeyLabel($key);
}

function pendingKeyLabel($key) {
    $map = [
        'equipe_membros' => 'Lista de membros',
        'equipe_lista' => 'Lista de membros',
        'equipe_tarefas' => 'Tarefas',
        'equipe_financeiro' => 'Financeiro',
        'equipe_log' => 'Histórico da equipe',
        'agenda_eventos' => 'Eventos da agenda',
        'empresas_lista' => 'Lista de empresas',
        'apoiadores_lista' => 'Lista de apoiadores',
        'materiais_lista' => 'Lista de materiais',
        'materiais_estoque' => 'Estoque de materiais',
        'materiais_distribuicao' => 'Saídas de materiais',
        'materiais_retiradas' => 'Retiradas de materiais',
        'materiais_coordenadores' => 'Coordenadores de materiais',
        'materiais_retirada_cfg' => 'Config. de retiradas',
        'materiais_removidos' => 'Materiais removidos',
        'eleitores_data' => 'Dados de eleitores',
        'previsao_data' => 'Previsão de gasto',
        'previsao_gasto' => 'Previsão de gasto',
        'previsao_resumo' => 'Resumo da previsão',
        'pesquisas_lista' => 'Pesquisas',
        'metas_campanha' => 'Metas da campanha',
        'metas_zona' => 'Metas por zona',
        'metas_cidade' => 'Metas por cidade',
        'igrejas_visitas' => 'Visitas a igrejas',
        'igrejas_custom' => 'Igrejas cadastradas',
        'mapa_eleitoral_secoes' => 'Seções no mapa',
    ];
    if (isset($map[$key])) return $map[$key];
    return pendingKeyAba($key);
}

function pendingItemName($item) {
    if (!is_array($item)) return null;
    foreach (['nome', 'titulo', 'razaoSocial', 'nomeFantasia', 'label', 'name'] as $k) {
        if (!empty($item[$k]) && is_string($item[$k])) return trim($item[$k]);
    }
    return null;
}

function pendingItemExtra($item) {
    if (!is_array($item)) return '';
    $bits = [];
    if (!empty($item['cargo'])) $bits[] = (string)$item['cargo'];
    if (!empty($item['telefone'])) $bits[] = (string)$item['telefone'];
    if (!empty($item['cidade'])) $bits[] = (string)$item['cidade'];
    if (!empty($item['nivel'])) $bits[] = (string)$item['nivel'];
    return implode(' · ', array_slice($bits, 0, 2));
}

function isJsonList($arr) {
    if (!is_array($arr)) return false;
    if ($arr === []) return true;
    return array_keys($arr) === range(0, count($arr) - 1);
}

function describePendingChange($key, $action, $newRaw, $oldRaw) {
    $aba = pendingKeyAba($key);
    $label = pendingKeyLabel($key);
    if ($action === 'delete') {
        return [
            'summary' => "Quer apagar os dados de «{$label}» na aba {$aba}",
            'items' => [],
        ];
    }

    $new = json_decode((string)$newRaw, true);
    if (json_last_error() !== JSON_ERROR_NONE) $new = null;
    $old = null;
    if ($oldRaw !== null && $oldRaw !== '') {
        $tmp = json_decode((string)$oldRaw, true);
        if (json_last_error() === JSON_ERROR_NONE) $old = $tmp;
    }

    $items = [];

    if (is_array($new) && isJsonList($new)) {
        $indexById = function ($list) {
            $map = [];
            if (!is_array($list)) return $map;
            foreach ($list as $i => $item) {
                if (!is_array($item)) continue;
                $id = isset($item['id']) ? (string)$item['id'] : ('#'.$i);
                $map[$id] = $item;
            }
            return $map;
        };
        $nMap = $indexById($new);
        $oMap = $indexById(is_array($old) ? $old : []);

        foreach ($nMap as $id => $item) {
            $nome = pendingItemName($item) ?: 'item';
            $extra = pendingItemExtra($item);
            $suf = $extra !== '' ? " ({$extra})" : '';
            if (!isset($oMap[$id])) {
                $items[] = "Quer adicionar: {$nome}{$suf}";
            } elseif (canonicalJson(json_encode($item, JSON_UNESCAPED_UNICODE)) !== canonicalJson(json_encode($oMap[$id], JSON_UNESCAPED_UNICODE))) {
                $items[] = "Quer alterar: {$nome}{$suf}";
            }
        }
        foreach ($oMap as $id => $item) {
            if (!isset($nMap[$id])) {
                $nome = pendingItemName($item) ?: 'item';
                $items[] = "Quer remover: {$nome}";
            }
        }

        if (!$items) {
            $items[] = 'Ajuste nos dados (ordem ou formatação)';
        }

        $nAdd = 0; $nAlt = 0; $nRem = 0;
        foreach ($items as $t) {
            if (strpos($t, 'Quer adicionar') === 0) $nAdd++;
            elseif (strpos($t, 'Quer alterar') === 0) $nAlt++;
            elseif (strpos($t, 'Quer remover') === 0) $nRem++;
        }
        $parts = [];
        if ($nAdd) $parts[] = "{$nAdd} novo(s)";
        if ($nAlt) $parts[] = "{$nAlt} alterado(s)";
        if ($nRem) $parts[] = "{$nRem} removido(s)";
        $summary = $parts
            ? ("Aba {$aba} — «{$label}»: " . implode(', ', $parts))
            : ("Aba {$aba} — «{$label}»");

        return [
            'summary' => $summary,
            'items' => array_slice($items, 0, 40),
        ];
    }

    if (is_array($new) && !isJsonList($new)) {
        $oldObj = is_array($old) && !isJsonList($old) ? $old : [];
        foreach ($new as $k => $v) {
            $ov = $oldObj[$k] ?? null;
            if (canonicalJson(json_encode($v, JSON_UNESCAPED_UNICODE)) === canonicalJson(json_encode($ov, JSON_UNESCAPED_UNICODE))) continue;
            if ($ov === null) $items[] = "Novo campo: {$k}";
            else $items[] = "Alterou: {$k}";
        }
        foreach ($oldObj as $k => $v) {
            if (!array_key_exists($k, $new)) $items[] = "Removeu campo: {$k}";
        }
        if (!$items) $items[] = 'Ajuste nos dados';
        return [
            'summary' => "Aba {$aba} — «{$label}»: " . count($items) . ' mudança(s)',
            'items' => array_slice($items, 0, 40),
        ];
    }

    return [
        'summary' => "Aba {$aba} — alteração em «{$label}»",
        'items' => [],
    ];
}

/** Compara JSON ignorando ordem de chaves / formatação */
function canonicalJson($raw) {
    if ($raw === null) return 'null';
    $d = json_decode((string)$raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) return (string)$raw;
    $sort = null;
    $sort = function (&$v) use (&$sort) {
        if (!is_array($v)) return;
        $isList = array_keys($v) === range(0, count($v) - 1);
        if (!$isList) ksort($v);
        foreach ($v as &$x) $sort($x);
        unset($x);
    };
    $sort($d);
    return json_encode($d, JSON_UNESCAPED_UNICODE);
}

function leadPhoneDigits($tel) {
    $d = preg_replace('/\D+/', '', (string)$tel);
    if (strpos($d, '55') === 0 && strlen($d) > 11) $d = substr($d, 2);
    return $d;
}

function leadFormatPhone($digits) {
    $d = leadPhoneDigits($digits);
    if (strlen($d) === 11) {
        return '('.substr($d, 0, 2).') '.substr($d, 2, 5).'-'.substr($d, 7);
    }
    if (strlen($d) === 10) {
        return '('.substr($d, 0, 2).') '.substr($d, 2, 4).'-'.substr($d, 6);
    }
    return $d;
}

function leadPhonesMatch($a, $b) {
    $da = leadPhoneDigits($a);
    $db = leadPhoneDigits($b);
    if (strlen($da) < 8 || strlen($db) < 8) return false;
    if ($da === $db) return true;
    if (strlen($da) >= 9 && strlen($db) >= 9 && substr($da, -9) === substr($db, -9)) return true;
    return false;
}

function getLeadForm(PDO $pdo, $token) {
    if ($token === '' || !preg_match('/^[a-f0-9]{24,64}$/i', $token)) return null;
    $stmt = $pdo->prepare('SELECT token, tenant_id, active, whatsapp, titulo, config, slug FROM lead_forms WHERE token = ? LIMIT 1');
    $stmt->execute([$token]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

function getLeadFormBySlug(PDO $pdo, $slug) {
    $slug = normalizeLeadSlug($slug);
    if (!isValidLeadSlug($slug)) return null;
    $stmt = $pdo->prepare('SELECT token, tenant_id, active, whatsapp, titulo, config, slug FROM lead_forms WHERE slug = ? LIMIT 1');
    $stmt->execute([$slug]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** Aceita token hex longo ou slug curto (ex: ismael). */
function resolveLeadForm(PDO $pdo, $key) {
    $key = trim((string)$key);
    if ($key === '') return null;
    if (preg_match('/^[a-f0-9]{24,64}$/i', $key)) {
        return getLeadForm($pdo, $key);
    }
    return getLeadFormBySlug($pdo, $key);
}

function normalizeLeadSlug($raw) {
    $s = trim(mb_strtolower((string)$raw, 'UTF-8'));
    if ($s === '') return '';
    $map = [
        'á'=>'a','à'=>'a','ã'=>'a','â'=>'a','ä'=>'a',
        'é'=>'e','ê'=>'e','è'=>'e','ë'=>'e',
        'í'=>'i','ì'=>'i','î'=>'i','ï'=>'i',
        'ó'=>'o','ò'=>'o','õ'=>'o','ô'=>'o','ö'=>'o',
        'ú'=>'u','ù'=>'u','û'=>'u','ü'=>'u',
        'ç'=>'c','ñ'=>'n',
    ];
    $s = strtr($s, $map);
    $s = preg_replace('/[^a-z0-9]+/', '-', $s);
    $s = trim($s, '-');
    if (strlen($s) > 40) $s = rtrim(substr($s, 0, 40), '-');
    return $s;
}

function isValidLeadSlug($slug) {
    if ($slug === '' || strlen($slug) < 3 || strlen($slug) > 40) return false;
    if (!preg_match('/^[a-z0-9]+(?:-[a-z0-9]+)*$/', $slug)) return false;
    $reserved = [
        'api','assets','fotos','c','cadastro','admin','login','app','www',
        'static','public','equipe','agenda','rota','convite','sistema',
    ];
    return !in_array($slug, $reserved, true);
}

function publicLeadFormUrl($row) {
    $base = rtrim(APP_PUBLIC_URL, '/');
    $slug = normalizeLeadSlug($row['slug'] ?? '');
    if ($slug !== '' && isValidLeadSlug($slug)) {
        return $base.'/c/'.rawurlencode($slug);
    }
    return $base.'/#/cadastro/'.rawurlencode($row['token']);
}

function uniqueLeadSlug(PDO $pdo, $base, $tenantId = null) {
    $base = normalizeLeadSlug($base);
    if (!isValidLeadSlug($base)) $base = 'campanha';
    $candidate = $base;
    $n = 2;
    while (true) {
        $stmt = $pdo->prepare('SELECT tenant_id FROM lead_forms WHERE slug = ? LIMIT 1');
        $stmt->execute([$candidate]);
        $owner = $stmt->fetchColumn();
        if (!$owner || ($tenantId && $owner === $tenantId)) return $candidate;
        $candidate = $base.'-'.$n;
        if (strlen($candidate) > 40) $candidate = substr($base, 0, max(3, 40 - strlen((string)$n) - 1)).'-'.$n;
        $n++;
        if ($n > 99) {
            $candidate = $base.'-'.substr(bin2hex(random_bytes(2)), 0, 4);
            return normalizeLeadSlug($candidate);
        }
    }
}

function ensureLeadForm(PDO $pdo, $tenantId) {
    $stmt = $pdo->prepare('SELECT token, tenant_id, active, whatsapp, titulo, config, slug FROM lead_forms WHERE tenant_id = ? LIMIT 1');
    $stmt->execute([$tenantId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($row) {
        if (empty($row['slug'])) {
            $tName = '';
            try {
                $tn = $pdo->prepare('SELECT name FROM tenants WHERE id = ? LIMIT 1');
                $tn->execute([$tenantId]);
                $tName = (string)($tn->fetchColumn() ?: '');
            } catch (Exception $e) { /* ignore */ }
            $slug = uniqueLeadSlug($pdo, $tName !== '' ? $tName : 'campanha', $tenantId);
            $upd = $pdo->prepare('UPDATE lead_forms SET slug = ? WHERE tenant_id = ? AND (slug IS NULL OR slug = \'\')');
            $upd->execute([$slug, $tenantId]);
            $row['slug'] = $slug;
        }
        return $row;
    }
    $token = bin2hex(random_bytes(16));
    $tName = '';
    try {
        $tn = $pdo->prepare('SELECT name FROM tenants WHERE id = ? LIMIT 1');
        $tn->execute([$tenantId]);
        $tName = (string)($tn->fetchColumn() ?: '');
    } catch (Exception $e) { /* ignore */ }
    $slug = uniqueLeadSlug($pdo, $tName !== '' ? $tName : 'campanha', $tenantId);
    $ins = $pdo->prepare('INSERT INTO lead_forms (token, tenant_id, active, slug) VALUES (?, ?, 1, ?)');
    $ins->execute([$token, $tenantId, $slug]);
    return [
        'token' => $token,
        'tenant_id' => $tenantId,
        'active' => 1,
        'whatsapp' => null,
        'titulo' => null,
        'config' => null,
        'slug' => $slug,
    ];
}

/** Lista vazia do navegador não apaga o cadastro — exceto quando _replace pede substituição explícita. */
function keepFilledIgrejasIfIncomingEmpty(PDO $pdo, $tenantId, $key, $encoded, $replace = false) {
    if ($replace) return $encoded;
    $proteger = [
        'igrejas_custom' => true,
        'igrejas_enrich' => true,
        'geo_coords_igrejas' => true,
        'pastores_igrejas' => true,
    ];
    if (!isset($proteger[$key])) return $encoded;
    $decoded = json_decode((string)$encoded, true);
    if (!is_array($decoded) || count($decoded) > 0) return $encoded;
    $existing = storeGetJson($pdo, $tenantId, $key);
    if (is_array($existing) && count($existing) > 0) {
        return json_encode($existing, JSON_UNESCAPED_UNICODE);
    }
    return $encoded;
}

function mergeIgrejasOcultasPhp($incoming, $existing) {
    $set = [];
    foreach (is_array($existing) ? $existing : [] as $id) {
        if ($id !== null && $id !== '') $set[(string)$id] = true;
    }
    foreach (is_array($incoming) ? $incoming : [] as $id) {
        if ($id !== null && $id !== '') $set[(string)$id] = true;
    }
    return array_keys($set);
}

function mergeIgrejasCustomPhp($incoming, $existing, $replace = false, $ocultas = null) {
    if (!is_array($incoming)) $incoming = [];
    if (!is_array($existing)) $existing = [];

    if ($replace) {
        $result = $incoming;
    } else {
        $map = [];
        foreach ($existing as $ig) {
            if (is_array($ig) && isset($ig['id'])) {
                $map[(string)$ig['id']] = $ig;
            }
        }
        foreach ($incoming as $ig) {
            if (!is_array($ig) || !isset($ig['id'])) continue;
            $id = (string)$ig['id'];
            if (!isset($map[$id])) {
                $map[$id] = $ig;
                continue;
            }
            $merged = array_merge($map[$id], $ig);
            foreach ($map[$id] as $fk => $fv) {
                if (($merged[$fk] ?? '') === '' && $fv !== '' && $fv !== null) {
                    $merged[$fk] = $fv;
                }
            }
            $map[$id] = $merged;
        }
        $result = array_values($map);
    }

    if (is_array($ocultas) && count($ocultas) > 0) {
        $hide = [];
        foreach ($ocultas as $id) {
            if ($id !== null && $id !== '') $hide[(string)$id] = true;
        }
        $result = array_values(array_filter($result, function ($ig) use ($hide) {
            return is_array($ig) && isset($ig['id']) && !isset($hide[(string)$ig['id']]);
        }));
    }
    return $result;
}

function mergeIgrejasObjectsPhp($incoming, $existing) {
    if (!is_array($incoming)) $incoming = [];
    if (!is_array($existing)) $existing = [];
    $out = $existing;
    foreach ($incoming as $id => $val) {
        if (!is_array($val)) {
            if ($val !== '' && $val !== null) $out[$id] = $val;
            continue;
        }
        if (!isset($out[$id]) || !is_array($out[$id])) {
            $out[$id] = $val;
            continue;
        }
        $merged = array_merge($out[$id], $val);
        foreach ($out[$id] as $fk => $fv) {
            if (($merged[$fk] ?? '') === '' && $fv !== '' && $fv !== null) {
                $merged[$fk] = $fv;
            }
        }
        $out[$id] = $merged;
    }
    return $out;
}

/** Envio parcial do navegador não apaga igrejas — exceto com replace explícito. */
function mergeIgrejasStoreOnSave(PDO $pdo, $tenantId, $key, $encoded, $replace = false) {
    if ($replace) return $encoded;
    $arrayKeys = ['igrejas_custom' => true];
    $objectKeys = [
        'igrejas_enrich' => true,
        'geo_coords_igrejas' => true,
        'pastores_igrejas' => true,
        'igrejas_overrides' => true,
    ];
    if (!isset($arrayKeys[$key]) && !isset($objectKeys[$key])) return $encoded;

    $incoming = json_decode((string)$encoded, true);
    $existing = storeGetJson($pdo, $tenantId, $key);

    if (isset($arrayKeys[$key])) {
        if (!is_array($incoming) || count($incoming) === 0) return $encoded;
        if (!is_array($existing) || count($existing) === 0) return $encoded;
        if (count($incoming) >= count($existing)) return $encoded;

        $map = [];
        foreach ($existing as $ig) {
            if (isset($ig['id'])) $map[(string)$ig['id']] = $ig;
        }
        foreach ($incoming as $ig) {
            if (!isset($ig['id'])) continue;
            $id = (string)$ig['id'];
            if (!isset($map[$id])) {
                $map[$id] = $ig;
                continue;
            }
            $merged = array_merge($map[$id], $ig);
            foreach ($map[$id] as $fk => $fv) {
                if (($merged[$fk] ?? '') === '' && $fv !== '' && $fv !== null) {
                    $merged[$fk] = $fv;
                }
            }
            $map[$id] = $merged;
        }
        return json_encode(array_values($map), JSON_UNESCAPED_UNICODE);
    }

    if (!is_array($incoming) || count($incoming) === 0) return $encoded;
    if (!is_array($existing) || count($existing) === 0) return $encoded;
    if (count($incoming) >= count($existing)) return $encoded;

    $out = $existing;
    foreach ($incoming as $id => $val) {
        if (!is_array($val)) {
            if ($val !== '' && $val !== null) $out[$id] = $val;
            continue;
        }
        if (!isset($out[$id]) || !is_array($out[$id])) {
            $out[$id] = $val;
            continue;
        }
        $merged = array_merge($out[$id], $val);
        foreach ($out[$id] as $fk => $fv) {
            if (($merged[$fk] ?? '') === '' && $fv !== '' && $fv !== null) {
                $merged[$fk] = $fv;
            }
        }
        $out[$id] = $merged;
    }
    return json_encode($out, JSON_UNESCAPED_UNICODE);
}

function storeGetJson(PDO $pdo, $tenantId, $key) {
    $stmt = $pdo->prepare('SELECT `value` FROM store WHERE tenant_id = ? AND `key` = ? LIMIT 1');
    $stmt->execute([$tenantId, $key]);
    $raw = $stmt->fetchColumn();
    if ($raw === false || $raw === null || $raw === '') return null;
    $decoded = json_decode((string)$raw, true);
    return $decoded;
}

function parseShareId($raw, $minLen = 6, PDO $pdo = null, array $legacyKeyPrefixes = null) {
    $shareId = trim((string)$raw);
    $minLen = max(1, (int)$minLen);
    if ($shareId === '' || strlen($shareId) > 40) return null;
    if (!preg_match('/^[a-zA-Z0-9_-]+$/', $shareId)) return null;
    if (strlen($shareId) >= $minLen) return $shareId;
    if ($pdo && is_array($legacyKeyPrefixes) && shareIdExistsInStore($pdo, $shareId, $legacyKeyPrefixes)) {
        return $shareId;
    }
    return null;
}

function shareIdExistsInStore(PDO $pdo, $shareId, array $prefixes) {
    foreach ($prefixes as $prefix) {
        $key = (string)$prefix.$shareId;
        $stmt = $pdo->prepare('SELECT 1 FROM store WHERE `key` = ? LIMIT 1');
        $stmt->execute([$key]);
        if ($stmt->fetchColumn()) return true;
    }
    return false;
}

function rotaShareRecord(PDO $pdo, $shareId) {
    $key = 'rota_share_'.$shareId;
    $stmt = $pdo->prepare('SELECT `value`, tenant_id, updated_at FROM store WHERE `key` = ? ORDER BY updated_at DESC LIMIT 1');
    $stmt->execute([$key]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) return null;
    $share = json_decode($row['value'], true);
    if (!is_array($share)) return null;
    return ['share' => $share, 'tenant_id' => $row['tenant_id'], 'updated_at' => $row['updated_at']];
}

function rotaShareAccessAllowed(array $share) {
    if (!empty($share['encerrada'])) return false;
    $exp = $share['expiraEm'] ?? $share['validoAte'] ?? null;
    if ($exp) {
        $t = strtotime((string)$exp);
        if ($t !== false && $t < time()) return false;
    }
    return true;
}

/** Encerra com 410 se link expirado ou rota encerrada. */
function assertRotaShareAtivo(PDO $pdo, $shareId) {
    $rec = rotaShareRecord($pdo, $shareId);
    if (!$rec || !rotaShareAccessAllowed($rec['share'])) {
        http_response_code(410);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Link de rota expirado ou encerrado.', 'expired' => true], JSON_UNESCAPED_UNICODE);
        exit;
    }
    return $rec;
}

function tenantStoreSyncToken(PDO $pdo, $tenantId) {
    $stmt = $pdo->prepare('SELECT MAX(updated_at) AS mx, COUNT(*) AS n FROM store WHERE tenant_id = ?');
    $stmt->execute([$tenantId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC) ?: [];
    $mx = (string)($row['mx'] ?? '');
    $n = (int)($row['n'] ?? 0);
    return md5($tenantId.'|'.$mx.'|'.$n);
}

function storeKeyUpdatedAt(PDO $pdo, $tenantId, $key) {
    $stmt = $pdo->prepare('SELECT updated_at FROM store WHERE tenant_id = ? AND `key` = ? LIMIT 1');
    $stmt->execute([$tenantId, $key]);
    $v = $stmt->fetchColumn();
    return $v ? (string)$v : null;
}

function storeWriteAllowed(PDO $pdo, $tenantId, $key, $expectedUpdated, $replace = false) {
    if ($replace) return true;
    if (!is_array($expectedUpdated) || !isset($expectedUpdated[$key])) return true;
    $exp = trim((string)$expectedUpdated[$key]);
    if ($exp === '') return true;
    $cur = storeKeyUpdatedAt($pdo, $tenantId, $key);
    if ($cur === null || $cur === '') return true;
    $curTs = strtotime($cur);
    $expTs = strtotime($exp);
    if ($curTs === false || $expTs === false) return true;
    return $curTs <= $expTs + 1;
}

function clientIpAddress() {
    $ip = trim((string)($_SERVER['REMOTE_ADDR'] ?? ''));
    if ($ip === '') $ip = '0.0.0.0';
    if (filter_var($ip, FILTER_VALIDATE_IP)) return $ip;
    return '0.0.0.0';
}

function rateLimitCacheDir() {
    static $dir = null;
    if ($dir !== null) return $dir;
    $dir = __DIR__.'/rate_limit_cache';
    if (!is_dir($dir) && !@mkdir($dir, 0750, true) && !is_dir($dir)) {
        $dir = sys_get_temp_dir();
    }
    return $dir;
}

function maybeGcRateLimitCache() {
    if (random_int(1, 100) !== 1) return;
    $dir = rateLimitCacheDir();
    $cutoff = time() - 7200;
    foreach (glob($dir.'/*.json') ?: [] as $file) {
        if (!is_file($file)) continue;
        $mtime = @filemtime($file);
        if ($mtime !== false && $mtime < $cutoff) @unlink($file);
    }
}

/** Limite por IP (janela deslizante de 60s). Retorna 429 e encerra se exceder. */
function enforceRateLimit($bucket, $maxPerMinute) {
    $maxPerMinute = max(1, (int)$maxPerMinute);
    maybeGcRateLimitCache();
    $bucket = preg_replace('/[^a-zA-Z0-9_-]/', '_', (string)$bucket);
    if ($bucket === '') $bucket = 'default';
    $file = rateLimitCacheDir().'/'.$bucket.'_'.hash('sha256', clientIpAddress()).'.json';
    $now = time();
    $windowSec = 60;
    $hits = [];
    $fp = @fopen($file, 'c+');
    if ($fp) {
        if (@flock($fp, LOCK_EX)) {
            $raw = stream_get_contents($fp);
            $decoded = is_string($raw) && $raw !== '' ? json_decode($raw, true) : null;
            if (is_array($decoded) && isset($decoded['hits']) && is_array($decoded['hits'])) {
                $hits = $decoded['hits'];
            }
            $hits = array_values(array_filter($hits, function ($t) use ($now, $windowSec) {
                return ($now - (int)$t) < $windowSec;
            }));
            if (count($hits) >= $maxPerMinute) {
                @flock($fp, LOCK_UN);
                @fclose($fp);
                http_response_code(429);
                echo json_encode(['error' => 'Rate limit exceeded']);
                exit;
            }
            $hits[] = $now;
            ftruncate($fp, 0);
            rewind($fp);
            fwrite($fp, json_encode(['hits' => $hits]));
            fflush($fp);
            @flock($fp, LOCK_UN);
        }
        @fclose($fp);
        return;
    }
    // Fallback sem lock de arquivo
    if (is_file($file)) {
        $decoded = json_decode((string)@file_get_contents($file), true);
        if (is_array($decoded['hits'] ?? null)) {
            $hits = array_values(array_filter($decoded['hits'], function ($t) use ($now, $windowSec) {
                return ($now - (int)$t) < $windowSec;
            }));
        }
    }
    if (count($hits) >= $maxPerMinute) {
        http_response_code(429);
        echo json_encode(['error' => 'Rate limit exceeded']);
        exit;
    }
    $hits[] = $now;
    @file_put_contents($file, json_encode(['hits' => $hits]), LOCK_EX);
}

function validateExternalHttpUrl($url) {
    $url = trim((string)$url);
    if ($url === '' || !filter_var($url, FILTER_VALIDATE_URL)) return false;
    $scheme = strtolower((string)parse_url($url, PHP_URL_SCHEME));
    if (!in_array($scheme, ['http', 'https'], true)) return false;
    $host = parse_url($url, PHP_URL_HOST);
    if (!$host || !is_string($host)) return false;
    $host = strtolower($host);
    if ($host === 'localhost' || str_ends_with($host, '.local') || str_ends_with($host, '.internal')) {
        return false;
    }
    if (!preg_match('/\.[a-z]{2,63}$/i', $host)) return false;
    return hostResolvesToPublicIp($host);
}

function hostResolvesToPublicIp($host) {
    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ips[] = $host;
    } else {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA);
        if (is_array($records)) {
            foreach ($records as $rec) {
                if (!empty($rec['ip'])) $ips[] = $rec['ip'];
                if (!empty($rec['ipv6'])) $ips[] = $rec['ipv6'];
            }
        }
        if (!$ips) {
            $a = @gethostbyname($host);
            if ($a && $a !== $host) $ips[] = $a;
        }
    }
    if (!$ips) return false;
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return false;
        }
    }
    return true;
}

function memberCanViewFinance(PDO $pdo, $tenantId, $email, $role) {
    if ($role === 'owner') return true;
    $stmt = $pdo->prepare('SELECT can_view_finance FROM tenant_members WHERE tenant_id = ? AND email = ? LIMIT 1');
    $stmt->execute([$tenantId, strtolower($email)]);
    $raw = $stmt->fetchColumn();
    return (bool)normalizeCanViewFinance($raw);
}

function storeMemberRestrictedPrefixes($canViewFinance) {
    $prefixes = ['pesquisas_', 'equipe_contratos'];
    if (!$canViewFinance) {
        $prefixes[] = 'tesouraria';
    }
    return $prefixes;
}

function memberCanAccessStoreKey($key, $role, $canViewFinance) {
    if ($role === 'owner') return true;
    $key = (string)$key;
    foreach (storeMemberRestrictedPrefixes($canViewFinance) as $prefix) {
        if (strncmp($key, $prefix, strlen($prefix)) === 0) return false;
    }
    return true;
}

function filterStoreKeysForMember(array $keys, $role, $canViewFinance) {
    if ($role === 'owner') return $keys;
    return array_values(array_filter($keys, function ($key) use ($role, $canViewFinance) {
        return memberCanAccessStoreKey($key, $role, $canViewFinance);
    }));
}

function filterStoreRowsForMember(array $rows, $role, $canViewFinance) {
    if ($role === 'owner') return $rows;
    return array_values(array_filter($rows, function ($row) use ($role, $canViewFinance) {
        $key = is_array($row) ? ($row['key'] ?? '') : '';
        return memberCanAccessStoreKey($key, $role, $canViewFinance);
    }));
}

function apoiadorItemTime($item) {
    if (!is_array($item)) return 0;
    $raw = $item['atualizadoEm'] ?? $item['criadoEm'] ?? '';
    if ($raw === '') return 0;
    $t = strtotime((string)$raw);
    return $t !== false ? $t : 0;
}

function mergeApoiadoresListsPhp($incoming, $existing, $removedSet) {
    if (!is_array($incoming)) $incoming = [];
    if (!is_array($existing)) $existing = [];
    $map = [];

    $findKey = function ($item) use (&$map) {
        if (!is_array($item)) return null;
        $id = isset($item['id']) ? (string)$item['id'] : '';
        $tel = $item['telefone'] ?? '';
        foreach ($map as $k => $v) {
            if ($id !== '' && isset($v['id']) && (string)$v['id'] === $id) return $k;
            if (leadPhonesMatch($v['telefone'] ?? '', $tel)) return $k;
        }
        if ($id !== '') return 'id:'.$id;
        $dig = leadPhoneDigits($tel);
        if (strlen($dig) >= 8) return 'tel:'.substr($dig, -9);
        return null;
    };

    $prefer = function ($a, $b) {
        $ta = apoiadorItemTime($a);
        $tb = apoiadorItemTime($b);
        $newer = $ta >= $tb ? $a : $b;
        $older = $newer === $a ? $b : $a;
        $origem = $newer['origem'] ?? $older['origem'] ?? null;
        if (($a['origem'] ?? '') === 'cadastro_publico' || ($b['origem'] ?? '') === 'cadastro_publico') {
            $origem = 'cadastro_publico';
        }
        $out = array_merge($older, $newer);
        $out['id'] = $older['id'] ?? $newer['id'] ?? null;
        if ($origem) $out['origem'] = $origem;
        if (empty($newer['interesses']) && !empty($older['interesses'])) $out['interesses'] = $older['interesses'];
        if (empty($newer['extras']) && !empty($older['extras'])) $out['extras'] = $older['extras'];
        if (($newer['observacao'] ?? '') === '' && ($older['observacao'] ?? '') !== '') {
            $out['observacao'] = $older['observacao'];
        }
        $out['criadoEm'] = $older['criadoEm'] ?? $newer['criadoEm'] ?? null;
        $out['atualizadoEm'] = $newer['atualizadoEm'] ?? $older['atualizadoEm'] ?? null;
        return $out;
    };

    $add = function ($item) use (&$map, $findKey, $prefer, $removedSet) {
        if (!is_array($item)) return;
        $id = isset($item['id']) ? (string)$item['id'] : '';
        if ($id !== '' && isset($removedSet[$id])) return;
        $dig = leadPhoneDigits($item['telefone'] ?? '');
        if (strlen($dig) >= 8 && isset($removedSet['tel:'.substr($dig, -9)])) return;
        $k = $findKey($item);
        if ($k === null) return;
        if (isset($map[$k])) $map[$k] = $prefer($map[$k], $item);
        else $map[$k] = $item;
    };

    foreach ($incoming as $item) $add($item);
    foreach ($existing as $item) $add($item);

    $out = array_values($map);
    usort($out, function ($a, $b) {
        return apoiadorItemTime($b) - apoiadorItemTime($a);
    });
    return $out;
}

function membroEquipeTime($item) {
    if (!is_array($item)) return 0;
    $raw = $item['atualizadoEm'] ?? $item['criadoEm'] ?? '';
    if ($raw === '') return 0;
    $t = strtotime((string)$raw);
    return $t !== false ? $t : 0;
}

function mergeEquipeMembrosPhp($incoming, $existing, $removedSet) {
    if (!is_array($incoming)) $incoming = [];
    if (!is_array($existing)) $existing = [];
    $map = [];

    $prefer = function ($a, $b) {
        $ta = membroEquipeTime($a);
        $tb = membroEquipeTime($b);
        $newer = $ta >= $tb ? $a : $b;
        $older = $newer === $a ? $b : $a;
        $out = array_merge($older, $newer);
        $out['id'] = $older['id'] ?? $newer['id'] ?? null;
        $out['criadoEm'] = $older['criadoEm'] ?? $newer['criadoEm'] ?? null;
        $out['atualizadoEm'] = $newer['atualizadoEm'] ?? $older['atualizadoEm'] ?? null;
        return $out;
    };

    $add = function ($item) use (&$map, $removedSet, $prefer) {
        if (!is_array($item)) return;
        $id = isset($item['id']) ? (string)$item['id'] : '';
        if ($id === '' || isset($removedSet[$id])) return;
        if (!isset($map[$id])) {
            $map[$id] = $item;
            return;
        }
        $map[$id] = $prefer($map[$id], $item);
    };

    foreach ($incoming as $item) $add($item);
    foreach ($existing as $item) $add($item);

    $out = array_values($map);
    usort($out, function ($a, $b) {
        $na = strcmp((string)($a['nome'] ?? ''), (string)($b['nome'] ?? ''));
        return $na !== 0 ? $na : (membroEquipeTime($b) - membroEquipeTime($a));
    });
    return $out;
}

function rotaLogisticaTime($item) {
    if (!is_array($item)) return 0;
    $raw = $item['atualizadoEm'] ?? $item['criadoEm'] ?? '';
    $t = strtotime((string)$raw);
    return $t !== false ? $t : 0;
}

function mergeRotasLogisticaPhp($incoming, $existing, $removedSet) {
    if (!is_array($incoming)) $incoming = [];
    if (!is_array($existing)) $existing = [];
    $map = [];

    $mergeItem = function ($prev, $item) {
        $newerFirst = rotaLogisticaTime($item) >= rotaLogisticaTime($prev);
        $base = $newerFirst ? array_merge($prev, $item) : array_merge($item, $prev);
        $pPrev = is_array($prev['paradas'] ?? null) ? count($prev['paradas']) : 0;
        $pItem = is_array($item['paradas'] ?? null) ? count($item['paradas']) : 0;
        if ($newerFirst) {
            if ($pPrev > $pItem && rotaLogisticaTime($item) - rotaLogisticaTime($prev) < 2) {
                $base['paradas'] = $prev['paradas'];
            } else {
                $base['paradas'] = is_array($item['paradas'] ?? null) ? $item['paradas'] : ($prev['paradas'] ?? []);
            }
        } else {
            $base['paradas'] = is_array($prev['paradas'] ?? null) ? $prev['paradas'] : ($item['paradas'] ?? []);
        }
        $base['id'] = $prev['id'] ?? $item['id'] ?? null;
        return $base;
    };

    $add = function ($item) use (&$map, $removedSet, $mergeItem) {
        if (!is_array($item)) return;
        $id = isset($item['id']) ? (string)$item['id'] : '';
        if ($id === '' || isset($removedSet[$id])) return;
        if (!isset($map[$id])) {
            $map[$id] = $item;
            return;
        }
        $map[$id] = $mergeItem($map[$id], $item);
    };

    foreach ($existing as $item) $add($item);
    foreach ($incoming as $item) $add($item);

    $out = array_values($map);
    usort($out, function ($a, $b) {
        return rotaLogisticaTime($b) - rotaLogisticaTime($a);
    });
    return $out;
}

function mergeRotasDiariasPhp($incoming, $existing, $removedSet) {
    if (!is_array($incoming)) $incoming = [];
    if (!is_array($existing)) $existing = [];
    $map = [];

    $mergeIgrejas = function ($prev, $item) {
        $pArr = is_array($prev) ? $prev : [];
        $iArr = is_array($item) ? $item : [];
        $byId = [];
        foreach ($pArr as $p) {
            if (!is_array($p)) continue;
            $id = isset($p['igrejaId']) ? (string)$p['igrejaId'] : '';
            if ($id !== '') $byId[$id] = $p;
        }
        foreach ($iArr as $p) {
            if (!is_array($p)) continue;
            $id = isset($p['igrejaId']) ? (string)$p['igrejaId'] : '';
            if ($id === '') continue;
            if (!isset($byId[$id])) {
                $byId[$id] = $p;
                continue;
            }
            $rank = function ($s) {
                if ($s === 'concluido') return 3;
                if ($s === 'em_transito') return 2;
                return 1;
            };
            $old = $byId[$id];
            $stOld = $old['status'] ?? 'pendente';
            $stNew = $p['status'] ?? 'pendente';
            if ($rank($stNew) >= $rank($stOld)) {
                $byId[$id] = array_merge($old, $p);
            } else {
                $byId[$id] = array_merge($p, $old);
            }
        }
        $out = array_values($byId);
        usort($out, function ($a, $b) {
            return ((int)($a['ordem'] ?? 0)) - ((int)($b['ordem'] ?? 0));
        });
        return $out;
    };

    $mergeItem = function ($prev, $item) use ($mergeIgrejas) {
        $newerFirst = rotaLogisticaTime($item) >= rotaLogisticaTime($prev);
        $base = $newerFirst ? array_merge($prev, $item) : array_merge($item, $prev);
        $base['igrejas'] = $mergeIgrejas($prev['igrejas'] ?? [], $item['igrejas'] ?? []);
        $base['id'] = $prev['id'] ?? $item['id'] ?? null;
        return $base;
    };

    $add = function ($item) use (&$map, $removedSet, $mergeItem) {
        if (!is_array($item)) return;
        $id = isset($item['id']) ? (string)$item['id'] : '';
        if ($id === '' || isset($removedSet[$id])) return;
        if (!isset($map[$id])) {
            $map[$id] = $item;
            return;
        }
        $map[$id] = $mergeItem($map[$id], $item);
    };

    foreach ($existing as $item) $add($item);
    foreach ($incoming as $item) $add($item);

    $out = array_values($map);
    usort($out, function ($a, $b) {
        return rotaLogisticaTime($b) - rotaLogisticaTime($a);
    });
    return $out;
}

/** Ao gravar apoiadores_lista, une com o que já está no servidor (protege leads do formulário). */
function encodeStoreValue(PDO $pdo, $tenantId, $key, $val, $replace = false) {
    if ($key === 'equipe_removidos') {
        $incoming = is_array($val) ? $val : (is_string($val) ? json_decode($val, true) : []);
        if (!is_array($incoming)) $incoming = [];
        $existing = storeGetJson($pdo, $tenantId, 'equipe_removidos');
        if (!is_array($existing)) $existing = [];
        $set = [];
        foreach (array_merge($existing, $incoming) as $id) {
            if ($id === null || $id === '') continue;
            $set[(string)$id] = true;
        }
        return json_encode(array_keys($set), JSON_UNESCAPED_UNICODE);
    }

    if ($key === 'apoiadores_removidos') {
        $incoming = is_array($val) ? $val : (is_string($val) ? json_decode($val, true) : []);
        if (!is_array($incoming)) $incoming = [];
        $existing = storeGetJson($pdo, $tenantId, 'apoiadores_removidos');
        if (!is_array($existing)) $existing = [];
        $set = [];
        foreach (array_merge($existing, $incoming) as $id) {
            if ($id === null || $id === '') continue;
            $set[(string)$id] = true;
        }
        return json_encode(array_keys($set), JSON_UNESCAPED_UNICODE);
    }

    if ($key === 'apoiadores_lista') {
        $incoming = $val;
        if (is_string($val)) $incoming = json_decode($val, true);
        if (!is_array($incoming)) $incoming = [];
        $existing = storeGetJson($pdo, $tenantId, 'apoiadores_lista');
        if (!is_array($existing)) $existing = [];
        $removed = storeGetJson($pdo, $tenantId, 'apoiadores_removidos');
        $removedSet = [];
        if (is_array($removed)) {
            foreach ($removed as $id) $removedSet[(string)$id] = true;
        }
        $merged = mergeApoiadoresListsPhp($incoming, $existing, $removedSet);
        // Filtro final — garante que nada marcado como removido volte
        $merged = array_values(array_filter($merged, function ($item) use ($removedSet) {
            if (!is_array($item)) return false;
            $id = isset($item['id']) ? (string)$item['id'] : '';
            if ($id !== '' && isset($removedSet[$id])) return false;
            $dig = leadPhoneDigits($item['telefone'] ?? '');
            if (strlen($dig) >= 8) {
                $telKey = 'tel:'.substr($dig, -9);
                if (isset($removedSet[$telKey])) return false;
            }
            return true;
        }));
        return json_encode($merged, JSON_UNESCAPED_UNICODE);
    }

    if ($key === 'equipe_membros') {
        $incoming = $val;
        if (is_string($val)) $incoming = json_decode($val, true);
        if (!is_array($incoming)) $incoming = [];
        $removed = storeGetJson($pdo, $tenantId, 'equipe_removidos');
        $removedSet = [];
        if (is_array($removed)) {
            foreach ($removed as $id) $removedSet[(string)$id] = true;
        }
        if ($replace) {
            $incoming = array_values(array_filter($incoming, function ($m) use ($removedSet) {
                if (!is_array($m)) return false;
                $id = isset($m['id']) ? (string)$m['id'] : '';
                return $id !== '' && !isset($removedSet[$id]);
            }));
            return json_encode($incoming, JSON_UNESCAPED_UNICODE);
        }
        $existing = storeGetJson($pdo, $tenantId, 'equipe_membros');
        if (!is_array($existing)) $existing = [];
        $merged = mergeEquipeMembrosPhp($incoming, $existing, $removedSet);
        return json_encode($merged, JSON_UNESCAPED_UNICODE);
    }

    if ($key === 'rotas_logistica') {
        $incoming = $val;
        if (is_string($val)) $incoming = json_decode($val, true);
        if (!is_array($incoming)) $incoming = [];
        if ($replace) {
            return json_encode($incoming, JSON_UNESCAPED_UNICODE);
        }
        if (count($incoming) === 0) {
            $existing = storeGetJson($pdo, $tenantId, 'rotas_logistica');
            if (is_array($existing) && count($existing) > 0) {
                return json_encode($existing, JSON_UNESCAPED_UNICODE);
            }
            return json_encode([], JSON_UNESCAPED_UNICODE);
        }
        $existing = storeGetJson($pdo, $tenantId, 'rotas_logistica');
        if (!is_array($existing)) $existing = [];
        $removed = storeGetJson($pdo, $tenantId, 'rotas_logistica_removidos');
        $removedSet = [];
        if (is_array($removed)) {
            foreach ($removed as $id) $removedSet[(string)$id] = true;
        }
        $merged = mergeRotasLogisticaPhp($incoming, $existing, $removedSet);
        return json_encode($merged, JSON_UNESCAPED_UNICODE);
    }

    if ($key === 'rotas_diarias') {
        $incoming = $val;
        if (is_string($val)) $incoming = json_decode($val, true);
        if (!is_array($incoming)) $incoming = [];
        if ($replace) {
            return json_encode($incoming, JSON_UNESCAPED_UNICODE);
        }
        if (count($incoming) === 0) {
            $existing = storeGetJson($pdo, $tenantId, 'rotas_diarias');
            if (is_array($existing) && count($existing) > 0) {
                return json_encode($existing, JSON_UNESCAPED_UNICODE);
            }
            return json_encode([], JSON_UNESCAPED_UNICODE);
        }
        $existing = storeGetJson($pdo, $tenantId, 'rotas_diarias');
        if (!is_array($existing)) $existing = [];
        $removed = storeGetJson($pdo, $tenantId, 'rotas_diarias_removidos');
        $removedSet = [];
        if (is_array($removed)) {
            foreach ($removed as $id) $removedSet[(string)$id] = true;
        }
        $merged = mergeRotasDiariasPhp($incoming, $existing, $removedSet);
        return json_encode($merged, JSON_UNESCAPED_UNICODE);
    }

    if ($key === 'rotas_diarias_removidos') {
        $incoming = is_array($val) ? $val : (is_string($val) ? json_decode($val, true) : []);
        if (!is_array($incoming)) $incoming = [];
        $existing = storeGetJson($pdo, $tenantId, 'rotas_diarias_removidos');
        if (!is_array($existing)) $existing = [];
        $set = [];
        foreach (array_merge($existing, $incoming) as $id) {
            if ($id === null || $id === '') continue;
            $set[(string)$id] = true;
        }
        return json_encode(array_keys($set), JSON_UNESCAPED_UNICODE);
    }

    if ($key === 'rotas_logistica_removidos') {
        $incoming = is_array($val) ? $val : (is_string($val) ? json_decode($val, true) : []);
        if (!is_array($incoming)) $incoming = [];
        $existing = storeGetJson($pdo, $tenantId, 'rotas_logistica_removidos');
        if (!is_array($existing)) $existing = [];
        $set = [];
        foreach (array_merge($existing, $incoming) as $id) {
            if ($id === null || $id === '') continue;
            $set[(string)$id] = true;
        }
        return json_encode(array_keys($set), JSON_UNESCAPED_UNICODE);
    }

    if ($key === 'materiais_removidos' || $key === 'materiais_distribuicao_removidos' || $key === 'materiais_retiradas_removidos') {
        $incoming = is_array($val) ? $val : (is_string($val) ? json_decode($val, true) : []);
        if (!is_array($incoming)) $incoming = [];
        if ($replace) {
            return json_encode(array_values(array_unique(array_map('strval', $incoming))), JSON_UNESCAPED_UNICODE);
        }
        $existing = storeGetJson($pdo, $tenantId, $key);
        if (!is_array($existing)) $existing = [];
        $set = [];
        foreach (array_merge($existing, $incoming) as $id) {
            if ($id === null || $id === '') continue;
            $set[(string)$id] = true;
        }
        return json_encode(array_keys($set), JSON_UNESCAPED_UNICODE);
    }

    if ($key === 'materiais_distribuicao' || $key === 'materiais_retiradas' || $key === 'materiais_entradas') {
        $incoming = $val;
        if (is_string($val)) $incoming = json_decode($val, true);
        if (!is_array($incoming)) $incoming = [];
        if ($replace) {
            return json_encode($incoming, JSON_UNESCAPED_UNICODE);
        }
        // Lista vazia não apaga o histórico no servidor (exceto _replace explícito)
        if (count($incoming) === 0) {
            $existing = storeGetJson($pdo, $tenantId, $key);
            if (is_array($existing) && count($existing) > 0) {
                return json_encode($existing, JSON_UNESCAPED_UNICODE);
            }
            return json_encode([], JSON_UNESCAPED_UNICODE);
        }
        $existing = storeGetJson($pdo, $tenantId, $key);
        if (!is_array($existing)) $existing = [];
        $map = [];
        foreach (array_merge($existing, $incoming) as $item) {
            if (!is_array($item)) continue;
            $id = isset($item['id']) ? (string)$item['id'] : '';
            if ($id === '') continue;
            if (!isset($map[$id])) {
                $map[$id] = $item;
                continue;
            }
            $prev = $map[$id];
            $tPrev = strtotime($prev['data'] ?? $prev['criadoEm'] ?? '') ?: 0;
            $tNew = strtotime($item['data'] ?? $item['criadoEm'] ?? '') ?: 0;
            $map[$id] = $tNew >= $tPrev ? array_merge($prev, $item) : array_merge($item, $prev);
        }
        $out = array_values($map);
        usort($out, function ($a, $b) {
            $tb = strtotime($b['data'] ?? $b['criadoEm'] ?? '') ?: 0;
            $ta = strtotime($a['data'] ?? $a['criadoEm'] ?? '') ?: 0;
            return $tb <=> $ta;
        });
        return json_encode($out, JSON_UNESCAPED_UNICODE);
    }

    if (is_string($val)) {
        // Já é JSON cru do body
        $trim = trim($val);
        if ($trim !== '' && ($trim[0] === '{' || $trim[0] === '[' || $trim === 'null' || $trim === 'true' || $trim === 'false' || is_numeric($trim))) {
            return $val;
        }
        return json_encode($val, JSON_UNESCAPED_UNICODE);
    }
    return json_encode($val, JSON_UNESCAPED_UNICODE);
}

function leadAllowSubmit(PDO $pdo, $token, $ip, $phoneDigits) {
    $stmt = $pdo->prepare(
        'SELECT COUNT(*) FROM lead_submits
         WHERE phone_digits = ? AND created_at > (NOW() - INTERVAL 45 SECOND)'
    );
    $stmt->execute([$phoneDigits]);
    if ((int)$stmt->fetchColumn() > 0) return false;

    if ($ip !== '') {
        $stmt = $pdo->prepare(
            'SELECT COUNT(*) FROM lead_submits
             WHERE token = ? AND ip = ? AND created_at > (NOW() - INTERVAL 1 HOUR)'
        );
        $stmt->execute([$token, $ip]);
        if ((int)$stmt->fetchColumn() >= 30) return false;
    }
    return true;
}

function leadLogSubmit(PDO $pdo, $token, $ip, $phoneDigits) {
    $stmt = $pdo->prepare('INSERT INTO lead_submits (token, ip, phone_digits) VALUES (?, ?, ?)');
    $stmt->execute([$token, $ip !== '' ? $ip : null, $phoneDigits]);
}

/** Conta abertura do formulário (1x por IP a cada 30 min). */
function leadBumpView(PDO $pdo, $token, $tenantId) {
    $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
    try {
        if ($ip !== '') {
            $chk = $pdo->prepare(
                'SELECT id FROM lead_views
                 WHERE token = ? AND ip = ? AND created_at > (NOW() - INTERVAL 30 MINUTE)
                 LIMIT 1'
            );
            $chk->execute([$token, $ip]);
            if ($chk->fetchColumn()) return;
        }
        $ins = $pdo->prepare('INSERT INTO lead_views (token, tenant_id, ip) VALUES (?, ?, ?)');
        $ins->execute([$token, $tenantId, $ip !== '' ? $ip : null]);
    } catch (Exception $e) { /* ignore */ }
}

/** Conta clique no canal WhatsApp (1x por IP a cada 10 min). */
function leadBumpCanalClick(PDO $pdo, $token, $tenantId) {
    $ip = substr((string)($_SERVER['REMOTE_ADDR'] ?? ''), 0, 64);
    try {
        if ($ip !== '') {
            $chk = $pdo->prepare(
                'SELECT id FROM lead_canal_clicks
                 WHERE token = ? AND ip = ? AND created_at > (NOW() - INTERVAL 10 MINUTE)
                 LIMIT 1'
            );
            $chk->execute([$token, $ip]);
            if ($chk->fetchColumn()) return;
        }
        $ins = $pdo->prepare('INSERT INTO lead_canal_clicks (token, tenant_id, ip) VALUES (?, ?, ?)');
        $ins->execute([$token, $tenantId, $ip !== '' ? $ip : null]);
    } catch (Exception $e) { /* ignore */ }
}

function leadCountSince(PDO $pdo, $table, $token, $hours = null) {
    if ($hours === null) {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM {$table} WHERE token = ?");
        $stmt->execute([$token]);
    } else {
        $h = max(1, (int)$hours);
        $stmt = $pdo->prepare(
            "SELECT COUNT(*) FROM {$table}
             WHERE token = ? AND created_at > (NOW() - INTERVAL {$h} HOUR)"
        );
        $stmt->execute([$token]);
    }
    return (int)$stmt->fetchColumn();
}

/** Contagem por dia (últimos N dias, chave Y-m-d). */
function leadDailyCounts(PDO $pdo, $table, $token, $days = 30) {
    $days = max(1, min(90, (int)$days));
    $out = [];
    try {
        $stmt = $pdo->prepare(
            "SELECT DATE(created_at) AS dia, COUNT(*) AS qtd
             FROM {$table}
             WHERE token = ? AND created_at >= (CURDATE() - INTERVAL ".($days - 1)." DAY)
             GROUP BY DATE(created_at)
             ORDER BY dia ASC"
        );
        $stmt->execute([$token]);
        foreach ($stmt->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $out[(string)$row['dia']] = (int)$row['qtd'];
        }
    } catch (Exception $e) { /* ignore */ }
    return $out;
}

function leadPeriodBlock($views, $envios, $canal, $cadastros) {
    $conv = $views > 0 ? round(($cadastros / $views) * 100, 1) : null;
    $convCanal = $cadastros > 0 ? round(($canal / $cadastros) * 100, 1) : null;
    return [
        'views' => (int)$views,
        'envios' => (int)$envios,
        'canal' => (int)$canal,
        'cadastros' => (int)$cadastros,
        'conversaoPct' => $conv,
        'canalConversaoPct' => $convCanal,
    ];
}

/** Resumo para o painel admin do formulário público. */
function leadFormStats(PDO $pdo, $token, $tenantId) {
    $viewsTotal = 0;
    $viewsHoje = 0;
    $views7d = 0;
    $views30d = 0;
    $enviosTotal = 0;
    $enviosHoje = 0;
    $envios7d = 0;
    $envios30d = 0;
    $canalTotal = 0;
    $canalHoje = 0;
    $canal7d = 0;
    $canal30d = 0;
    $viewsByDay = [];
    $enviosByDay = [];
    $canalByDay = [];
    try {
        $viewsTotal = leadCountSince($pdo, 'lead_views', $token, null);
        $viewsHoje = leadCountSince($pdo, 'lead_views', $token, 24);
        $views7d = leadCountSince($pdo, 'lead_views', $token, 24 * 7);
        $views30d = leadCountSince($pdo, 'lead_views', $token, 24 * 30);
        $enviosTotal = leadCountSince($pdo, 'lead_submits', $token, null);
        $enviosHoje = leadCountSince($pdo, 'lead_submits', $token, 24);
        $envios7d = leadCountSince($pdo, 'lead_submits', $token, 24 * 7);
        $envios30d = leadCountSince($pdo, 'lead_submits', $token, 24 * 30);
        $canalTotal = leadCountSince($pdo, 'lead_canal_clicks', $token, null);
        $canalHoje = leadCountSince($pdo, 'lead_canal_clicks', $token, 24);
        $canal7d = leadCountSince($pdo, 'lead_canal_clicks', $token, 24 * 7);
        $canal30d = leadCountSince($pdo, 'lead_canal_clicks', $token, 24 * 30);
        $viewsByDay = leadDailyCounts($pdo, 'lead_views', $token, 30);
        $enviosByDay = leadDailyCounts($pdo, 'lead_submits', $token, 30);
        $canalByDay = leadDailyCounts($pdo, 'lead_canal_clicks', $token, 30);
    } catch (Exception $e) { /* tabelas podem não existir ainda */ }

    $cadastros = 0;
    $cadHoje = 0;
    $cad7d = 0;
    $cad30d = 0;
    $cadByDay = [];
    try {
        $lista = storeGetJson($pdo, $tenantId, 'apoiadores_lista');
        if (!is_array($lista)) $lista = [];
        $hojeIni = strtotime('today');
        $seteIni = time() - (7 * 86400);
        $trintaIni = time() - (30 * 86400);
        $serieIni = strtotime(date('Y-m-d', strtotime('-29 days')));
        foreach ($lista as $a) {
            if (!is_array($a)) continue;
            $origem = (string)($a['origem'] ?? '');
            $id = (string)($a['id'] ?? '');
            if ($origem !== 'cadastro_publico' && strpos($id, 'lead-') !== 0) continue;
            $cadastros++;
            $ts = strtotime((string)($a['criadoEm'] ?? $a['atualizadoEm'] ?? '')) ?: 0;
            if ($ts >= $hojeIni) $cadHoje++;
            if ($ts >= $seteIni) $cad7d++;
            if ($ts >= $trintaIni) $cad30d++;
            if ($ts >= $serieIni) {
                $dia = date('Y-m-d', $ts);
                if (!isset($cadByDay[$dia])) $cadByDay[$dia] = 0;
                $cadByDay[$dia]++;
            }
        }
    } catch (Exception $e) { /* ignore */ }

    $serie = [];
    for ($i = 29; $i >= 0; $i--) {
        $dia = date('Y-m-d', strtotime("-{$i} days"));
        $serie[] = [
            'dia' => $dia,
            'label' => date('d/m', strtotime($dia)),
            'views' => (int)($viewsByDay[$dia] ?? 0),
            'envios' => (int)($enviosByDay[$dia] ?? 0),
            'canal' => (int)($canalByDay[$dia] ?? 0),
            'cadastros' => (int)($cadByDay[$dia] ?? 0),
        ];
    }

    $conv = $viewsTotal > 0 ? round(($cadastros / $viewsTotal) * 100, 1) : null;
    $convCanal = $cadastros > 0 ? round(($canalTotal / $cadastros) * 100, 1) : null;

    return [
        'viewsTotal' => $viewsTotal,
        'viewsHoje' => $viewsHoje,
        'views7d' => $views7d,
        'views30d' => $views30d,
        'enviosTotal' => $enviosTotal,
        'enviosHoje' => $enviosHoje,
        'envios7d' => $envios7d,
        'envios30d' => $envios30d,
        'cadastros' => $cadastros,
        'cadastrosHoje' => $cadHoje,
        'cadastros7d' => $cad7d,
        'cadastros30d' => $cad30d,
        'conversaoPct' => $conv,
        'canalClicks' => $canalTotal,
        'canalClicksHoje' => $canalHoje,
        'canalClicks7d' => $canal7d,
        'canalClicks30d' => $canal30d,
        'canalConversaoPct' => $convCanal,
        'periodos' => [
            'hoje' => leadPeriodBlock($viewsHoje, $enviosHoje, $canalHoje, $cadHoje),
            '7d' => leadPeriodBlock($views7d, $envios7d, $canal7d, $cad7d),
            '30d' => leadPeriodBlock($views30d, $envios30d, $canal30d, $cad30d),
            'total' => leadPeriodBlock($viewsTotal, $enviosTotal, $canalTotal, $cadastros),
        ],
        'serie' => $serie,
    ];
}

/** Lê valor de extras do lead (string ou {label,value}). */
function leadExtraValue($extras, $id) {
    if (!is_array($extras) || !array_key_exists($id, $extras)) return '';
    $ex = $extras[$id];
    if (is_array($ex)) return trim((string)($ex['value'] ?? ''));
    return trim((string)$ex);
}

/** Normaliza data BR (DD/MM/AAAA) a partir de dígitos ou ISO. */
function leadNormalizeDataBr($raw) {
    $s = trim((string)$raw);
    if ($s === '') return '';
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) {
        return $m[3].'/'.$m[2].'/'.$m[1];
    }
    $d = preg_replace('/\D+/', '', $s);
    if (strlen($d) === 8) {
        return substr($d, 0, 2).'/'.substr($d, 2, 2).'/'.substr($d, 4, 4);
    }
    if (preg_match('/^\d{2}\/\d{2}\/\d{4}$/', $s)) return $s;
    return $s;
}

/**
 * Premissa da rede: cada apoiador/simpatizante do formulário
 * representa até 5 votos (casa / círculo próximo).
 */
function leadVotosEstimados() {
    return 5;
}

function upsertLeadApoiador(PDO $pdo, $tenantId, $data) {
    $key = 'apoiadores_lista';
    $stmt = $pdo->prepare('SELECT `value` FROM store WHERE tenant_id = ? AND `key` = ? LIMIT 1');
    $stmt->execute([$tenantId, $key]);
    $raw = $stmt->fetchColumn();
    $lista = [];
    if ($raw !== false && $raw !== null && $raw !== '') {
        $decoded = json_decode((string)$raw, true);
        if (is_array($decoded)) $lista = $decoded;
    }

    $interesses = $data['interesses'];
    $extrasIn = is_array($data['extras'] ?? null) ? $data['extras'] : [];

    // Campos estruturados (não vão para observação)
    $cidade = trim((string)($data['cidade'] ?? ''));
    $bairro = trim((string)($data['bairro'] ?? ''));
    $profissao = trim((string)($data['profissao'] ?? ''));
    $email = trim((string)($data['email'] ?? ''));
    $cep = trim((string)($data['cep'] ?? leadExtraValue($extrasIn, 'cep')));
    $logradouro = trim((string)($data['logradouro'] ?? leadExtraValue($extrasIn, 'logradouro')));
    $numero = trim((string)($data['numero'] ?? leadExtraValue($extrasIn, 'numero')));
    $complemento = trim((string)($data['complemento'] ?? leadExtraValue($extrasIn, 'complemento')));
    $cpf = trim((string)($data['cpf'] ?? leadExtraValue($extrasIn, 'cpf')));
    $dataNascimento = leadNormalizeDataBr(
        $data['data_nascimento'] ?? leadExtraValue($extrasIn, 'data_nascimento')
    );

    // Correção: às vezes a data caiu em "profissão" (só dígitos DDMMYYYY)
    $profDigits = preg_replace('/\D+/', '', $profissao);
    if ($dataNascimento === '' && strlen($profDigits) === 8 && !preg_match('/[a-zA-ZÀ-ú]/u', $profissao)) {
        $dataNascimento = leadNormalizeDataBr($profDigits);
        $profissao = '';
    }

    // Extras customizados restantes (sem campos já mapeados)
    $knownExtraIds = ['cep','logradouro','numero','complemento','cpf','data_nascimento','data_nascimento_iso'];
    $extras = [];
    foreach ($extrasIn as $cid => $ex) {
        if (in_array((string)$cid, $knownExtraIds, true)) continue;
        if (is_array($ex)) {
            $lab = trim((string)($ex['label'] ?? $cid));
            $val = trim((string)($ex['value'] ?? ''));
            if ($val === '') continue;
            $extras[$cid] = ['label' => $lab !== '' ? $lab : (string)$cid, 'value' => $val];
        } else {
            $val = trim((string)$ex);
            if ($val === '') continue;
            $extras[$cid] = ['label' => (string)$cid, 'value' => $val];
        }
    }

    $votosEstimados = leadVotosEstimados();
    $now = gmdate('c');

    $idx = null;
    foreach ($lista as $i => $a) {
        if (!is_array($a)) continue;
        if (leadPhonesMatch($a['telefone'] ?? '', $data['telefone_digits'])) {
            $idx = $i;
            break;
        }
    }

    $structured = [
        'nome' => $data['nome'],
        'telefone' => $data['telefone'],
        'email' => $email,
        'bairro' => $bairro !== '' ? $bairro : 'A definir',
        'cidade' => $cidade,
        'profissao' => $profissao,
        'dataNascimento' => $dataNascimento,
        'cep' => $cep,
        'logradouro' => $logradouro,
        'numero' => $numero,
        'complemento' => $complemento,
        'cpf' => $cpf,
        'interesses' => $interesses,
        'extras' => $extras,
        'votosEstimados' => $votosEstimados,
        'origem' => 'cadastro_publico',
        'lgpd' => true,
        'atualizadoEm' => $now,
    ];

    if ($idx !== null) {
        $prev = $lista[$idx];
        // Não sobrescreve observação manual com dump antigo; limpa dump automático
        $prevObs = trim((string)($prev['observacao'] ?? ''));
        $obsAuto = (strpos($prevObs, 'Origem: cadastro público') !== false)
            || (strpos($prevObs, 'Cidade:') === 0);
        $lista[$idx] = array_merge($prev, $structured, [
            'nome' => $data['nome'] !== '' ? $data['nome'] : ($prev['nome'] ?? ''),
            'email' => $email !== '' ? $email : ($prev['email'] ?? ''),
            'bairro' => $bairro !== '' ? $bairro : ($prev['bairro'] ?? 'A definir'),
            'cidade' => $cidade !== '' ? $cidade : ($prev['cidade'] ?? ''),
            'profissao' => $profissao !== '' ? $profissao : ($prev['profissao'] ?? ''),
            'dataNascimento' => $dataNascimento !== '' ? $dataNascimento : ($prev['dataNascimento'] ?? ''),
            'cep' => $cep !== '' ? $cep : ($prev['cep'] ?? ''),
            'logradouro' => $logradouro !== '' ? $logradouro : ($prev['logradouro'] ?? ''),
            'numero' => $numero !== '' ? $numero : ($prev['numero'] ?? ''),
            'complemento' => $complemento !== '' ? $complemento : ($prev['complemento'] ?? ''),
            'cpf' => $cpf !== '' ? $cpf : ($prev['cpf'] ?? ''),
            'interesses' => $interesses ?: ($prev['interesses'] ?? []),
            'extras' => $extras ?: ($prev['extras'] ?? []),
            'votosEstimados' => $votosEstimados,
            'observacao' => $obsAuto ? '' : $prevObs,
            'nivel' => $prev['nivel'] ?? 'simpatizante',
        ]);
        $created = false;
        $updated = true;
    } else {
        array_unshift($lista, array_merge($structured, [
            'id' => 'lead-'.bin2hex(random_bytes(8)),
            'nivel' => 'simpatizante',
            'observacao' => '',
            'criadoEm' => $now,
        ]));
        $created = true;
        $updated = false;
    }

    $json = json_encode($lista, JSON_UNESCAPED_UNICODE);
    $ins = $pdo->prepare(
        'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
    );
    $ins->execute([$tenantId, $key, $json]);

    // Se a pessoa se cadastrar de novo após exclusão, tira da lista de removidos
    $newId = null;
    $record = null;
    if ($created) {
        $newId = $lista[0]['id'] ?? null;
        $record = $lista[0] ?? null;
    } elseif ($idx !== null) {
        $newId = $lista[$idx]['id'] ?? null;
        $record = $lista[$idx] ?? null;
    }
    if ($newId) {
        $removed = storeGetJson($pdo, $tenantId, 'apoiadores_removidos');
        if (is_array($removed) && $removed) {
            $telKey = '';
            $dig = leadPhoneDigits($data['telefone_digits'] ?? ($data['telefone'] ?? ''));
            if (strlen($dig) >= 8) $telKey = 'tel:'.substr($dig, -9);
            $before = count($removed);
            $removed = array_values(array_filter($removed, function ($id) use ($newId, $telKey) {
                $s = (string)$id;
                if ($s === (string)$newId) return false;
                if ($telKey !== '' && $s === $telKey) return false;
                return true;
            }));
            if (count($removed) !== $before) {
                $ins->execute([$tenantId, 'apoiadores_removidos', json_encode($removed, JSON_UNESCAPED_UNICODE)]);
            }
        }
    }

    // Entra na pirâmide da Equipe (cargo Apoiador)
    if (is_array($record)) {
        upsertLeadNaEquipe($pdo, $tenantId, $record);
    }

    return ['created' => $created, 'updated' => $updated];
}

/**
 * Coloca o lead na pirâmide da Equipe (cargo Comunidade WhatsApp).
 */
function upsertLeadNaEquipe(PDO $pdo, $tenantId, $apoiador) {
    if (!is_array($apoiador) || empty($apoiador['id']) || empty($apoiador['nome'])) return;
    $key = 'equipe_membros';
    $lista = storeGetJson($pdo, $tenantId, $key);
    if (!is_array($lista)) $lista = [];

    $id = (string)$apoiador['id'];
    $tel = (string)($apoiador['telefone'] ?? '');
    $now = gmdate('c');
    $cargoComunidade = 'Comunidade WhatsApp';
    $membro = [
        'id' => $id,
        'nome' => trim((string)$apoiador['nome']),
        'cargo' => $cargoComunidade,
        'telefone' => $tel,
        'email' => trim((string)($apoiador['email'] ?? '')),
        'cpf' => trim((string)($apoiador['cpf'] ?? '')),
        'dataNascimento' => trim((string)($apoiador['dataNascimento'] ?? '')),
        'bairroResidencia' => trim((string)($apoiador['bairro'] ?? '')),
        'cidadeAtuacao' => trim((string)($apoiador['cidade'] ?? '')),
        'bairros' => !empty($apoiador['bairro']) ? [trim((string)$apoiador['bairro'])] : [],
        'valor' => 0,
        'salario' => '',
        'vinculo' => 'Comunidade WhatsApp',
        'origem' => 'cadastro_publico',
        'apoiadorRedeId' => $id,
        'observacoes' => '',
        'atualizadoEm' => $now,
    ];
    if (!empty($apoiador['interesses']) && is_array($apoiador['interesses'])) {
        $membro['observacoes'] = 'Interesses: '.implode('; ', array_map('strval', $apoiador['interesses']));
    }

    $idx = null;
    foreach ($lista as $i => $m) {
        if (!is_array($m)) continue;
        if ((string)($m['id'] ?? '') === $id) { $idx = $i; break; }
        if ((string)($m['apoiadorRedeId'] ?? '') === $id) { $idx = $i; break; }
    }
    // Telefone só se já for da comunidade (não mistura com Cabo Eleitoral)
    if ($idx === null && $tel !== '') {
        foreach ($lista as $i => $m) {
            if (!is_array($m)) continue;
            $mid = (string)($m['id'] ?? '');
            $orig = (string)($m['origem'] ?? '');
            $cargo = trim((string)($m['cargo'] ?? ''));
            $ehComunidade = $orig === 'cadastro_publico'
                || strpos($mid, 'lead-') === 0
                || strcasecmp($cargo, $cargoComunidade) === 0;
            if (!$ehComunidade) continue;
            if (leadPhonesMatch($m['telefone'] ?? '', $tel)) { $idx = $i; break; }
        }
    }

    if ($idx !== null) {
        $prev = $lista[$idx];
        $lista[$idx] = array_merge($prev, $membro, [
            'id' => (strpos((string)($prev['id'] ?? ''), 'lead-') === 0 || ($prev['origem'] ?? '') === 'cadastro_publico')
                ? ($prev['id'] ?? $id)
                : $id,
            'cargo' => $cargoComunidade,
            'valor' => 0,
            'salario' => '',
            'origem' => 'cadastro_publico',
            'criadoEm' => $prev['criadoEm'] ?? $now,
        ]);
    } else {
        $membro['criadoEm'] = $apoiador['criadoEm'] ?? $now;
        array_unshift($lista, $membro);
    }

    // Corrige leads com cargo errado (ex.: herdaram Cabo Eleitoral)
    foreach ($lista as $i => $m) {
        if (!is_array($m)) continue;
        $mid = (string)($m['id'] ?? '');
        $isForm = (($m['origem'] ?? '') === 'cadastro_publico') || (strpos($mid, 'lead-') === 0);
        if (!$isForm) continue;
        if (strcasecmp(trim((string)($m['cargo'] ?? '')), $cargoComunidade) === 0) continue;
        $lista[$i] = array_merge($m, [
            'cargo' => $cargoComunidade,
            'valor' => 0,
            'salario' => '',
            'vinculo' => $m['vinculo'] ?? 'Comunidade WhatsApp',
            'origem' => 'cadastro_publico',
        ]);
    }

    $ins = $pdo->prepare(
        'INSERT INTO store (tenant_id, `key`, `value`) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()'
    );
    $ins->execute([$tenantId, $key, json_encode($lista, JSON_UNESCAPED_UNICODE)]);
}

function decodeLeadFormConfig($raw) {
    $defaults = [
        'layout' => 'card',
        'slogan' => 'Juntos por um Brasil mais forte e por você!',
        'titulo' => 'Cadastre-se e faça parte do nosso time!',
        'subtitulo' => 'Entre para a comunidade oficial e receba notícias, novidades e convites em primeira mão.',
        'valores' => 'FÉ · FAMÍLIA · LIBERDADE · TRABALHO',
        'cta' => 'Quero participar!',
        'corPrimaria' => '#0b1f4d',
        'corAcento' => '#15803d',
        'corDestaque' => '#facc15',
        'foto' => '',
        'logo' => '',
        'mostrarLgpd' => true,
        'textoLgpd' => 'Declaro que li e aceito a Política de Privacidade e autorizo o tratamento dos meus dados pessoais conforme a LGPD.',
        'secaoInteressesTitulo' => 'Tenho interesse em:',
        'whatsappCanalUrl' => '',
        'whatsappCanalTitulo' => 'Canal oficial no WhatsApp',
        'campos' => [
            ['id' => 'nome', 'tipo' => 'text', 'label' => 'Nome completo', 'placeholder' => 'Seu nome completo', 'obrigatorio' => true, 'ativo' => true, 'sistema' => true],
            ['id' => 'email', 'tipo' => 'email', 'label' => 'E-mail', 'placeholder' => 'seu@email.com', 'obrigatorio' => false, 'ativo' => true, 'sistema' => true],
            ['id' => 'telefone', 'tipo' => 'tel', 'label' => 'Celular / WhatsApp', 'placeholder' => '(00) 00000-0000', 'obrigatorio' => true, 'ativo' => true, 'sistema' => true],
            ['id' => 'cidade', 'tipo' => 'cidade', 'label' => 'Cidade', 'placeholder' => 'Digite para buscar a cidade', 'obrigatorio' => true, 'ativo' => true, 'sistema' => true],
            ['id' => 'bairro', 'tipo' => 'bairro', 'label' => 'Bairro', 'placeholder' => 'Seu bairro', 'obrigatorio' => true, 'ativo' => true, 'sistema' => true],
            ['id' => 'cep', 'tipo' => 'cep', 'label' => 'CEP', 'placeholder' => '00000-000', 'obrigatorio' => false, 'ativo' => true, 'sistema' => false],
            ['id' => 'logradouro', 'tipo' => 'text', 'label' => 'Rua / Logradouro', 'placeholder' => 'Rua, avenida…', 'obrigatorio' => true, 'ativo' => true, 'sistema' => false],
            ['id' => 'numero', 'tipo' => 'text', 'label' => 'Número', 'placeholder' => 'Nº', 'obrigatorio' => true, 'ativo' => true, 'sistema' => false],
            ['id' => 'complemento', 'tipo' => 'text', 'label' => 'Apto / Complemento', 'placeholder' => 'Apto, bloco…', 'obrigatorio' => false, 'ativo' => true, 'sistema' => false],
            ['id' => 'profissao', 'tipo' => 'text', 'label' => 'Profissão (opcional)', 'placeholder' => 'Sua profissão', 'obrigatorio' => false, 'ativo' => false, 'sistema' => true],
        ],
        'interesses' => [
            ['id' => 'comunidade_whatsapp', 'label' => 'Quero entrar no canal oficial do WhatsApp', 'ativo' => true, 'padrao' => true],
            ['id' => 'noticias', 'label' => 'Quero receber notícias e ações do mandato', 'ativo' => true, 'padrao' => true],
            ['id' => 'voluntario', 'label' => 'Quero participar como voluntário', 'ativo' => true, 'padrao' => false],
            ['id' => 'eventos', 'label' => 'Quero receber convites para eventos', 'ativo' => true, 'padrao' => false],
        ],
    ];
    if ($raw === null || $raw === '') return $defaults;
    if (is_array($raw)) $cfg = $raw;
    else {
        $cfg = json_decode((string)$raw, true);
        if (!is_array($cfg)) return $defaults;
    }
    $out = array_merge($defaults, $cfg);
    if (!in_array($out['layout'] ?? '', ['card', 'hero', 'split'], true)) $out['layout'] = 'card';
    if (!is_array($out['campos'] ?? null) || !$out['campos']) $out['campos'] = $defaults['campos'];
    if (!is_array($out['interesses'] ?? null)) $out['interesses'] = $defaults['interesses'];
    $hasNome = false;
    $hasTel = false;
    $idsPresentes = [];
    foreach ($out['campos'] as &$c) {
        if (!is_array($c)) continue;
        $cid = (string)($c['id'] ?? '');
        if ($cid !== '') $idsPresentes[$cid] = true;
        if ($cid === 'nome') { $c['sistema'] = true; $c['ativo'] = true; $c['obrigatorio'] = true; $hasNome = true; }
        if ($cid === 'telefone') { $c['sistema'] = true; $c['ativo'] = true; $c['obrigatorio'] = true; $c['tipo'] = 'tel'; $hasTel = true; }
        // Endereço: CEP opcional; cidade/bairro/rua/nº obrigatórios; apto opcional
        if ($cid === 'cidade') { $c['ativo'] = true; $c['obrigatorio'] = true; $c['tipo'] = 'cidade'; $c['sistema'] = true; }
        if ($cid === 'bairro') {
            $c['ativo'] = true; $c['obrigatorio'] = true; $c['tipo'] = 'bairro'; $c['sistema'] = true;
            $c['label'] = preg_replace('/\s*\(opcional\)\s*$/iu', '', (string)($c['label'] ?? 'Bairro')) ?: 'Bairro';
        }
        if ($cid === 'cep') {
            $c['ativo'] = true; $c['obrigatorio'] = false; $c['tipo'] = 'cep';
            $labCep = preg_replace('/\s*\(se souber\)\s*$/iu', '', (string)($c['label'] ?? 'CEP'));
            $c['label'] = $labCep !== '' ? $labCep : 'CEP';
        }
        if ($cid === 'logradouro') { $c['ativo'] = true; $c['obrigatorio'] = true; }
        if ($cid === 'numero') { $c['ativo'] = true; $c['obrigatorio'] = true; }
        if ($cid === 'complemento') { $c['ativo'] = true; $c['obrigatorio'] = false; }
    }
    unset($c);
    if (!$hasNome) array_unshift($out['campos'], $defaults['campos'][0]);
    if (!$hasTel) array_splice($out['campos'], 1, 0, [$defaults['campos'][2]]);
    // Garante campos de endereço mesmo em configs antigas
    foreach ($defaults['campos'] as $defCampo) {
        $did = (string)($defCampo['id'] ?? '');
        if ($did === '' || isset($idsPresentes[$did])) continue;
        if (in_array($did, ['cidade', 'bairro', 'cep', 'logradouro', 'numero', 'complemento'], true)) {
            $out['campos'][] = $defCampo;
        }
    }
    $out['mostrarLgpd'] = !empty($out['mostrarLgpd']);
    return $out;
}
