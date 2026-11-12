<?php
/**
 * Almacenamiento de la API Key de TMDb solo en el servidor.
 *
 * La clave se guarda en `.tmdb_api_key` (permisos 600), un fichero oculto que:
 *  - Nginx no sirve (regla `location ~ /\.` → deny all).
 *  - Git ignora (.gitignore).
 * Nunca se devuelve al navegador: el cliente solo recibe si existe y una versión enmascarada.
 *
 * Versiones anteriores la guardaban en config.json (versionado y público); tmdb_migrate_key()
 * la mueve automáticamente al fichero seguro y la elimina de config.json.
 */

const TMDB_KEY_FILE = __DIR__ . '/.tmdb_api_key';

function tmdb_get_key(): string {
    if (!is_file(TMDB_KEY_FILE)) return '';
    return trim((string) @file_get_contents(TMDB_KEY_FILE));
}

function tmdb_set_key(string $key): bool {
    $key = trim($key);
    if ($key === '') {
        return !is_file(TMDB_KEY_FILE) || @unlink(TMDB_KEY_FILE);
    }
    // Las API Keys v3 de TMDb son hexadecimales; los tokens v4 (JWT) usan base64url y puntos.
    if (!preg_match('/^[A-Za-z0-9._-]{16,512}$/', $key)) return false;
    $ok = @file_put_contents(TMDB_KEY_FILE, $key, LOCK_EX) !== false;
    if ($ok) @chmod(TMDB_KEY_FILE, 0600);
    return $ok;
}

function tmdb_mask_key(string $key): string {
    return $key === '' ? '' : substr($key, 0, 4) . '...' . substr($key, -4);
}

/**
 * Mueve una API Key heredada de config.json al fichero seguro y la quita de config.json.
 */
function tmdb_migrate_key(string $configPath): void {
    if (!is_file($configPath)) return;
    $data = @json_decode((string) file_get_contents($configPath), true);
    if (!is_array($data) || !array_key_exists('tmdb', $data)) return;

    $legacy = trim((string) ($data['tmdb']['api_key'] ?? ''));
    if ($legacy !== '' && tmdb_get_key() === '' && !tmdb_set_key($legacy)) {
        return; // No se pudo guardar en el fichero seguro: no se borra de config.json para no perderla
    }
    unset($data['tmdb']);
    @file_put_contents(
        $configPath,
        json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE),
        LOCK_EX
    );
}

/**
 * Elimina cualquier rastro de la clave antes de escribir config.json.
 */
function tmdb_strip_key(array $cfg): array {
    unset($cfg['tmdb']);
    return $cfg;
}
