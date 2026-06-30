<?php
// ─── Configuração ──────────────────────────────────────────────
define('DB_HOST', 'localhost');
define('DB_NAME', 'u176739135_campanha');
define('DB_USER', 'u176739135_hospedagem');
define('DB_PASS', 'Xgames12345.');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }

// ─── Conexão ───────────────────────────────────────────────────
try {
    $pdo = new PDO("mysql:host=".DB_HOST.";dbname=".DB_NAME.";charset=utf8mb4",
                   DB_USER, DB_PASS,
                   [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB: '.$e->getMessage()]);
    exit;
}

// ─── Auto-criar tabela se não existir ─────────────────────────
$pdo->exec("CREATE TABLE IF NOT EXISTS store (
    `key`      VARCHAR(100) PRIMARY KEY,
    `value`    LONGTEXT     NOT NULL,
    updated_at DATETIME     DEFAULT CURRENT_TIMESTAMP
                            ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");

// ─── Roteamento ────────────────────────────────────────────────
$method = $_SERVER['REQUEST_METHOD'];
$key    = $_GET['key'] ?? '';

// GET /api.php?key=xxx  → lê valor
if ($method === 'GET') {
    if (!$key) {
        // Retorna todas as chaves e seus valores
        $rows = $pdo->query("SELECT `key`, `value` FROM store")->fetchAll(PDO::FETCH_ASSOC);
        $out  = [];
        foreach ($rows as $r) $out[$r['key']] = json_decode($r['value'], true);
        echo json_encode($out);
    } else {
        $stmt = $pdo->prepare("SELECT `value` FROM store WHERE `key` = ?");
        $stmt->execute([$key]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        echo $row ? $row['value'] : 'null';
    }
    exit;
}

// POST /api.php?key=xxx  body = JSON value → salva
if ($method === 'POST') {
    $body = file_get_contents('php://input');
    if (!$key || !$body) {
        http_response_code(400);
        echo json_encode(['error' => 'key e body obrigatórios']);
        exit;
    }
    $stmt = $pdo->prepare(
        "INSERT INTO store (`key`, `value`) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE `value` = VALUES(`value`), updated_at = NOW()"
    );
    $stmt->execute([$key, $body]);
    echo json_encode(['ok' => true]);
    exit;
}

http_response_code(405);
echo json_encode(['error' => 'Método não permitido']);
