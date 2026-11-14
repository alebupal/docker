/**
 * Centro de Descargas - Árbol de Directorios y Explorador de Ficheros
 * 100% Vanilla HTML5, CSS3 y JavaScript
 */

document.addEventListener('DOMContentLoaded', () => {
    // --- Referencias del DOM ---
    const treeRoot = document.getElementById('treeRoot');
    const breadcrumbs = document.getElementById('breadcrumbs');
    const itemsContainer = document.getElementById('itemsContainer');
    const searchInput = document.getElementById('searchInput');
    const btnExpandAll = document.getElementById('btnExpandAll');
    const btnCollapseAll = document.getElementById('btnCollapseAll');
    const btnViewList = document.getElementById('btnViewList');
    const btnViewGrid = document.getElementById('btnViewGrid');
    const btnRefreshTree = document.getElementById('btnRefreshTree');
    const currentFolderTitle = document.getElementById('currentFolderTitle');
    const folderStats = document.getElementById('folderStats');
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toastText');

    // Estado de la aplicación
    let rootTree = window.TREE_DATA || null;
    let currentPath = ''; // Ruta relativa actual ('', 'descargas', 'documentos', etc.)
    let currentView = 'list'; // 'list' | 'grid'
    let isSearching = false;
    let toastTimeout = null;

    // Inicialización: si ya tenemos datos embebidos en window.TREE_DATA, renderizamos al instante
    if (rootTree) {
        inicializarExplorador();
    }

    // Si estamos en un entorno web (HTTP/HTTPS), consultamos el escáner PHP sin caché
    if (window.location.protocol.startsWith('http')) {
        recargarArbolDesdeServidor(false);
    } else if (!rootTree) {
        usarRespaldoEstatico();
    }

    function recargarArbolDesdeServidor(manual = false) {
        if (btnRefreshTree && manual) {
            btnRefreshTree.classList.add('loading');
        }

        // Manual = escaneo nuevo; al cargar se reutiliza el último escaneo reciente del servidor
        const url = 'actualizar_arbol.php?api=1' + (manual ? '&force=1' : '') + '&_t=' + Date.now();
        fetch(url, {
            cache: 'no-store',
            headers: {
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache'
            }
        })
        .then(res => {
            if (!res.ok) throw new Error('Respuesta HTTP no OK: ' + res.status);
            return res.json();
        })
        .then(data => {
            if (data && data.children) {
                rootTree = data;
                window.TREE_DATA = data;
                renderizarArbolDirectorios();
                navegarACarpeta(currentPath || 'descargas');
                if (manual) mostrarToast('¡Árbol de directorios actualizado con éxito!');
            }
        })
        .catch(err => {
            console.warn('Aviso: no se pudo actualizar dinámicamente desde actualizar_arbol.php:', err);
            if (!rootTree) usarRespaldoEstatico();
            if (manual) mostrarToast('No se pudo conectar con el escáner PHP');
        })
        .finally(() => {
            if (btnRefreshTree) {
                btnRefreshTree.classList.remove('loading');
            }
        });
    }

    function usarRespaldoEstatico() {
        if (window.TREE_DATA) {
            rootTree = window.TREE_DATA;
            inicializarExplorador();
        } else {
            fetch('tree.json?_t=' + Date.now(), { cache: 'no-store' })
                .then(res => res.json())
                .then(data => {
                    rootTree = data;
                    inicializarExplorador();
                })
                .catch(err => {
                    console.error('Error al cargar datos del árbol:', err);
                    mostrarErrorCarga();
                });
        }
    }

    function inicializarExplorador() {
        renderizarArbolDirectorios();
        navegarACarpeta(currentPath || 'descargas');
        configurarEventos();
    }

    // --- Configuración de Eventos ---
    function configurarEventos() {
        if (btnRefreshTree) {
            btnRefreshTree.addEventListener('click', () => {
                recargarArbolDesdeServidor(true);
            });
        }
        if (btnExpandAll) {
            btnExpandAll.addEventListener('click', () => {
                document.querySelectorAll('.tree-node').forEach(node => {
                    node.classList.add('expanded');
                });
            });
        }

        if (btnCollapseAll) {
            btnCollapseAll.addEventListener('click', () => {
                document.querySelectorAll('.tree-node').forEach(node => {
                    node.classList.remove('expanded');
                });
            });
        }

        if (btnViewList && btnViewGrid) {
            btnViewList.addEventListener('click', () => {
                currentView = 'list';
                btnViewList.classList.add('active');
                btnViewGrid.classList.remove('active');
                actualizarVistaContenido();
            });

            btnViewGrid.addEventListener('click', () => {
                currentView = 'grid';
                btnViewGrid.classList.add('active');
                btnViewList.classList.remove('active');
                actualizarVistaContenido();
            });
        }

        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const query = e.target.value.trim().toLowerCase();
                if (query.length > 0) {
                    isSearching = true;
                    buscarEnTodoElArbol(query);
                } else {
                    isSearching = false;
                    navegarACarpeta(currentPath);
                }
            });
        }
    }

    // --- 1. Renderizado del Árbol de Directorios (Panel Izquierdo) ---
    function renderizarArbolDirectorios() {
        if (!treeRoot || !rootTree) return;
        treeRoot.innerHTML = '';

        // Nodo raíz
        const rootNode = crearNodoArbol(rootTree, true);
        treeRoot.appendChild(rootNode);
    }

    function crearNodoArbol(item, isRoot = false) {
        if (item.type !== 'directory') return document.createDocumentFragment();

        const node = document.createElement('div');
        node.className = 'tree-node expanded';
        node.setAttribute('data-path', item.path);

        const subdirectorios = (item.children || []).filter(c => c.type === 'directory');
        const totalArchivos = contarArchivosRecursivo(item);

        const row = document.createElement('div');
        row.className = 'tree-item-row' + (item.path === currentPath ? ' active' : '');

        // Toggle icon (flecha)
        const toggleIcon = document.createElement('span');
        toggleIcon.className = 'tree-toggle-icon';
        toggleIcon.innerHTML = subdirectorios.length > 0 
            ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"></polyline></svg>'
            : '<span style="width:12px;display:inline-block;"></span>';

        toggleIcon.addEventListener('click', (e) => {
            e.stopPropagation();
            if (subdirectorios.length > 0) {
                node.classList.toggle('expanded');
            }
        });

        // Folder Icon
        const folderIcon = document.createElement('span');
        folderIcon.className = 'tree-folder-icon';
        folderIcon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>';

        // Label
        const label = document.createElement('span');
        label.className = 'tree-label';
        label.textContent = isRoot ? 'Raíz (descargas)' : item.name;

        // Badge count
        const badge = document.createElement('span');
        badge.className = 'tree-badge-count';
        badge.textContent = totalArchivos;

        row.appendChild(toggleIcon);
        row.appendChild(folderIcon);
        row.appendChild(label);
        row.appendChild(badge);

        row.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            isSearching = false;
            navegarACarpeta(item.path);
        });

        node.appendChild(row);

        // Hijos
        if (subdirectorios.length > 0) {
            const childrenContainer = document.createElement('div');
            childrenContainer.className = 'tree-children';
            subdirectorios.forEach(child => {
                childrenContainer.appendChild(crearNodoArbol(child));
            });
            node.appendChild(childrenContainer);
        }

        return node;
    }

    function contarArchivosRecursivo(dirNode) {
        let count = 0;
        (dirNode.children || []).forEach(child => {
            if (child.type === 'file') {
                count++;
            } else if (child.type === 'directory') {
                count += contarArchivosRecursivo(child);
            }
        });
        return count;
    }

    // --- 2. Navegación y Breadcrumbs ---
    function navegarACarpeta(relPath) {
        currentPath = relPath;
        actualizarSeleccionArbol(relPath);
        actualizarBreadcrumbs(relPath);
        actualizarVistaContenido();
    }

    function actualizarSeleccionArbol(path) {
        document.querySelectorAll('.tree-item-row').forEach(row => {
            row.classList.remove('active');
        });
        const selectedNode = document.querySelector(`.tree-node[data-path="${CSS.escape(path)}"] > .tree-item-row`);
        if (selectedNode) {
            selectedNode.classList.add('active');
            // Asegurar que sus padres estén expandidos
            let parent = selectedNode.closest('.tree-node').parentElement.closest('.tree-node');
            while (parent) {
                parent.classList.add('expanded');
                parent = parent.parentElement.closest('.tree-node');
            }
        }
    }

    function actualizarBreadcrumbs(relPath) {
        if (!breadcrumbs) return;
        breadcrumbs.innerHTML = '';

        // Botón Raíz (descargas)
        const rootItem = document.createElement('div');
        rootItem.className = 'breadcrumb-item' + (!relPath || relPath === 'descargas' ? ' active' : '');
        rootItem.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path>
                <polyline points="9 22 9 12 15 12 15 22"></polyline>
            </svg>
            <span>descargas</span>
        `;
        rootItem.addEventListener('click', () => navegarACarpeta('descargas'));
        breadcrumbs.appendChild(rootItem);

        if (!relPath || relPath === 'descargas') return;

        const parts = relPath.split('/').filter(Boolean);
        let acumulado = '';

        parts.forEach((part, idx) => {
            acumulado += (acumulado ? '/' : '') + part;
            if (part === 'descargas' && idx === 0) return; // Ya representado por rootItem

            const currentRoute = acumulado;
            const sep = document.createElement('span');
            sep.className = 'breadcrumb-separator';
            sep.textContent = '/';
            breadcrumbs.appendChild(sep);

            const crumb = document.createElement('div');
            crumb.className = 'breadcrumb-item' + (idx === parts.length - 1 ? ' active' : '');
            crumb.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>${escapeHtml(part)}</span>
            `;
            crumb.addEventListener('click', () => navegarACarpeta(currentRoute));
            breadcrumbs.appendChild(crumb);
        });
    }

    // --- 3. Obtener Nodo Actual ---
    function encontrarNodoPorRuta(node, path) {
        if (!path || path === 'descargas' || node.path === path) return node;
        for (const child of (node.children || [])) {
            if (child.type === 'directory') {
                if (child.path === path) return child;
                const found = encontrarNodoPorRuta(child, path);
                if (found) return found;
            }
        }
        return null;
    }

    // --- 4. Renderizado del Contenido (Carpetas + Ficheros) ---
    function actualizarVistaContenido() {
        if (!itemsContainer || !rootTree) return;

        const dirNode = encontrarNodoPorRuta(rootTree, currentPath) || rootTree;
        const subcarpetas = (dirNode.children || []).filter(c => c.type === 'directory');
        const ficheros = (dirNode.children || []).filter(c => c.type === 'file');

        // Actualizar cabecera de la carpeta actual
        if (currentFolderTitle) {
            currentFolderTitle.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#fbbf24;">
                    <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                </svg>
                <span>${currentPath ? escapeHtml(dirNode.name) : 'Directorio Raíz'}</span>
            `;
        }

        if (folderStats) {
            folderStats.textContent = `${subcarpetas.length} carpetas · ${ficheros.length} archivos`;
        }

        if (subcarpetas.length === 0 && ficheros.length === 0) {
            itemsContainer.className = 'items-list';
            itemsContainer.innerHTML = `
                <div class="empty-view">
                    <div class="empty-view-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        </svg>
                    </div>
                    <div class="empty-view-title">Esta carpeta está vacía</div>
                    <div class="empty-view-desc">No hay ficheros ni subdirectorios aquí.</div>
                </div>
            `;
            return;
        }

        if (currentView === 'grid') {
            renderizarVistaGrid(subcarpetas, ficheros);
        } else {
            renderizarVistaLista(subcarpetas, ficheros);
        }
    }

    // --- Renderizado Modo Lista ---
    function renderizarVistaLista(carpetas, ficheros) {
        itemsContainer.className = 'items-list';
        itemsContainer.innerHTML = '';

        // 1. Renderizar Carpetas primero
        carpetas.forEach(fld => {
            const row = document.createElement('div');
            row.className = 'item-row is-folder';
            const totalHijos = (fld.children || []).length;

            row.innerHTML = `
                <div class="item-icon-box folder">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <div class="item-info">
                    <span class="item-name" title="${escapeHtml(fld.name)}">${escapeHtml(fld.name)}</span>
                    <span class="item-type-label">Carpeta de archivos</span>
                </div>
                <span class="item-size">${totalHijos} ${totalHijos === 1 ? 'elemento' : 'elementos'}</span>
                <span class="item-date">—</span>
                <div class="item-actions" onclick="event.stopPropagation();">
                    <button class="btn-action-copy" title="Copiar ruta de la carpeta" type="button">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        <span>Copiar ruta</span>
                    </button>
                </div>
            `;

            row.querySelector('.btn-action-copy').addEventListener('click', (e) => {
                e.stopPropagation();
                copiarUrlAlPortapapeles(fld.path, true);
            });

            row.addEventListener('click', () => {
                navegarACarpeta(fld.path);
            });

            itemsContainer.appendChild(row);
        });

        // 2. Renderizar Ficheros
        ficheros.forEach(file => {
            const row = document.createElement('div');
            row.className = 'item-row';

            row.innerHTML = `
                <div class="item-icon-box ${escapeHtml(file.icon || 'default')}">
                    ${obtenerIconoPorTipo(file.icon)}
                </div>
                <div class="item-info">
                    <span class="item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                    <span class="item-type-label">${escapeHtml(file.category || 'Archivo')} · ${escapeHtml((file.extension || '').toUpperCase())}</span>
                </div>
                <span class="item-size">${escapeHtml(file.size_formatted)}</span>
                <span class="item-date">${escapeHtml(file.date_formatted)}</span>
                <div class="item-actions" onclick="event.stopPropagation();">
                    <button class="btn-action-copy" title="Copiar enlace directo URL al portapapeles" type="button">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        <span>Copiar URL</span>
                    </button>
                    <a href="${encodeURI(file.path)}" download="${escapeHtml(file.name)}" class="btn-action-download" title="Descargar fichero">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Descargar</span>
                    </a>
                </div>
            `;

            row.querySelector('.btn-action-copy').addEventListener('click', (e) => {
                e.stopPropagation();
                copiarUrlAlPortapapeles(file.path, false);
            });

            row.addEventListener('click', () => {
                descargarArchivo(file.path, file.name);
            });

            itemsContainer.appendChild(row);
        });
    }

    // --- Renderizado Modo Grid ---
    function renderizarVistaGrid(carpetas, ficheros) {
        itemsContainer.className = 'items-grid';
        itemsContainer.innerHTML = '';

        // Carpetas
        carpetas.forEach(fld => {
            const card = document.createElement('div');
            card.className = 'grid-card';
            const totalHijos = (fld.children || []).length;

            card.innerHTML = `
                <div class="item-icon-box folder">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path></svg>
                </div>
                <span class="item-name" title="${escapeHtml(fld.name)}">${escapeHtml(fld.name)}</span>
                <span class="grid-card-meta">${totalHijos} elementos</span>
                <div class="grid-card-actions" onclick="event.stopPropagation();">
                    <button class="btn-action-copy" type="button" title="Copiar ruta">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        <span>Ruta</span>
                    </button>
                </div>
            `;

            card.querySelector('.btn-action-copy').addEventListener('click', (e) => {
                e.stopPropagation();
                copiarUrlAlPortapapeles(fld.path, true);
            });

            card.addEventListener('click', () => {
                navegarACarpeta(fld.path);
            });

            itemsContainer.appendChild(card);
        });

        // Ficheros
        ficheros.forEach(file => {
            const card = document.createElement('div');
            card.className = 'grid-card';

            card.innerHTML = `
                <div class="item-icon-box ${escapeHtml(file.icon || 'default')}">
                    ${obtenerIconoPorTipo(file.icon)}
                </div>
                <span class="item-name" title="${escapeHtml(file.name)}">${escapeHtml(file.name)}</span>
                <span class="grid-card-meta">${escapeHtml(file.size_formatted)}</span>
                <div class="grid-card-actions" onclick="event.stopPropagation();">
                    <button class="btn-action-copy" type="button" title="Copiar URL">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        <span>URL</span>
                    </button>
                    <a href="${encodeURI(file.path)}" download="${escapeHtml(file.name)}" class="btn-action-download" title="Descargar">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                        <span>Bajar</span>
                    </a>
                </div>
            `;

            card.querySelector('.btn-action-copy').addEventListener('click', (e) => {
                e.stopPropagation();
                copiarUrlAlPortapapeles(file.path, false);
            });

            card.addEventListener('click', () => {
                descargarArchivo(file.path, file.name);
            });

            itemsContainer.appendChild(card);
        });
    }

    // --- 5. Búsqueda Global en Todo el Árbol ---
    function buscarEnTodoElArbol(query) {
        if (!itemsContainer || !rootTree) return;

        const resultados = [];
        buscarRecursivo(rootTree, query, resultados);

        if (currentFolderTitle) {
            currentFolderTitle.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="color:#06b6d4;">
                    <circle cx="11" cy="11" r="8"></circle>
                    <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <span>Resultados de búsqueda: "${escapeHtml(query)}"</span>
            `;
        }

        if (folderStats) {
            folderStats.textContent = `${resultados.length} coincidencias encontradas`;
        }

        if (resultados.length === 0) {
            itemsContainer.className = 'items-list';
            itemsContainer.innerHTML = `
                <div class="empty-view">
                    <div class="empty-view-icon">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    </div>
                    <div class="empty-view-title">Sin coincidencias</div>
                    <div class="empty-view-desc">No se encontraron ficheros ni carpetas que contengan "${escapeHtml(query)}".</div>
                </div>
            `;
            return;
        }

        const carpetas = resultados.filter(r => r.type === 'directory');
        const ficheros = resultados.filter(r => r.type === 'file');

        if (currentView === 'grid') {
            renderizarVistaGrid(carpetas, ficheros);
        } else {
            renderizarVistaLista(carpetas, ficheros);
        }
    }

    function buscarRecursivo(node, query, acc) {
        if (!node) return;
        (node.children || []).forEach(child => {
            const nombre = (child.name || '').toLowerCase();
            const ext = (child.extension || '').toLowerCase();
            const cat = (child.category || '').toLowerCase();
            const path = (child.path || '').toLowerCase();

            if (nombre.includes(query) || ext.includes(query) || cat.includes(query) || path.includes(query)) {
                acc.push(child);
            }

            if (child.type === 'directory') {
                buscarRecursivo(child, query, acc);
            }
        });
    }

    // --- 6. Función para Copiar la URL del Fichero ---
    async function copiarUrlAlPortapapeles(relPath, isFolder = false) {
        // Resolver URL completa
        let fullUrl = '';
        try {
            // Si estamos en un servidor HTTP o file://, new URL resuelve con respecto a la carpeta actual
            fullUrl = new URL(relPath, window.location.href).href;
        } catch (e) {
            fullUrl = window.location.origin + window.location.pathname + '/' + relPath;
        }

        try {
            if (navigator.clipboard && window.isSecureContext) {
                await navigator.clipboard.writeText(fullUrl);
            } else {
                const tempInput = document.createElement('textarea');
                tempInput.value = fullUrl;
                tempInput.style.position = 'fixed';
                tempInput.style.left = '-9999px';
                document.body.appendChild(tempInput);
                tempInput.focus();
                tempInput.select();
                document.execCommand('copy');
                tempInput.remove();
            }

            mostrarToast(isFolder ? '¡Ruta de carpeta copiada!' : '¡URL del fichero copiada al portapapeles!');
        } catch (err) {
            console.error('Error al copiar al portapapeles:', err);
            mostrarToast('Error al copiar la URL');
        }
    }

    function descargarArchivo(path, name) {
        const a = document.createElement('a');
        a.href = encodeURI(path);
        a.download = name || '';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }

    function mostrarToast(mensaje) {
        if (!toast || !toastText) return;
        toastText.textContent = mensaje;
        toast.classList.add('show');
        clearTimeout(toastTimeout);
        toastTimeout = setTimeout(() => {
            toast.classList.remove('show');
        }, 2200);
    }

    // --- 7. Iconos SVG por tipo de archivo ---
    function obtenerIconoPorTipo(tipo) {
        switch (tipo) {
            case 'zip':
                return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 8v13H3V8"></path><path d="M1 3h22v5H1z"></path><path d="M10 12h4"></path></svg>';
            case 'apk':
                return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="1"></circle><circle cx="16" cy="8" r="1"></circle><path d="M4 14h16v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-6z"></path><path d="M6 14V6a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8"></path></svg>';
            case 'exe':
                return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><path d="M8 12h8"></path><path d="M12 8v8"></path></svg>';
            case 'dmg':
            case 'disc':
                return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="3"></circle></svg>';
            case 'image':
                return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>';
            case 'video':
                return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18"></rect><line x1="7" y1="2" x2="7" y2="22"></line><line x1="17" y1="2" x2="17" y2="22"></line><line x1="2" y1="12" x2="22" y2="12"></line></svg>';
            case 'audio':
                return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle></svg>';
            case 'doc':
                return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line></svg>';
            case 'code':
                return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>';
            default:
                return '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"></path><polyline points="13 2 13 9 20 9"></polyline></svg>';
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function mostrarErrorCarga() {
        if (itemsContainer) {
            itemsContainer.innerHTML = `
                <div class="empty-view">
                    <div class="empty-view-icon" style="color:#ef4444;">
                        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"></circle>
                            <line x1="12" y1="8" x2="12" y2="12"></line>
                            <line x1="12" y1="16" x2="12.01" y2="16"></line>
                        </svg>
                    </div>
                    <div class="empty-view-title">No se pudo cargar el árbol de archivos</div>
                    <div class="empty-view-desc">Verifica que el servidor PHP esté activo o añade carpetas y archivos en <code>descargas/descargas/</code>.</div>
                </div>
            `;
        }
    }

    // --- 8. Gestión de Tema Claro / Oscuro Unificado ---
    function initSuiteTheme() {
        const themeToggle = document.getElementById('themeToggle');
        if (!themeToggle) return;

        const sunIcon = themeToggle.querySelector('.icon-sun');
        const moonIcon = themeToggle.querySelector('.icon-moon');

        function updateToggleIcon(t) {
            if (t === 'light') {
                if (sunIcon) sunIcon.style.display = 'none';
                if (moonIcon) moonIcon.style.display = 'block';
            } else {
                if (sunIcon) sunIcon.style.display = 'block';
                if (moonIcon) moonIcon.style.display = 'none';
            }
        }

        const current = localStorage.getItem('suite_theme') || 'dark';
        document.documentElement.setAttribute('data-theme', current);
        updateToggleIcon(current);

        themeToggle.addEventListener('click', () => {
            const active = document.documentElement.getAttribute('data-theme') || 'dark';
            const next = active === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', next);
            localStorage.setItem('suite_theme', next);
            updateToggleIcon(next);
        });
    }

    initSuiteTheme();
});
