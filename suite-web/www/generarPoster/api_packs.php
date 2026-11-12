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

/**
 * Valida y normaliza un pack. Devuelve null si no cumple el esquema
 * (evita guardar HTML/JS arbitrario que luego se pinta en la interfaz).
 */
function sanitizePack($pack): ?array {
    if (!is_array($pack)) return null;
    $idRe = '/^[A-Za-z0-9_-]{1,64}$/';

    $id = $pack['id'] ?? null;
    $name = $pack['name'] ?? null;
    $tag = $pack['tag'] ?? '';
    $covers = $pack['covers'] ?? null;
    if (!is_string($id) || !preg_match($idRe, $id)) return null;
    if (!is_string($name) || trim($name) === '' || mb_strlen($name) > 80) return null;
    if (!is_string($tag) || mb_strlen($tag) > 120) return null;
    if (!is_array($covers) || !array_is_list($covers) || count($covers) < 1 || count($covers) > 20) return null;
    foreach ($covers as $c) {
        if (!is_string($c) || !preg_match($idRe, $c)) return null;
    }

    return [
        'id' => $id,
        'name' => trim($name),
        'tag' => trim($tag),
        'covers' => array_values(array_unique($covers)),
        'isDefault' => !empty($pack['isDefault']),
    ];
}

function rejectPack(string $error = 'Pack con formato no válido'): never {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit;
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

    if (!is_array($data) || !$data) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Datos JSON inválidos']);
        exit;
    }

    $currentPacks = $fullConfig['packs'] ?? [];

    // Acción: Eliminar pack por ID
    if (isset($data['action']) && $data['action'] === 'delete' && isset($data['id'])) {
        if (!is_string($data['id'])) rejectPack('ID de pack no válido');
        $filtered = array_values(array_filter($currentPacks, fn($p) => ($p['id'] ?? null) !== $data['id']));
        $fullConfig['packs'] = $filtered;
        saveFullConfig($configFile, $fullConfig);
        echo json_encode(['success' => true, 'packs' => $filtered]);
        exit;
    }

    // Acción: Guardar nuevo pack o actualizar existente
    if (isset($data['action']) && $data['action'] === 'save' && isset($data['pack'])) {
        $newPack = sanitizePack($data['pack']);
        if ($newPack === null) rejectPack();
        $exists = false;
        foreach ($currentPacks as &$existing) {
            if (($existing['id'] ?? null) === $newPack['id']) {
                $existing = $newPack;
                $exists = true;
                break;
            }
        }
        unset($existing);
        if (!$exists) {
            $currentPacks[] = $newPack;
        }

        $fullConfig['packs'] = $currentPacks;
        saveFullConfig($configFile, $fullConfig);
        echo json_encode(['success' => true, 'packs' => $currentPacks]);
        exit;
    }

    // Guardado de lista completa directamente
    if (array_is_list($data)) {
        $clean = [];
        foreach ($data as $pack) {
            $ok = sanitizePack($pack);
            if ($ok === null) rejectPack();
            $clean[] = $ok;
        }
        $fullConfig['packs'] = $clean;
        saveFullConfig($configFile, $fullConfig);
        echo json_encode(['success' => true, 'packs' => $clean]);
        exit;
    }

    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Acción no reconocida']);
    exit;
}

