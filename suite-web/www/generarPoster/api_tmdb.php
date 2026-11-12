<?php
/**
 * API Backend para integración con The Movie Database (TMDb)
 * Optimizado con cURL paralelo (curl_multi) y caché local de 24h.
 * 
 * Modos:
 * 1. Modo Directo: Sin API Key (cURL paralelo a themoviedb.org para portada, año y posters en es-ES y en).
 * 2. Modo API oficial: Con API Key v3 (búsqueda por texto y obtención completa).
 */
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-cache, no-store, must-revalidate');

set_time_limit(25);

require_once __DIR__ . '/tmdb_key.php';

$configFile = __DIR__ . '/config.json';
tmdb_migrate_key($configFile);
$cacheDir = __DIR__ . '/cache';
if (!is_dir($cacheDir)) {
    @mkdir($cacheDir, 0755, true);
}

function loadConfig($path) {
    $defaults = [
        'cache' => ['ttl_seconds' => 86400],
        'margin' => ['threshold' => 18, 'percent' => 14],
        'packs' => []
    ];
    if (file_exists($path)) {
        $data = @json_decode(file_get_contents($path), true);
        if (is_array($data)) {
            return array_replace_recursive($defaults, $data);
        }
    }
    return $defaults;
}

function saveConfig($path, $data) {
    $data = tmdb_strip_key($data);
    @file_put_contents($path, json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE), LOCK_EX);
}

function formatBytes($bytes) {
    if ($bytes >= 1048576) return number_format($bytes / 1048576, 2) . ' MB';
    if ($bytes >= 1024) return number_format($bytes / 1024, 1) . ' KB';
    return $bytes . ' B';
}

function getCacheInfo($dir) {
    $count = 0;
    $bytes = 0;
    if (is_dir($dir)) {
        $items = @scandir($dir);
        if ($items) {
            foreach ($items as $item) {
                if ($item === '.' || $item === '..' || str_starts_with($item, '.')) continue;
                $file = $dir . DIRECTORY_SEPARATOR . $item;
                if (is_file($file)) {
                    $count++;
                    $bytes += @filesize($file);
                }
            }
        }
    }
    return [
        'count' => $count,
        'bytes' => $bytes,
        'formatted' => formatBytes($bytes)
    ];
}

function clearCacheDir($dir) {
    $deleted = 0;
    $freedBytes = 0;
    if (is_dir($dir)) {
        $items = @scandir($dir);
        if ($items) {
            foreach ($items as $item) {
                if ($item === '.' || $item === '..' || str_starts_with($item, '.')) continue;
                $file = $dir . DIRECTORY_SEPARATOR . $item;
                if (is_file($file)) {
                    $sz = @filesize($file);
                    if (@unlink($file)) {
                        $deleted++;
                        $freedBytes += $sz;
                    }
                }
            }
        }
    }
    return [
        'deleted_count' => $deleted,
        'freed_bytes' => $freedBytes,
        'freed_formatted' => formatBytes($freedBytes)
    ];
}

$appConfig = loadConfig($configFile);
$serverApiKey = tmdb_get_key();
$cacheTtl = intval($appConfig['cache']['ttl_seconds'] ?? 86400);
if ($cacheTtl <= 0) $cacheTtl = 86400;

function sendJson($data, $statusCode = 200) {
    http_response_code($statusCode);
    echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    exit;
}

function tmdbCurl($url, $headers = []) {
    $ch = curl_init($url);
    $defaultHeaders = [
        "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept-Language: es-ES,es;q=0.9,en;q=0.8"
    ];
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_TIMEOUT => 10,
        CURLOPT_HTTPHEADER => array_merge($defaultHeaders, $headers),
        CURLOPT_SSL_VERIFYPEER => false
    ]);
    $res = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $finalUrl = curl_getinfo($ch, CURLINFO_EFFECTIVE_URL);
    return ['body' => $res, 'status' => $httpCode, 'final_url' => $finalUrl];
}

