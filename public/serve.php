<?php
// Serve static files with correct Content-Type
// Workaround for LiteSpeed rewrite blocking .js/.css

$file = isset($_GET['file']) ? $_GET['file'] : '';

if (!$file) {
    http_response_code(400);
    exit('Missing file parameter');
}

// Security: prevent directory traversal
$file = basename($file);

$fullPath = dirname(__DIR__) . '/' . $file;

if (!file_exists($fullPath) || is_dir($fullPath)) {
    http_response_code(404);
    exit('Not found');
}

$mimeTypes = [
    'js'   => 'application/javascript',
    'mjs'  => 'application/javascript',
    'css'  => 'text/css',
    'json' => 'application/json',
    'map'  => 'application/json',
    'svg'  => 'image/svg+xml',
    'woff' => 'font/woff',
    'woff2'=> 'font/woff2',
    'ttf'  => 'font/ttf',
    'eot'  => 'application/vnd.ms-fontobject',
    'png'  => 'image/png',
    'jpg'  => 'image/jpeg',
    'jpeg' => 'image/jpeg',
    'gif'  => 'image/gif',
    'webp' => 'image/webp',
    'ico'  => 'image/x-icon',
];

$ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
$mime = $mimeTypes[$ext] ?? 'application/octet-stream';

header('Content-Type: ' . $mime);
header('Content-Length: ' . filesize($fullPath));
header('Cache-Control: public, max-age=31536000, immutable');

readfile($fullPath);
exit;
