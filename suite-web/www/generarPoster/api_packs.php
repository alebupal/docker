<?php
/**
 * API Backend para lectura y persistencia de packs en config.json
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

require_once __DIR__ . '/tmdb_key.php';

$configFile = __DIR__ . '/config.json';
tmdb_migrate_key($configFile);

function loadFullConfig($path) {
    $defaults = [
        'cache' => ['ttl_seconds' => 86400],
        'packs' => []
    ];

    if (file_exists($path)) {
        $data = @json_decode(file_get_contents($path), true);
        if (is_array($data)) {
            if (!isset($data['packs']) || !is_array($data['packs'])) {
                $data['packs'] = [];
            }
            if (!isset($data['cache']) || !is_array($data['cache'])) {
                $data['cache'] = $defaults['cache'];
            }
            return $data;
        }
    }

    return $defaults;
}

function saveFullConfig($path, $cfg) {
    $cfg = tmdb_strip_key($cfg);
    file_put_contents($path, json_encode($cfg, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

$fullConfig = loadFullConfig($configFile);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
    echo json_encode($fullConfig['packs'] ?? [], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $data = json_decode($rawInput, true);

    if (!$data) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Datos JSON inválidos']);
        exit;
    }

    $currentPacks = $fullConfig['packs'] ?? [];

    // Acción: Eliminar pack por ID
    if (isset($data['action']) && $data['action'] === 'delete' && isset($data['id'])) {
        $filtered = array_values(array_filter($currentPacks, fn($p) => $p['id'] !== $data['id']));
        $fullConfig['packs'] = $filtered;
        saveFullConfig($configFile, $fullConfig);
        echo json_encode(['success' => true, 'packs' => $filtered]);
        exit;
    }

    // Acción: Guardar nuevo pack o actualizar existente
    if (isset($data['action']) && $data['action'] === 'save' && isset($data['pack'])) {
        $newPack = $data['pack'];
        $exists = false;
        foreach ($currentPacks as &$existing) {
            if ($existing['id'] === $newPack['id']) {
                $existing = $newPack;
                $exists = true;
                break;
            }
        }
        if (!$exists) {
            $currentPacks[] = $newPack;
        }

        $fullConfig['packs'] = $currentPacks;
        saveFullConfig($configFile, $fullConfig);
        echo json_encode(['success' => true, 'packs' => $currentPacks]);
        exit;
    }

    // Guardado de lista completa directamente
    if (is_array($data) && array_is_list($data)) {
        $fullConfig['packs'] = $data;
        saveFullConfig($configFile, $fullConfig);
        echo json_encode(['success' => true, 'packs' => $data]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Acción no reconocida']);
    exit;
}

