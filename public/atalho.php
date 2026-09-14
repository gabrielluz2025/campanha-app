<?php
/**
 * Perfil iOS (Web Clip) — coloca o Campanha na tela inicial.
 * Uso: /atalho.php   ou  /atalho.php?url=https://campanha.space/
 */
header('Access-Control-Allow-Origin: *');

if (!function_exists('str_ends_with')) {
  function str_ends_with($haystack, $needle) {
    if ($needle === '') return true;
    return substr($haystack, -strlen($needle)) === $needle;
  }
}

$url = isset($_GET['url']) ? trim((string) $_GET['url']) : 'https://campanha.space/';
$nome = isset($_GET['nome']) ? trim((string) $_GET['nome']) : 'Campanha';
if ($nome === '') $nome = 'Campanha';
$nome = function_exists('mb_substr') ? mb_substr($nome, 0, 20) : substr($nome, 0, 20);

if ($url === '' || !preg_match('#^https?://#i', $url)) {
  $url = 'https://campanha.space/';
}

$hostOk = false;
$parts = parse_url($url);
$host = strtolower((string) ($parts['host'] ?? ''));
$allowed = ['campanha.space', 'www.campanha.space', 'localhost', '127.0.0.1'];
foreach ($allowed as $a) {
  if ($host === $a || str_ends_with($host, '.' . $a)) {
    $hostOk = true;
    break;
  }
}
if (!$hostOk) {
  http_response_code(400);
  header('Content-Type: text/plain; charset=utf-8');
  echo 'Host não permitido.';
  exit;
}

$iconFile = __DIR__ . '/pwa-512.png';
$iconB64 = '';
if (is_file($iconFile)) {
  $iconB64 = base64_encode((string) file_get_contents($iconFile));
}

function uuidv4() {
  $d = random_bytes(16);
  $d[6] = chr((ord($d[6]) & 0x0f) | 0x40);
  $d[8] = chr((ord($d[8]) & 0x3f) | 0x80);
  return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($d), 4));
}

$uuidClip = uuidv4();
$uuidProf = uuidv4();
$label = htmlspecialchars($nome, ENT_XML1 | ENT_QUOTES, 'UTF-8');
$urlXml = htmlspecialchars($url, ENT_XML1 | ENT_QUOTES, 'UTF-8');

$iconXml = '';
if ($iconB64 !== '') {
  $iconXml = "      <key>Icon</key>\n      <data>" . $iconB64 . "</data>\n";
}

$plist = <<<XML
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>PayloadContent</key>
  <array>
    <dict>
      <key>FullScreen</key>
      <true/>
{$iconXml}      <key>IsRemovable</key>
      <true/>
      <key>Label</key>
      <string>{$label}</string>
      <key>PayloadDescription</key>
      <string>Atalho do Sistema de Campanha na tela inicial</string>
      <key>PayloadDisplayName</key>
      <string>{$label}</string>
      <key>PayloadIdentifier</key>
      <string>space.campanha.webclip</string>
      <key>PayloadType</key>
      <string>com.apple.webClip.managed</string>
      <key>PayloadUUID</key>
      <string>{$uuidClip}</string>
      <key>PayloadVersion</key>
      <integer>1</integer>
      <key>Precomposed</key>
      <true/>
      <key>URL</key>
      <string>{$urlXml}</string>
    </dict>
  </array>
  <key>PayloadDescription</key>
  <string>Instala o app Campanha na tela inicial do iPhone</string>
  <key>PayloadDisplayName</key>
  <string>Campanha</string>
  <key>PayloadIdentifier</key>
  <string>space.campanha.profile</string>
  <key>PayloadOrganization</key>
  <string>campanha.space</string>
  <key>PayloadRemovalDisallowed</key>
  <false/>
  <key>PayloadType</key>
  <string>Configuration</string>
  <key>PayloadUUID</key>
  <string>{$uuidProf}</string>
  <key>PayloadVersion</key>
  <integer>1</integer>
</dict>
</plist>
XML;

$filename = 'Campanha.mobileconfig';
header('Content-Type: application/x-apple-aspen-config; charset=utf-8');
header('Content-Disposition: attachment; filename="' . $filename . '"');
header('Cache-Control: no-store');
echo $plist;
