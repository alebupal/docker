<?php
/**
 * API Backend para escaneo, subida y eliminación de carátulas en generarPoster/cover/
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

$coversDir = __DIR__ . '/cover';

if (!is_dir($coversDir)) {
    mkdir($coversDir, 0755, true);
}

function formatBytes($bytes) {
    if ($bytes >= 1048576) return number_format($bytes / 1048576, 2) . ' MB';
    if ($bytes >= 1024) return number_format($bytes / 1024, 1) . ' KB';
    return $bytes . ' B';
}

function listarCaratulas($dir) {
    $allowed = ['png', 'webp', 'jpg', 'jpeg'];
    $items = scandir($dir);
    $covers = [];

    foreach ($items as $item) {
        if ($item === '.' || $item === '..' || str_starts_with($item, '.')) continue;
        $fullPath = $dir . DIRECTORY_SEPARATOR . $item;
        if (!is_file($fullPath)) continue;

        $ext = strtolower(pathinfo($item, PATHINFO_EXTENSION));
        if (!in_array($ext, $allowed)) continue;

        $key = pathinfo($item, PATHINFO_FILENAME);
        $sz = filesize($fullPath);
        $tm = filemtime($fullPath);

        $covers[] = [
            'key' => $key,
            'filename' => $item,
            'name' => str_replace('_', ' ', $key),
            'url' => 'cover/' . $item,
            'size_bytes' => $sz,
            'size_formatted' => formatBytes($sz),
            'mtime' => $tm,
            'date_formatted' => date('d/m/Y H:i', $tm)
        ];
    }

    usort($covers, fn($a, $b) => strcasecmp($a['key'], $b['key']));
    return $covers;
}

$method = $_SERVER['REQUEST_METHOD'];

// 1. Listar carátulas (GET)
if ($method === 'GET') {
    echo json_encode([
        'success' => true,
        'covers' => listarCaratulas($coversDir)
    ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

// 2. Operaciones POST (Subida o Eliminación)
if ($method === 'POST') {
    $action = $_POST['action'] ?? null;

    // A) Eliminar carátula
    if ($action === 'delete') {
        $filename = $_POST['filename'] ?? '';
        $filename = basename($filename); // Evitar Directory Traversal

        if (!$filename) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Nombre de archivo no especificado']);
            exit;
        }

        $targetPath = $coversDir . DIRECTORY_SEPARATOR . $filename;
        if (file_exists($targetPath)) {
            unlink($targetPath);
            echo json_encode([
                'success' => true,
                'message' => 'Carátula eliminada con éxito',
                'covers' => listarCaratulas($coversDir)
            ]);
            exit;
        } else {
            http_response_code(404);
            echo json_encode(['success' => false, 'error' => 'El archivo no existe en el servidor']);
            exit;
        }
    }

    // B) Guardar carátula final en carpeta cover_download/ (reemplaza si ya existe)
    if ($action === 'save_download') {
        $downloadDir = __DIR__ . '/cover_download';
        if (!is_dir($downloadDir)) {
            @mkdir($downloadDir, 0777, true);
        }
        @chmod($downloadDir, 0777);

        $filename = trim($_POST['filename'] ?? '');
        // Sanitizar caracteres prohibidos manteniendo tildes, eñes y caracteres UTF-8
        $safeName = str_replace(['/', '\\', "\0"], '', $filename);
        $safeName = preg_replace('/[\/\\\\:*?"<>|]/', '', $safeName);
        $safeName = trim($safeName);

        if (empty($safeName)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Nombre de archivo no especificado'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        $imageData = null;
        if (isset($_FILES['image']) && $_FILES['image']['error'] === UPLOAD_ERR_OK) {
            $imageData = file_get_contents($_FILES['image']['tmp_name']);
        } elseif (!empty($_POST['image_data'])) {
            $raw = $_POST['image_data'];
            if (preg_match('/^data:image\/\w+;base64,/', $raw)) {
                $raw = substr($raw, strpos($raw, ',') + 1);
            }
            $imageData = base64_decode($raw);
        }

        if (!$imageData) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'No se recibieron datos de imagen'], JSON_UNESCAPED_UNICODE);
            exit;
        }

        // Si la carpeta no es escribible, intentar forzar permisos
        if (!is_writable($downloadDir)) {
            @chmod($downloadDir, 0777);
        }

        $targetPath = $downloadDir . DIRECTORY_SEPARATOR . $safeName;

        // Si ya existe, intentar eliminarlo primero para evitar conflictos de permisos previos
        if (file_exists($targetPath)) {
            @unlink($targetPath);
        }

        $written = @file_put_contents($targetPath, $imageData);
        if ($written !== false) {
            @chmod($targetPath, 0666);
            echo json_encode([
                'success' => true,
                'message' => "Guardado en cover_download/{$safeName}",
                'filename' => $safeName,
                'path' => "cover_download/{$safeName}",
                'size' => filesize($targetPath)
            ], JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
            exit;
        } else {
            http_response_code(500);
            $err = 'Error al escribir el archivo en cover_download/.';
            if (!is_writable($downloadDir)) {
                $err .= ' La carpeta no tiene permisos de escritura (chmod 777 cover_download).';
            }
            echo json_encode(['success' => false, 'error' => $err], JSON_UNESCAPED_UNICODE);
            exit;
        }
    }

    // B) Subir nueva carátula
    if (isset($_FILES['coverFile'])) {
        $file = $_FILES['coverFile'];

        if ($file['error'] !== UPLOAD_ERR_OK) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Error al transferir el archivo: ' . $file['error']]);
            exit;
        }

        $origName = basename($file['name']);
        $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));

        if (!in_array($ext, ['png', 'webp', 'jpg', 'jpeg'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => 'Solo se permiten imágenes PNG, WebP o JPG']);
            exit;
        }

        // Limpiar el nombre para URL segura
        $cleanBase = preg_replace('/[^a-zA-Z0-9_\-]/', '_', pathinfo($origName, PATHINFO_FILENAME));
        $finalName = $cleanBase . '.' . $ext;
        $destPath = $coversDir . DIRECTORY_SEPARATOR . $finalName;

        if (move_uploaded_file($file['tmp_name'], $destPath)) {
            echo json_encode([
                'success' => true,
                'message' => 'Carátula subida con éxito',
                'filename' => $finalName,
                'covers' => listarCaratulas($coversDir)
            ]);
            exit;
        } else {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => 'No se pudo guardar el archivo en la carpeta cover/']);
            exit;
        }
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Petición no reconocida']);
    exit;
}