/**
 * Ejecutar múltiples peticiones HTTP cURL simultáneas en paralelo
 */
function tmdbCurlParallel($requests) {
    $mh = curl_multi_init();
    $chs = [];

    foreach ($requests as $key => $req) {
        $ch = curl_init($req['url']);
        $headers = array_merge([
            "User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Accept-Language: es-ES,es;q=0.9,en;q=0.8"
        ], $req['headers'] ?? []);

        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_TIMEOUT => 10,
            CURLOPT_HTTPHEADER => $headers,
            CURLOPT_SSL_VERIFYPEER => false
        ]);
        curl_multi_add_handle($mh, $ch);
        $chs[$key] = $ch;
    }

    $running = null;
    do {
        curl_multi_exec($mh, $running);
        curl_multi_select($mh, 0.1);
    } while ($running > 0);

    $results = [];
    foreach ($chs as $key => $ch) {
        $results[$key] = [
            'body' => curl_multi_getcontent($ch),
            'status' => curl_getinfo($ch, CURLINFO_HTTP_CODE)
        ];
        curl_multi_remove_handle($mh, $ch);
    }
    curl_multi_close($mh);

    return $results;
}

$action = $_REQUEST['action'] ?? $_GET['action'] ?? $_POST['action'] ?? '';
// La API Key solo se lee del servidor (.tmdb_api_key); nunca viaja desde ni hacia el navegador.
$apiKey = $serverApiKey;

// 1. Guardar API Key (fichero seguro) y opciones (config.json) en el servidor
if ($action === 'save_key' || $action === 'save_config') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        sendJson(['success' => false, 'error' => 'Método no permitido'], 405);
    }
    $cfg = loadConfig($configFile);
    if (isset($_POST['api_key'])) {
        if (!tmdb_set_key((string) $_POST['api_key'])) {
            sendJson(['success' => false, 'error' => 'API Key con formato no válido o no se pudo guardar'], 400);
        }
    }
    if (isset($_POST['margin_threshold'])) {
        if (!isset($cfg['margin']) || !is_array($cfg['margin'])) {
            $cfg['margin'] = [];
        }
        $cfg['margin']['threshold'] = max(1, min(100, intval($_POST['margin_threshold'])));
    }
    if (isset($_POST['margin_percent'])) {
        if (!isset($cfg['margin']) || !is_array($cfg['margin'])) {
            $cfg['margin'] = [];
        }
        $cfg['margin']['percent'] = max(1, min(40, intval($_POST['margin_percent'])));
    }
    saveConfig($configFile, $cfg);
    $savedKey = tmdb_get_key();
    sendJson([
        'success' => true,
        'has_key' => $savedKey !== '',
        'api_key_masked' => tmdb_mask_key($savedKey),
        'margin' => $cfg['margin'] ?? ['threshold' => 18, 'percent' => 14]
    ]);
}

// 2. Obtener estado de configuración, margen y estadísticas de caché
if ($action === 'get_config') {
    $cfg = loadConfig($configFile);
    $curKey = tmdb_get_key();
    $cacheInfo = getCacheInfo($cacheDir);
    sendJson([
        'success' => true,
        'has_server_key' => $curKey !== '',
        'api_key_masked' => tmdb_mask_key($curKey),
        'margin' => $cfg['margin'] ?? ['threshold' => 18, 'percent' => 14],
        'cache' => $cacheInfo
    ]);
}

// 3. Consultar estadísticas de la caché
if ($action === 'get_cache_info') {
    sendJson([
        'success' => true,
        'cache' => getCacheInfo($cacheDir)
    ]);
}

// 4. Limpiar caché de archivos locales
if ($action === 'clear_cache') {
    $result = clearCacheDir($cacheDir);
    sendJson([
        'success' => true,
        'deleted_count' => $result['deleted_count'],
        'freed_bytes' => $result['freed_bytes'],
        'freed_formatted' => $result['freed_formatted'],
        'message' => "Se han eliminado {$result['deleted_count']} archivos de caché ({$result['freed_formatted']} liberados)."
    ]);
}

