<?php
/**
 * Centro de Descargas - Punto de entrada unificado PHP
 * Ejecuta el escaneo en vivo en cada visita e inyecta los datos inmediatamente en la página.
 */
require_once __DIR__ . '/actualizar_arbol.php';
?>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Centro de Descargas | Explorador de Ficheros</title>
    <meta name="description" content="Explorador en árbol de directorios y descarga directa de archivos con HTML, JS y CSS.">
    <link rel="stylesheet" href="estilo.css?v=<?php echo filemtime(__DIR__ . '/estilo.css'); ?>">
    <script>
        (function() {
            const t = localStorage.getItem('suite_theme') || 'dark';
            document.documentElement.setAttribute('data-theme', t);
        })();
        // Datos del árbol inyectados en vivo en cada carga
        window.TREE_DATA = <?php echo $jsonStr; ?>;
    </script>
</head>
<body>
    <!-- Encabezado Principal Compartido -->
    <header class="app-header">
        <div class="brand">
            <div class="brand-icon" aria-hidden="true">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                    <polyline points="7 10 12 15 17 10"></polyline>
                    <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
            </div>
            <div class="brand-info">
                <h1>Centro de Descargas</h1>
                <p>Explorador en árbol & copiado directo de URL</p>
            </div>
        </div>

        <div class="header-badges">
            <button id="themeToggle" class="btn-theme-toggle" title="Cambiar tema (Claro / Oscuro)" aria-label="Cambiar tema" type="button">
                <svg class="icon-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="5"></circle>
                    <line x1="12" y1="1" x2="12" y2="3"></line>
                    <line x1="12" y1="21" x2="12" y2="23"></line>
                    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
                    <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
                    <line x1="1" y1="12" x2="3" y2="12"></line>
                    <line x1="21" y1="12" x2="23" y2="12"></line>
                    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
                    <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
                </svg>
                <svg class="icon-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:none;">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
                </svg>
            </button>
        </div>
    </header>

    <!-- Contenedor Principal del Explorador -->
    <main class="explorer-container">
        <!-- Panel Lateral Izquierdo: Árbol de Directorios -->
        <aside class="tree-panel" aria-label="Estructura de carpetas">
            <div class="tree-header">
                <span class="tree-title">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color: var(--primary);">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                    </svg>
                    Directorios
                </span>
                <div class="tree-actions">
                    <button id="btnExpandAll" class="btn-tree-tool" title="Expandir todas las carpetas" type="button">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"></polyline></svg>
                    </button>
                    <button id="btnCollapseAll" class="btn-tree-tool" title="Colapsar carpetas" type="button">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="18 15 12 9 6 15"></polyline></svg>
                    </button>
                </div>
            </div>

            <!-- Contenido dinámico del árbol -->
            <div id="treeRoot" class="tree-content">
                <!-- Se inyecta con script.js -->
            </div>
        </aside>

        <!-- Panel Principal Derecho: Explorador de la Carpeta Actual -->
        <section class="main-panel">
            <!-- Barra Superior: Breadcrumbs y Búsqueda -->
            <div class="explorer-top-bar">
                <nav id="breadcrumbs" class="breadcrumbs" aria-label="Ruta actual">
                    <!-- Se inyectan las migas de pan con script.js -->
                </nav>

                <div class="explorer-search-box">
                    <svg class="search-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                    </svg>
                    <input type="text" id="searchInput" class="search-input" placeholder="Buscar en todas las carpetas..." autocomplete="off">
                </div>

                <div class="top-bar-actions">
                    <button id="btnRefreshTree" class="btn-view-mode" title="Actualizar árbol de directorios ahora" type="button" style="width: auto; padding: 0 12px; gap: 6px; font-weight: 600; font-size: 13px;">
                        <svg class="refresh-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
                        <span>Actualizar</span>
                    </button>
                    <div class="btn-view-toggle">
                        <button id="btnViewList" class="btn-view-mode active" title="Vista en lista" type="button">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="6"></line><line x1="3" y1="12" x2="3.01" y2="12"></line><line x1="3" y1="18" x2="3.01" y2="18"></line></svg>
                        </button>
                        <button id="btnViewGrid" class="btn-view-mode" title="Vista en cuadrícula" type="button">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>
                        </button>
                    </div>
                </div>
            </div>

            <!-- Contenido de Ficheros y Carpetas -->
            <div class="content-card">
                <div class="content-header">
                    <div id="currentFolderTitle" class="current-folder-info">
                        <!-- Icono y nombre de la carpeta actual -->
                    </div>
                    <div id="folderStats" class="folder-stats">
                        <!-- Cantidad de elementos -->
                    </div>
                </div>

                <!-- Lista de Ficheros y Subcarpetas -->
                <div id="itemsContainer" class="items-list">
                    <!-- Se inyecta con script.js -->
                </div>
            </div>
        </section>
    </main>

    <!-- Notificación Toast Flotante -->
    <div id="toast" class="toast-msg" role="status" aria-live="polite">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
        <span id="toastText">¡URL copiada al portapapeles!</span>
    </div>

    <!-- Pie -->
    <footer class="app-footer">
        <p>Centro de Descargas · Árbol de Directorios 100% Dinámico</p>
    </footer>

    <script src="script.js?v=<?php echo filemtime(__DIR__ . '/script.js'); ?>"></script>
</body>
</html>
