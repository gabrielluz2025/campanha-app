<?php
// Script de migração de emergência — remove após usar
header('Content-Type: application/json; charset=utf-8');

$token = $_GET['tk'] ?? '';
if ($token !== 'ismael2026') { http_response_code(403); die(json_encode(['error'=>'forbidden'])); }

$TENANT_ID = 'c0a1b2c3-d4e5-4f67-8901-abcdef012345';

try {
    $pdo = new PDO(
        'mysql:host=localhost;dbname=u176739135_campanha;charset=utf8mb4',
        'u176739135_hospedagem', 'Xgames12345.',
        [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]
    );
} catch (Exception $e) {
    die(json_encode(['error'=>'db_connect','msg'=>$e->getMessage()]));
}

$log = [];

// 1. Criar tenant_store se não existir
$pdo->exec("CREATE TABLE IF NOT EXISTS `tenant_store` (
  `tenant_id` VARCHAR(36) NOT NULL,
  `key`       VARCHAR(255) NOT NULL,
  `value`     LONGTEXT,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`tenant_id`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
$log[] = 'tenant_store criada (ou já existia)';

// 2. Contar registros na store antiga
$total_old = $pdo->query("SELECT COUNT(*) FROM store")->fetchColumn();
$log[] = "store antiga tem $total_old registros";

// 3. Contar registros já migrados
$total_new = $pdo->query("SELECT COUNT(*) FROM tenant_store WHERE tenant_id='$TENANT_ID'")->fetchColumn();
$log[] = "tenant_store já tem $total_new registros para este tenant";

// 4. Migrar TODOS os dados de store para tenant_store
$migrated = 0;
$skipped = 0;
$stmt = $pdo->query("SELECT `key`, `value`, `updated_at` FROM store");
$insert = $pdo->prepare("INSERT INTO tenant_store (tenant_id, `key`, `value`, updated_at) 
    VALUES (?, ?, ?, ?) 
    ON DUPLICATE KEY UPDATE value = VALUES(value), updated_at = VALUES(updated_at)");

while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    try {
        $insert->execute([$TENANT_ID, $row['key'], $row['value'], $row['updated_at']]);
        $migrated++;
    } catch (Exception $e) {
        $skipped++;
    }
}
$log[] = "Migrados: $migrated registros, pulados: $skipped";

// 5. Remover marcadores antigos de migração para forçar re-check
$pdo->exec("DELETE FROM store WHERE `key` LIKE 'campanha_migrated_%'");
$log[] = 'Marcadores de migração removidos da store antiga';

// 6. Verificar resultado final
$final_count = $pdo->query("SELECT COUNT(*) FROM tenant_store WHERE tenant_id='$TENANT_ID'")->fetchColumn();
$log[] = "FINAL: tenant_store tem $final_count registros para Campanha principal";

// 7. Listar algumas chaves migradas
$sample = $pdo->query("SELECT `key`, LENGTH(value) as size FROM tenant_store WHERE tenant_id='$TENANT_ID' ORDER BY size DESC LIMIT 20")->fetchAll(PDO::FETCH_ASSOC);

echo json_encode([
    'success' => true,
    'tenant_id' => $TENANT_ID,
    'log' => $log,
    'amostra_chaves' => $sample
], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
