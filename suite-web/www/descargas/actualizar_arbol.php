<?php
/**
 * Escaneo dinámico y recursivo de archivos y directorios para el Centro de Descargas.
 * Detecta tanto archivos en la raíz de descargas como en cualquier subcarpeta (incluyendo descargas/descargas).
 */

$rootDir = __DIR__;

function formatBytes($bytes) {
    if ($bytes >= 1073741824) return number_format($bytes / 1073741824, 2) . ' GB';
    if ($bytes >= 1048576) return number_format($bytes / 1048576, 2) . ' MB';
    if ($bytes >= 1024) return number_format($bytes / 1024, 1) . ' KB';
    return $bytes . ' B';
}

function getCategoryAndIcon($ext) {
    $e = strtolower($ext);
    if (in_array($e, ['zip', 'rar', '7z', 'tar', 'gz', 'bz2'])) return ['category' => 'Archivo comprimido', 'icon' => 'zip'];
    if (in_array($e, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico'])) return ['category' => 'Imagen', 'icon' => 'image'];
    if (in_array($e, ['mp4', 'mkv', 'avi', 'mov', 'webm', 'ts'])) return ['category' => 'Video', 'icon' => 'video'];
    if (in_array($e, ['mp3', 'flac', 'wav', 'ogg', 'm4a', 'aac'])) return ['category' => 'Audio', 'icon' => 'audio'];
    if (in_array($e, ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'nfo', 'log'])) return ['category' => 'Documento', 'icon' => 'doc'];
    if (in_array($e, ['apk'])) return ['category' => 'App Android (APK)', 'icon' => 'apk'];
    if (in_array($e, ['exe', 'msi'])) return ['category' => 'Instalador Windows', 'icon' => 'exe'];
    if (in_array($e, ['dmg', 'pkg'])) return ['category' => 'Instalador macOS', 'icon' => 'dmg'];
    if (in_array($e, ['deb', 'rpm', 'appimage'])) return ['category' => 'Paquete Linux', 'icon' => 'linux'];
    if (in_array($e, ['iso', 'bin', 'cue', 'img'])) return ['category' => 'Imagen de disco', 'icon' => 'disc'];
    if (in_array($e, ['js', 'ts', 'html', 'css', 'php', 'py', 'sh', 'json', 'sql', 'xml', 'yaml', 'yml'])) return ['category' => 'Código / Script', 'icon' => 'code'];
    return ['category' => 'Archivo', 'icon' => 'default'];
}

function scanDirectoryRecursively($dir, $relativePrefix = '') {
    $excluidos = [
        'actualizar_arbol.php',
        'actualizar_arbol.sh',
        'estilo.css',
        'index.html',
        'index.php',
        'script.js',
        'tree.json',
        'tree-data.js',
        '404.html',
        '.htaccess',
        '.gitignore',
        '.git',
        '.DS_Store',
        'favicon.ico'
    ];

    if (!is_dir($dir)) return [];

    $items = scandir($dir);
    if ($items === false) return [];

    $dirs = [];
    $files = [];

    foreach ($items as $item) {
        if ($item === '.' || $item === '..' || str_starts_with($item, '.')) continue;
        if (empty($relativePrefix) && in_array($item, $excluidos)) continue;

        $fullPath = $dir . DIRECTORY_SEPARATOR . $item;
        $relPath = $relativePrefix ? ($relativePrefix . '/' . $item) : $item;

        if (is_dir($fullPath)) {
            $subChildren = scanDirectoryRecursively($fullPath, $relPath);
            $dirs[] = [
                'name' => $item,
                'path' => $relPath,
                'type' => 'directory',
                'children' => $subChildren
            ];
        } else {
            $sz = @filesize($fullPath) ?: 0;
            $tm = @filemtime($fullPath) ?: time();
            $ext = pathinfo($item, PATHINFO_EXTENSION);
            $cat = getCategoryAndIcon($ext);

            $files[] = [
                'name' => $item,
                'path' => $relPath,
                'type' => 'file',
                'extension' => $ext,
                'size_bytes' => $sz,
                'size_formatted' => formatBytes($sz),
                'mtime' => $tm,
                'date_formatted' => date('d/m/Y H:i', $tm),
                'category' => $cat['category'],
                'icon' => $cat['icon']
            ];
        }
    }

    usort($dirs, fn($a, $b) => strcasecmp($a['name'], $b['name']));
    usort($files, fn($a, $b) => strcasecmp($a['name'], $b['name']));

    return array_merge($dirs, $files);
}

function generarArbolDescargas() {
    global $rootDir;
    
    $downloadsSubdir = $rootDir . '/descargas';
    $children = [];

    // Si existe subdirectorio descargas/, escaneamos sus hijos directamente
    if (is_dir($downloadsSubdir)) {
        $children = scanDirectoryRecursively($downloadsSubdir, 'descargas');
    }

    // Además, escaneamos la raíz de descargas para detectar cualquier archivo o carpeta nueva añadida
    $itemsRaiz = scandir($rootDir);
    $excluidos = [
        'actualizar_arbol.php', 'actualizar_arbol.sh', 'estilo.css', 'index.html',
        'index.php', 'script.js', 'tree.json', 'tree-data.js', '404.html',
        '.htaccess', '.gitignore', '.git', '.DS_Store', 'favicon.ico', 'descargas'
    ];

    if ($itemsRaiz !== false) {
        foreach ($itemsRaiz as $item) {
            if ($item === '.' || $item === '..' || str_starts_with($item, '.') || in_array($item, $excluidos)) continue;
            
            $fullPath = $rootDir . DIRECTORY_SEPARATOR . $item;
            if (is_dir($fullPath)) {
                $sub = scanDirectoryRecursively($fullPath, $item);
                $children[] = [
                    'name' => $item,
                    'path' => $item,
                    'type' => 'directory',
                    'children' => $sub
                ];
            } else {
                $sz = @filesize($fullPath) ?: 0;
                $tm = @filemtime($fullPath) ?: time();
                $ext = pathinfo($item, PATHINFO_EXTENSION);
                $cat = getCategoryAndIcon($ext);
                $children[] = [
                    'name' => $item,
                    'path' => $item,
                    'type' => 'file',
                    'extension' => $ext,
                    'size_bytes' => $sz,
                    'size_formatted' => formatBytes($sz),
                    'mtime' => $tm,
                    'date_formatted' => date('d/m/Y H:i', $tm),
                    'category' => $cat['category'],
                    'icon' => $cat['icon']
                ];
            }
        }
    }

    // Ordenar elementos principales: primero carpetas y luego ficheros
    $finalDirs = [];
    $finalFiles = [];
    foreach ($children as $c) {
        if ($c['type'] === 'directory') $finalDirs[] = $c;
        else $finalFiles[] = $c;
    }
    usort($finalDirs, fn($a, $b) => strcasecmp($a['name'], $b['name']));
    usort($finalFiles, fn($a, $b) => strcasecmp($a['name'], $b['name']));

    $tree = [
        'name' => 'descargas',
        'path' => 'descargas',
        'type' => 'directory',
        'children' => array_merge($finalDirs, $finalFiles)
    ];

    $jsonStr = json_encode($tree, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);

    // Guardar respaldo en disco
    @file_put_contents($rootDir . '/tree.json', $jsonStr);
    @file_put_contents($rootDir . '/tree-data.js', "window.TREE_DATA = " . $jsonStr . ";\n");

    return [$tree, $jsonStr];
}

// Ejecución
[$tree, $jsonStr] = generarArbolDescargas();

// Si es llamado directamente como API vía HTTP o AJAX
if (isset($_GET['api']) || (php_sapi_name() !== 'cli' && basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'actualizar_arbol.php')) {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    header('Expires: 0');
    echo $jsonStr;
    exit;
}
