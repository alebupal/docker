<?php
/**
 * Proxy de imágenes para «Cargar desde URL» cuando el servidor remoto no permite CORS.
 *
 * Sustituye al servicio externo api.allorigins.win (que recibía todas las URLs). Limitado para que
 * no sirva de proxy abierto ni para llegar a la red interna:
 *  - solo http/https y puertos 80/443;
 *  - el nombre se resuelve aquí y se rechaza si alguna IP es privada, local o reservada; la conexión
 *    se fija a esa IP (CURLOPT_RESOLVE) para que no cambie entre la comprobación y la descarga;
 *  - las redirecciones se siguen a mano (máx. 3) repitiendo todas las comprobaciones;
 *  - máximo 25 MB y la respuesta tiene que ser una imagen PNG, JPEG, WebP o GIF real.
 * Nginx además solo lo permite desde la red local.
 */

const MAX_BYTES = 25 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const ALLOWED_TYPES = [IMAGETYPE_PNG => 'image/png', IMAGETYPE_JPEG => 'image/jpeg', IMAGETYPE_WEBP => 'image/webp', IMAGETYPE_GIF => 'image/gif'];

function fail(int $code, string $msg): never {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => $msg], JSON_UNESCAPED_UNICODE);
    exit;
}

/** IP pública a la que conectar para $host, o null si no resuelve o alguna IP no es pública. */
function publicIp(string $host): ?string {
    $host = trim($host, '[]');
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ips = [$host];
    } else {
        $ips = [];
        foreach (@dns_get_record($host, DNS_A | DNS_AAAA) ?: [] as $r) {
            if (!empty($r['ip'])) $ips[] = $r['ip'];
            if (!empty($r['ipv6'])) $ips[] = $r['ipv6'];
        }
        if (!$ips) {
            $v4 = @gethostbynamel($host);
            $ips = $v4 ?: [];
        }
    }
    if (!$ips) return null;
    foreach ($ips as $ip) {
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return null;
        }
    }
    return $ips[0];
}

$url = trim((string) ($_GET['url'] ?? ''));
if ($url === '' || strlen($url) > 2048) fail(400, 'Falta la URL de la imagen');

for ($hop = 0; $hop <= MAX_REDIRECTS; $hop++) {
    $parts = parse_url($url);
    $scheme = strtolower($parts['scheme'] ?? '');
    $host = $parts['host'] ?? '';
    if (!in_array($scheme, ['http', 'https'], true) || $host === '' || isset($parts['user']) || isset($parts['pass'])) {
        fail(400, 'Solo se admiten URLs http o https');
    }
    $port = (int) ($parts['port'] ?? ($scheme === 'https' ? 443 : 80));
    if (!in_array($port, [80, 443], true)) fail(400, 'Solo se admiten los puertos 80 y 443');
    $ip = publicIp($host);
    if ($ip === null) fail(400, 'El servidor de la imagen no es accesible o está en una red privada');

    $body = '';
    $tooBig = false;
    $ch = curl_init($url);
    curl_setopt_array($ch, [
        CURLOPT_RESOLVE => [sprintf('%s:%d:%s', trim($host, '[]'), $port, str_contains($ip, ':') ? "[$ip]" : $ip)],
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_PROTOCOLS => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_CONNECTTIMEOUT => 8,
        CURLOPT_TIMEOUT => 25,
        CURLOPT_USERAGENT => 'Mozilla/5.0 (SuiteWeb generarPoster)',
        CURLOPT_HTTPHEADER => ['Accept: image/*'],
        CURLOPT_HEADER => false,
        CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$body, &$tooBig) {
            $body .= $chunk;
            if (strlen($body) > MAX_BYTES) {
                $tooBig = true;
                return 0; // corta la descarga
            }
            return strlen($chunk);
        },
    ]);
    curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $location = (string) curl_getinfo($ch, CURLINFO_REDIRECT_URL);
    $err = curl_error($ch);

    if ($tooBig) fail(413, 'La imagen supera los 25 MB');
    if ($status >= 300 && $status < 400 && $location !== '') {
        $url = $location;
        continue;
    }
    if ($status !== 200) fail(502, $err !== '' ? "No se pudo descargar la imagen ($err)" : "El servidor de la imagen respondió $status");

    $info = @getimagesizefromstring($body);
    $mime = $info ? (ALLOWED_TYPES[$info[2]] ?? null) : null;
    if ($mime === null) fail(415, 'La URL no devuelve una imagen PNG, JPEG, WebP o GIF');

    header('Content-Type: ' . $mime);
    header('Content-Length: ' . strlen($body));
    header('Cache-Control: private, max-age=3600');
    header('X-Content-Type-Options: nosniff');
    echo $body;
    exit;
}

fail(502, 'Demasiadas redirecciones');
