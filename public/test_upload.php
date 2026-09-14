<?php
header('Content-Type: application/json; charset=utf-8');
$token = $_GET['tk'] ?? '';
if ($token !== 'ismael2026') { http_response_code(403); die('forbidden'); }

$TENANT = 'c0a1b2c3-d4e5-4f67-8901-abcdef012345';
$dir = __DIR__ . '/uploads/' . $TENANT . '/materiais';

$result = [
  '__DIR__' => __DIR__,
  'dir_path' => $dir,
  'dir_exists' => is_dir($dir),
  'dir_writable' => is_writable($dir),
  'parent_writable' => is_writable(__DIR__ . '/uploads'),
  'php_user' => function_exists('posix_getpwuid') ? posix_getpwuid(posix_geteuid())['name'] : 'desconhecido',
  'free_space' => disk_free_space(__DIR__),
];

// Tenta criar um arquivo de teste
$testFile = $dir . '/test_write_' . time() . '.txt';
$wrote = @file_put_contents($testFile, 'teste');
$result['file_put_contents_test'] = $wrote !== false ? 'OK' : 'FALHOU';
if ($wrote !== false) {
  @unlink($testFile);
  $result['test_file_deleted'] = true;
}

// Se pasta não existe, tenta criar
if (!is_dir($dir)) {
  $created = @mkdir($dir, 0755, true);
  $result['mkdir_attempt'] = $created ? 'OK' : 'FALHOU';
  if ($created) {
    $wrote2 = @file_put_contents($dir . '/test2.txt', 'teste2');
    $result['write_after_mkdir'] = $wrote2 !== false ? 'OK' : 'FALHOU';
    if ($wrote2 !== false) @unlink($dir . '/test2.txt');
  }
}

// Verifica permissões do diretório
if (is_dir($dir)) {
  $perms = fileperms($dir);
  $result['dir_permissions'] = substr(sprintf('%o', $perms), -4);
  $result['dir_owner'] = function_exists('posix_getpwuid') ? posix_getpwuid(fileowner($dir))['name'] : fileowner($dir);
}

echo json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