// 3. Modo Directo / Extracción sin API Key o por ID con API Key
if ($action === 'fetch_direct') {
    $query = trim($_REQUEST['query'] ?? '');
    $type = trim($_REQUEST['type'] ?? 'auto'); // 'auto', 'movie', 'tv'

    if (empty($query)) {
        sendJson(['success' => false, 'error' => 'Se requiere un ID o enlace de TMDb'], 400);
    }

    $id = '';
    $slug = '';
    $detectedType = 'movie';

    if (preg_match('~themoviedb\.org/(movie|tv)/([0-9]+)(-[^/?#]+)?~i', $query, $mUrl)) {
        $detectedType = $mUrl[1];
        $id = $mUrl[2];
        $slug = $mUrl[3] ?? '';
    } elseif (preg_match('~^(movie|tv)/([0-9]+)~i', $query, $mShort)) {
        $detectedType = $mShort[1];
        $id = $mShort[2];
    } elseif (ctype_digit($query)) {
        $id = $query;
        $detectedType = ($type === 'tv') ? 'tv' : 'movie';
    } else {
        if (preg_match('~\b([0-9]{2,10})\b~', $query, $mDigits)) {
            $id = $mDigits[1];
            $detectedType = ($type === 'tv') ? 'tv' : 'movie';
        } else {
            sendJson(['success' => false, 'error' => 'No se detectó un ID o enlace válido de TMDb'], 400);
        }
    }

    // Caché configurable (por defecto 24 horas) para respuesta rápida
    $cacheKey = "tmdb_{$detectedType}_{$id}" . (empty($apiKey) ? '_direct' : '_api') . ".json";
    $cacheFile = $cacheDir . DIRECTORY_SEPARATOR . $cacheKey;
    if (file_exists($cacheFile) && (time() - filemtime($cacheFile) < $cacheTtl)) {
        $cachedData = @json_decode(file_get_contents($cacheFile), true);
        if ($cachedData && !empty($cachedData['success'])) {
            sendJson($cachedData);
        }
    }

    // A. Si hay API Key disponible, consultar la API oficial
    if (!empty($apiKey)) {
        $apiUrl = "https://api.themoviedb.org/3/{$detectedType}/{$id}?api_key=" . rawurlencode($apiKey) . "&language=es-ES";
        $apiRes = tmdbCurl($apiUrl);
        if ($apiRes['status'] === 200) {
            $data = json_decode($apiRes['body'], true);
            $title = $data['title'] ?? $data['name'] ?? '';
            $releaseDate = $data['release_date'] ?? $data['first_air_date'] ?? '';
            $year = !empty($releaseDate) ? substr($releaseDate, 0, 4) : '';
            $posterPath = $data['poster_path'] ?? '';

            // Obtener imágenes
            $imagesUrl = "https://api.themoviedb.org/3/{$detectedType}/{$id}/images?api_key=" . rawurlencode($apiKey);
            $imgRes = tmdbCurl($imagesUrl);
            $posters = [];
            if ($imgRes['status'] === 200) {
                $imgData = json_decode($imgRes['body'], true);
                if (!empty($imgData['posters'])) {
                    foreach ($imgData['posters'] as $p) {
                        $pPath = $p['file_path'];
                        $pLang = strtolower($p['iso_639_1'] ?? 'xx');
                        $priority = 5;
                        $langCategory = 'other';
                        if ($pLang === 'es') {
                            $priority = 1;
                            $langCategory = 'es-es';
                        } elseif ($pLang === 'en') {
                            $priority = 3;
                            $langCategory = 'en';
                        } elseif ($pLang === 'xx' || empty($pLang) || $pLang === 'null') {
                            $priority = 4;
                            $langCategory = 'textless';
                        }

                        $posters[] = [
                            'original_url' => "https://image.tmdb.org/t/p/original" . $pPath,
                            'thumb_url' => "https://image.tmdb.org/t/p/w220_and_h330_face" . $pPath,
                            'lang' => $pLang,
                            'lang_category' => $langCategory,
                            'size' => ($p['width'] ?? '') ? ($p['width'] . 'x' . ($p['height'] ?? '')) : '',
                            'priority' => $priority
                        ];
                    }
                    usort($posters, fn($a, $b) => $a['priority'] <=> $b['priority']);
                }
            }

            if (!empty($posterPath) && empty($posters)) {
                $posters[] = [
                    'original_url' => "https://image.tmdb.org/t/p/original" . $posterPath,
                    'thumb_url' => "https://image.tmdb.org/t/p/w220_and_h330_face" . $posterPath,
                    'lang' => 'es',
                    'lang_category' => 'es-es',
                    'size' => '',
                    'priority' => 1
                ];
            }

            $displayName = $title;
            if (!empty($year) && !preg_match('/\(\s*' . preg_quote($year, '/') . '\s*\)\s*$/', $title)) {
                $displayName = "{$title} ({$year})";
            }

            $responsePayload = [
                'success' => true,
                'source' => 'api',
                'id' => $id,
                'type' => $detectedType,
                'title' => $title,
                'year' => $year,
                'display_name' => $displayName,
                'poster_url' => !empty($posterPath) ? "https://image.tmdb.org/t/p/original" . $posterPath : ($posters[0]['original_url'] ?? ''),
                'posters' => $posters
            ];

            @file_put_contents($cacheFile, json_encode($responsePayload, JSON_UNESCAPED_SLASHES));
            sendJson($responsePayload);
        }
    }

    // B. Modo Directo: Scraping optimizado en paralelo (página principal + posters ES + posters EN)
    $parallelRequests = [
        'main' => [
            'url' => "https://www.themoviedb.org/{$detectedType}/{$id}{$slug}",
            'headers' => ["Accept-Language: es-ES,es;q=0.9,en;q=0.8"]
        ],
        'posters_es' => [
            'url' => "https://www.themoviedb.org/{$detectedType}/{$id}/images/posters",
            'headers' => ["Accept-Language: es-ES,es;q=0.9,en;q=0.8"]
        ],
        'posters_en' => [
            'url' => "https://www.themoviedb.org/{$detectedType}/{$id}/images/posters?language=en",
            'headers' => ["Accept-Language: en-US,en;q=0.9"]
        ]
    ];

    $parallelResults = tmdbCurlParallel($parallelRequests);
    $mainRes = $parallelResults['main'];

    // Si da 404 y tipo era auto, probar el tipo contrario (movie <-> tv)
    if ($mainRes['status'] === 404 && $type === 'auto') {
        $detectedType = ($detectedType === 'movie') ? 'tv' : 'movie';
        $parallelRequests['main']['url'] = "https://www.themoviedb.org/{$detectedType}/{$id}";
        $parallelRequests['posters_es']['url'] = "https://www.themoviedb.org/{$detectedType}/{$id}/images/posters";
        $parallelRequests['posters_en']['url'] = "https://www.themoviedb.org/{$detectedType}/{$id}/images/posters?language=en";
        $parallelResults = tmdbCurlParallel($parallelRequests);
        $mainRes = $parallelResults['main'];
    }

    if ($mainRes['status'] !== 200 || empty($mainRes['body'])) {
        sendJson(['success' => false, 'error' => "No se encontró el contenido en TMDb (HTTP {$mainRes['status']})"], 404);
    }

    $html = $mainRes['body'];

    // Extraer título en español
    preg_match("/<meta property=\"og:title\" content=\"([^\"]+)\"/i", $html, $mTitle);
    $title = !empty($mTitle[1]) ? html_entity_decode($mTitle[1], ENT_QUOTES, 'UTF-8') : '';

    // Extraer año
    preg_match("/<title>([^<]+)<\/title>/i", $html, $mPageTitle);
    $pageTitle = !empty($mPageTitle[1]) ? html_entity_decode($mPageTitle[1], ENT_QUOTES, 'UTF-8') : '';
    $year = '';
    if (preg_match('/\(.*?\b(19\d{2}|20\d{2})\b.*?\)/', $pageTitle, $mYear)) {
        $year = $mYear[1];
    }

    // Extraer imagen principal de og:image
    preg_match_all("/<meta property=\"og:image\" content=\"([^\"]+)\"/i", $html, $mImages);
    $mainPoster = '';
    if (!empty($mImages[1])) {
        foreach ($mImages[1] as $img) {
            if (strpos($img, '/w500/') !== false || strpos($img, 'face') !== false) {
                $mainPoster = preg_replace('~/t/p/w[0-9]+[^/]*/~', '/t/p/original/', $img);
                $mainPoster = str_replace('media.themoviedb.org', 'image.tmdb.org', $mainPoster);
                break;
            }
        }
        if (empty($mainPoster) && !empty($mImages[1][0])) {
            $mainPoster = preg_replace('~/t/p/w[0-9]+[^/]*/~', '/t/p/original/', $mImages[1][0]);
            $mainPoster = str_replace('media.themoviedb.org', 'image.tmdb.org', $mainPoster);
        }
    }

    // Parsear pósters de las respuestas ES y EN
    $postersList = [];
    $seenFiles = [];

    foreach (['posters_es', 'posters_en'] as $key) {
        $body = $parallelResults[$key]['body'] ?? '';
        if (empty($body)) continue;

        $parts = preg_split("~<div[^>]*class=\"[^\"]*image_content[^\"]*\"~i", $body);
        array_shift($parts);

        foreach ($parts as $p) {
            if (!preg_match('~/t/p/original/([a-zA-Z0-9_-]+\.(jpg|png|webp))~i', $p, $mFile)) continue;
            $file = $mFile[1];
            if (isset($seenFiles[$file])) continue;
            $seenFiles[$file] = true;

            // Tamaño
            $size = "";
            if (preg_match("/Tamaño\s*([0-9]+x[0-9]+)/i", $p, $mSize)) {
                $size = $mSize[1];
            }

            // Idioma y región
            $lang = "xx";
            if (preg_match("/data-language=\"([^\"]+)\"/i", $p, $mLang)) {
                $lang = strtolower($mLang[1]);
            } elseif (preg_match('/value="([a-z]{2}(?:-[A-Z]{2})?)"/i', $p, $mLangVal)) {
                $lang = strtolower(substr($mLangVal[1], 0, 2));
            }

            $region = "";
            if (preg_match("/data-region=\"([^\"]+)\"/i", $p, $mReg)) {
                $region = strtoupper($mReg[1]);
            }

            $fullLang = $lang;
            if ($region && $lang !== "xx") {
                $fullLang = "{$lang}-{$region}";
            }

            // Categorización y ordenación prioritaria:
            // 1: España (es-es)
            // 2: Latino (es-mx u otros es-*)
            // 3: Inglés (en)
            // 4: Sin texto (textless / xx)
            // 5: Otros
            $priority = 5;
            $langCategory = 'other';
            $langLower = strtolower($fullLang);

            if ($langLower === 'es-es' || $langLower === 'es' || $langLower === 'es_es') {
                $priority = 1;
                $langCategory = 'es-es';
            } elseif ($langLower === 'es-mx' || preg_match('/^es-(mx|ar|co|cl|pe|ve|419)/', $langLower)) {
                $priority = 2;
                $langCategory = 'es-mx';
            } elseif (str_starts_with($langLower, 'es-')) {
                $priority = 1;
                $langCategory = 'es-es';
            } elseif ($lang === 'en' || str_starts_with($langLower, 'en-') || $langLower === 'en_us') {
                $priority = 3;
                $langCategory = 'en';
            } elseif ($lang === 'xx' || empty($lang) || $lang === 'null') {
                $priority = 4;
                $langCategory = 'textless';
            }

            $postersList[] = [
                'file' => $file,
                'original_url' => "https://image.tmdb.org/t/p/original/{$file}",
                'thumb_url' => "https://image.tmdb.org/t/p/w220_and_h330_face/{$file}",
                'size' => $size,
                'lang' => $fullLang,
                'lang_category' => $langCategory,
                'priority' => $priority
            ];
        }
    }

    // Ordenar por prioridad
    usort($postersList, function($a, $b) {
        if ($a['priority'] !== $b['priority']) {
            return $a['priority'] <=> $b['priority'];
        }
        return 0;
    });

    if (empty($mainPoster) && !empty($postersList)) {
        $mainPoster = $postersList[0]['original_url'];
    }

    if (empty($mainPoster)) {
        sendJson(['success' => false, 'error' => 'No se encontró un póster en la ficha de TMDb'], 404);
    }

    $displayName = $title;
    if (!empty($year) && !preg_match('/\(\s*' . preg_quote($year, '/') . '\s*\)\s*$/', $title)) {
        $displayName = "{$title} ({$year})";
    }

    $responsePayload = [
        'success' => true,
        'source' => 'direct',
        'id' => $id,
        'type' => $detectedType,
        'title' => $title,
        'year' => $year,
        'display_name' => $displayName,
        'poster_url' => $mainPoster,
        'posters' => $postersList
    ];

    @file_put_contents($cacheFile, json_encode($responsePayload, JSON_UNESCAPED_SLASHES));
    sendJson($responsePayload);
}

