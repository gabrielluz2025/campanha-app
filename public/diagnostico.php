<?php
// Diagnóstico temporário — remove após usar
header('Content-Type: application/json; charset=utf-8');

// Proteção básica
$token = $_GET['tk'] ?? '';
if ($token !== 'ismael2026') {
    http_response_code(403);
    die(json_encode(['error' => 'forbidden']));
}

try {
    $pdo = new PDO(
        'mysql:host=localhost;dbname=u176739135_campanha;charset=utf8mb4',
        'u176739135_hospedagem',
        'Xgames12345.',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (Exception $e) {
    die(json_encode(['error' => 'db_connect', 'msg' => $e->getMessage()]));
}

$result = [];

// 1. Tenants existentes
try {
    $rows = $pdo->query("SELECT * FROM tenants ORDER BY created_at")->fetchAll(PDO::FETCH_ASSOC);
    $result['tenants'] = $rows;
} catch(Exception $e) { $result['tenants_error'] = $e->getMessage(); }

// 2. Membros por tenant
try {
    $rows = $pdo->query("SELECT tenant_id, email, role, allowed_tabs FROM tenant_members ORDER BY tenant_id")->fetchAll(PDO::FETCH_ASSOC);
    $result['members'] = $rows;
} catch(Exception $e) { $result['members_error'] = $e->getMessage(); }

// 3. Estrutura da tabela store
try {
    $rows = $pdo->query("DESCRIBE store")->fetchAll(PDO::FETCH_ASSOC);
    $result['store_structure'] = $rows;
} catch(Exception $e) { $result['store_structure_error'] = $e->getMessage(); }

// 4. Distribuição de tenant_id na tabela store
try {
    $rows = $pdo->query("SELECT IFNULL(tenant_id,'(NULL)') as tenant_id, COUNT(*) as total_keys FROM store GROUP BY tenant_id ORDER BY total_keys DESC")->fetchAll(PDO::FETCH_ASSOC);
    $result['store_by_tenant'] = $rows;
} catch(Exception $e) { $result['store_by_tenant_error'] = $e->getMessage(); }

// 5. Chaves mais pesadas na store (qualquer tenant_id)
try {
    $rows = $pdo->query("SELECT IFNULL(tenant_id,'(NULL)') as tenant_id, `key`, LENGTH(value) as value_size, updated_at FROM store ORDER BY value_size DESC LIMIT 20")->fetchAll(PDO::FETCH_ASSOC);
    $result['biggest_keys'] = $rows;
} catch(Exception $e) { $result['biggest_keys_error'] = $e->getMessage(); }

// 6. Chaves da store com tenant_id = 'c0a1b2c3-d4e5-4f67-8901-abcdef012345'
try {
    $rows = $pdo->query("SELECT `key`, LENGTH(value) as value_size, updated_at FROM store WHERE tenant_id = 'c0a1b2c3-d4e5-4f67-8901-abcdef012345' ORDER BY value_size DESC LIMIT 20")->fetchAll(PDO::FETCH_ASSOC);
    $result['keys_default_tenant'] = $rows;
} catch(Exception $e) { $result['keys_default_tenant_error'] = $e->getMessage(); }

// 7. tenant_store existe?
try {
    $rows = $pdo->query("SHOW TABLES LIKE 'tenant_store'")->fetchAll(PDO::FETCH_ASSOC);
    $result['tenant_store_exists'] = count($rows) > 0;
} catch(Exception $e) { $result['tenant_store_check_error'] = $e->getMessage(); }

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
