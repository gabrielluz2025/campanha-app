<?php
// Limpa chaves duplicadas obsoletas — remove após usar
header('Content-Type: application/json; charset=utf-8');
$token = $_GET['tk'] ?? '';
if ($token !== 'ismael2026') { http_response_code(403); die('forbidden'); }

try {
    $pdo = new PDO('mysql:host=localhost;dbname=u176739135_campanha;charset=utf8mb4',
        'u176739135_hospedagem', 'Xgames12345.',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
} catch (Exception $e) { die(json_encode(['error' => $e->getMessage()])); }

$TENANT = 'c0a1b2c3-d4e5-4f67-8901-abcdef012345';
$log = [];

// 1. Contar antes
$before = $pdo->query("SELECT COUNT(*) FROM store WHERE tenant_id='$TENANT'")->fetchColumn();
$log[] = "ANTES: $before chaves para o tenant principal";

// 2. Deletar chaves com prefixo t: (formato antigo de tenant-scoped)
$stmt = $pdo->prepare("DELETE FROM store WHERE tenant_id = ? AND `key` LIKE 't:%'");
$stmt->execute([$TENANT]);
$del_t = $stmt->rowCount();
$log[] = "Deletadas chaves 't:' : $del_t";

// 3. Deletar chaves com prefixo u: (formato antigo de user-scoped)
$stmt = $pdo->prepare("DELETE FROM store WHERE tenant_id = ? AND `key` LIKE 'u:%'");
$stmt->execute([$TENANT]);
$del_u = $stmt->rowCount();
$log[] = "Deletadas chaves 'u:' : $del_u";

// 4. Deletar chave de teste
$stmt = $pdo->prepare("DELETE FROM store WHERE tenant_id = ? AND `key` = 'test_big'");
$stmt->execute([$TENANT]);
$del_test = $stmt->rowCount();
$log[] = "Deletada chave 'test_big': $del_test";

// 5. Contar depois
$after = $pdo->query("SELECT COUNT(*) FROM store WHERE tenant_id='$TENANT'")->fetchColumn();
$log[] = "DEPOIS: $after chaves para o tenant principal";

// 6. Mostrar maiores chaves restantes
$biggest = $pdo->query("SELECT `key`, LENGTH(value) as sz FROM store WHERE tenant_id='$TENANT' ORDER BY sz DESC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);

echo json_encode([
    'success' => true,
    'log' => $log,
    'deleted_total' => $del_t + $del_u + $del_test,
    'remaining_keys' => $after,
    'biggest_remaining' => $biggest
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