// 4. Búsqueda por título con API Key
if ($action === 'search') {
    $searchQuery = trim($_REQUEST['query'] ?? '');
    if (empty($searchQuery)) {
        sendJson(['success' => false, 'error' => 'Se requiere un término de búsqueda'], 400);
    }
    if (empty($apiKey)) {
        sendJson(['success' => false, 'error' => 'Se requiere una API Key de TMDb para buscar por título. Puedes configurarla arriba o usar la pestaña de ID / Enlace directo.'], 400);
    }

    $apiUrl = "https://api.themoviedb.org/3/search/multi?api_key=" . rawurlencode($apiKey) . "&language=es-ES&query=" . urlencode($searchQuery);
    $res = tmdbCurl($apiUrl);

    if ($res['status'] !== 200) {
        sendJson(['success' => false, 'error' => 'Error al comunicarse con la API de TMDb'], 500);
    }

    $data = json_decode($res['body'], true);
    $results = [];

    if (!empty($data['results'])) {
        foreach ($data['results'] as $item) {
            $mediaType = $item['media_type'] ?? 'movie';
            if ($mediaType !== 'movie' && $mediaType !== 'tv') continue;

            $itemTitle = $item['title'] ?? $item['name'] ?? '';
            $origTitle = $item['original_title'] ?? $item['original_name'] ?? '';
            $date = $item['release_date'] ?? $item['first_air_date'] ?? '';
            $year = !empty($date) ? substr($date, 0, 4) : '';
            $posterPath = $item['poster_path'] ?? '';

            $results[] = [
                'id' => $item['id'],
                'type' => $mediaType,
                'title' => $itemTitle,
                'original_title' => $origTitle,
                'year' => $year,
                'overview' => $item['overview'] ?? '',
                'poster_thumb' => !empty($posterPath) ? "https://image.tmdb.org/t/p/w220_and_h330_face{$posterPath}" : null,
                'poster_original' => !empty($posterPath) ? "https://image.tmdb.org/t/p/original{$posterPath}" : null
            ];
        }
    }

    sendJson([
        'success' => true,
        'results' => $results
    ]);
}

sendJson(['success' => false, 'error' => 'Acción no válida'], 400);
