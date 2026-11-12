/**
 * ============================================================================
 * Generador de Carátulas & Pósters 4K UHD
 * Vanilla JavaScript Moderno
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // Dimensiones estándar del póster
    const POSTER_WIDTH = 670;
    const POSTER_HEIGHT = 998;

    // Estado de la aplicación
    const state = {
        background: null,
        backgroundName: 'caratula',
        backgroundOffset: { x: 0, y: 0 },
        backgroundScale: 1,
        flipH: false,
        flipV: false,
        rotation: 0, // 0, 90, 180, 270
        blurBackground: false,
        isPreviewOriginal: false,
        cover: 'ninguno',
        filters: {
            brightness: 100,
            contrast: 100,
            saturation: 100
        },
        export: {
            format: 'image/jpeg',
            ext: 'jpg',
            quality: 0.95,
            filename: ''
        },
        viewportZoom: 0.75
    };

    // Objeto para caché de imágenes overlay
    const overlayImage = new Image();
    let isOverlayLoaded = false;

    // Elementos del DOM
    const canvas = document.getElementById('target');
    const ctx = canvas.getContext('2d');
    const canvasWrapper = document.getElementById('canvasWrapper');
    const canvasViewport = document.getElementById('canvasViewport');
    const zoomLevelEl = document.getElementById('zoomLevel');

    const dropzone = document.getElementById('dropzone');
    const backgroundFileInput = document.getElementById('background-file');
    const windowDragOverlay = document.getElementById('windowDragOverlay');
    const imageStatusBadge = document.getElementById('imageStatusBadge');

    const posterUrlInput = document.getElementById('posterUrlInput');
    const btnLoadUrl = document.getElementById('btnLoadUrl');

    const coverGrid = document.getElementById('coverGrid');
    const coverCards = coverGrid.querySelectorAll('.cover-card');

    const backScale = document.getElementById('back-scale');
    const scaleVal = document.getElementById('scaleVal');

    const btnCenterImage = document.getElementById('btnCenterImage');
    const btnFitWidth = document.getElementById('btnFitWidth');
    const btnFitHeight = document.getElementById('btnFitHeight');
    const btnFlipH = document.getElementById('btnFlipH');
    const btnFlipV = document.getElementById('btnFlipV');
    const btnRotate90 = document.getElementById('btnRotate90');
    const toggleBlurBg = document.getElementById('toggleBlurBg');

    const filterBrightness = document.getElementById('filterBrightness');
    const brightnessVal = document.getElementById('brightnessVal');
    const filterContrast = document.getElementById('filterContrast');
    const contrastVal = document.getElementById('contrastVal');
    const filterSaturation = document.getElementById('filterSaturation');
    const saturationVal = document.getElementById('saturationVal');
    const btnResetFilters = document.getElementById('btnResetFilters');
    const btnHoldPreview = document.getElementById('btnHoldPreview');

    const outputFilename = document.getElementById('outputFilename');
    const formatPills = document.querySelectorAll('.format-pill');
    const outputQuality = document.getElementById('outputQuality');
    const qualityVal = document.getElementById('qualityVal');
    const qualityControl = document.getElementById('qualityControl');
    const btnSaveToFolder = document.getElementById('btnSaveToFolder');
    const btnSaveLocal = document.getElementById('btnSaveLocal');
    const btnBatchSaveAndNext = document.getElementById('btnBatchSaveAndNext');
    const copyClipboardBtn = document.getElementById('copyClipboard');

    const btnZoomIn = document.getElementById('btnZoomIn');
    const btnZoomOut = document.getElementById('btnZoomOut');
    const btnZoomFit = document.getElementById('btnZoomFit');
    const toastContainer = document.getElementById('toastContainer');

    // =========================================================================
    // Notificaciones Toast
    // =========================================================================
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        
        let icon = 'ℹ️';
        if (type === 'success') icon = '✅';
        if (type === 'warning') icon = '⚠️';

        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3200);
    }

    // =========================================================================
    // Carga de Imagen
    // =========================================================================
    function handleFile(file) {
        if (!file || !file.type.startsWith('image/')) {
            showToast('Por favor selecciona un archivo de imagen válido', 'warning');
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                setImageSource(img, file.name);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }

    // Sanitizar título conservando tildes, eñes, paréntesis de año y caracteres válidos
    function sanitizeMovieTitle(str) {
        if (!str) return 'Poster';
        return str
            .replace(/\.[^/.]+$/, '') // Quita extensiones (.jpg, .png, etc.)
            .replace(/[\/\\:*?"<>|]/g, '') // Quita caracteres ilegales en nombres de archivo
            .replace(/\s+/g, ' ')
            .trim();
    }

    function setImageSource(img, rawName = 'Póster') {
        state.background = img;
        
        state.backgroundName = sanitizeMovieTitle(rawName) || 'Poster';
        // SIEMPRE actualizar con el nuevo nombre (incluso si ya había otro póster antes)
        if (outputFilename) {
            outputFilename.value = state.backgroundName;
        }

        imageStatusBadge.textContent = `${img.width} × ${img.height} px`;
        imageStatusBadge.className = 'badge pro';
        if (copyClipboardBtn) copyClipboardBtn.disabled = false;

        // Resetear transformaciones anteriores para la nueva imagen
        state.flipH = false;
        state.flipV = false;
        state.rotation = 0;
        btnFlipH.classList.remove('active-tool');
        btnFlipV.classList.remove('active-tool');

        fitImageToCanvas();
        render();
        showToast(`Póster cargado: ${state.backgroundName}`, 'success');

        // Abrir automáticamente el Panel 2 (Carátulas y Packs) si está cerrado
        const panelCovers = document.getElementById('panelCovers');
        if (panelCovers && panelCovers.classList.contains('collapsed')) {
            panelCovers.classList.remove('collapsed');
        }
    }

    // Input file tradicional
    backgroundFileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // Helper para carga de imagen con CORS
    function tryLoadImage(srcUrl) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('CORS / Red'));
            img.src = srcUrl;
        });
    }

    // Carga desde URL
    async function loadFromUrl(url) {
        if (!url || !url.trim().startsWith('http')) {
            showToast('Ingresa una URL válida que comience con http:// o https://', 'warning');
            return;
        }

        // Si es una URL de The Movie Database, redirigir automáticamente al gestor de TMDb
        if (url.includes('themoviedb.org')) {
            if (typeof loadFromTmdb === 'function') {
                loadFromTmdb(url);
                return;
            }
        }

        showToast('Cargando imagen desde enlace...', 'info');

        try {
            // Intento directo con crossOrigin anonymous
            const img = await tryLoadImage(url.trim());
            const urlParts = url.split('/').pop().split('?')[0] || 'Poster_Web';
            setImageSource(img, urlParts);
        } catch {
            // Si falla por CORS, intentamos a través de un proxy CORS seguro
            try {
                const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(url.trim())}`;
                const imgProxy = await tryLoadImage(proxyUrl);
                const urlParts = url.split('/').pop().split('?')[0] || 'Poster_Web';
                setImageSource(imgProxy, urlParts);
            } catch {
                showToast('No se pudo acceder a la imagen remota por restricciones de CORS. Puedes copiarla y pegarla con Ctrl + V.', 'warning');
            }
        }
    }

    btnLoadUrl.addEventListener('click', () => {
        loadFromUrl(posterUrlInput.value);
    });

    posterUrlInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            loadFromUrl(posterUrlInput.value);
        }
    });

    // Drag & Drop sobre dropzone
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Drag & Drop global sobre toda la ventana
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragCounter++;
        if (e.dataTransfer.types && Array.from(e.dataTransfer.types).includes('Files')) {
            windowDragOverlay.classList.add('active');
        }
    });

    window.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragCounter--;
        if (dragCounter <= 0) {
            dragCounter = 0;
            windowDragOverlay.classList.remove('active');
        }
    });

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dragCounter = 0;
        windowDragOverlay.classList.remove('active');
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFile(e.dataTransfer.files[0]);
        }
    });

    // Pegar desde portapapeles (Ctrl + V)
    window.addEventListener('paste', (e) => {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let item of items) {
            if (item.type.indexOf('image') !== -1) {
                const blob = item.getAsFile();
                handleFile(blob);
                showToast('Imagen pegada desde el portapapeles', 'success');
                break;
            }
        }
    });

    // =========================================================================
    // Selector Visual de Carátulas (Dinámicas & Estándar)
    // =========================================================================
    const customCoverUrls = new Map();

    function setCover(coverKey) {
        state.cover = coverKey;

        document.querySelectorAll('#panelCovers .cover-card').forEach(card => {
            if (card.dataset.cover === coverKey) {
                card.classList.add('active');
            } else {
                card.classList.remove('active');
            }
        });

        if (coverKey === 'ninguno') {
            isOverlayLoaded = false;
            overlayImage.src = '';
            render();
            return;
        }

        const pack = getPackById(coverKey);
        if (pack && pack.covers.length > 0) {
            const firstCover = pack.covers[0];
            const fileKey = (firstCover === '4K_FULL_REMUX') ? '4K_FULL' : firstCover;
            overlayImage.src = customCoverUrls.get(firstCover) || `cover/${fileKey}.png`;
            if (btnSaveToFolder) {
                btnSaveToFolder.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        <polyline points="9 14 12 11 15 14"></polyline>
                        <line x1="12" y1="11" x2="12" y2="17"></line>
                    </svg>
                    <span>📁 Guardar Pack en Carpeta (${pack.covers.length} en 1 Clic)</span>
                `;
            }
            if (btnSaveLocal) {
                btnSaveLocal.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
                    </svg>
                    <span>💾 Guardar Pack en Local (${pack.covers.length} en 1 Clic)</span>
                `;
            }
        } else {
            if (btnSaveToFolder) {
                btnSaveToFolder.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"></path>
                        <polyline points="9 14 12 11 15 14"></polyline>
                        <line x1="12" y1="11" x2="12" y2="17"></line>
                    </svg>
                    <span>📁 Guardar en Carpeta (cover_download)</span>
                `;
            }
            if (btnSaveLocal) {
                btnSaveLocal.innerHTML = `
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                        <polyline points="7 10 12 15 17 10"></polyline>
                        <line x1="12" y1="15" x2="12" y2="3"></line>
                    </svg>
                    <span>💾 Guardar en Local (Elegir destino)</span>
                `;
            }
            if (customCoverUrls.has(coverKey)) {
                overlayImage.src = customCoverUrls.get(coverKey);
            } else {
                const fileKey = (coverKey === '4K_FULL_REMUX') ? '4K_FULL' : coverKey;
                overlayImage.src = `cover/${fileKey}.png`;
            }
        }

        overlayImage.onload = () => {
            isOverlayLoaded = true;
            render();
        };
        overlayImage.onerror = () => {
            isOverlayLoaded = false;
            showToast(`No se pudo cargar la carátula ${coverKey}`, 'warning');
            render();
        };
    }

    const panelCoversElement = document.getElementById('panelCovers');
    if (panelCoversElement) {
        panelCoversElement.addEventListener('click', (e) => {
            const card = e.target.closest('.cover-card');
            if (card && card.dataset.cover) {
                setCover(card.dataset.cover);
            }
        });
    }

    // =========================================================================
    // Renderizado del Canvas
    // =========================================================================
    function render() {
        ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

        if (!state.background) {
            renderPlaceholder();
            return;
        }

        // 1. Fondo con Desenfoque Dinámico (si está activado y no es preview original)
        if (state.blurBackground && !state.isPreviewOriginal) {
            renderBlurredBackground();
        }

        // 2. Dibujar Imagen de Fondo con Transformaciones y Filtros
        drawMainImage(state.isPreviewOriginal);

        // 3. Dibujar Carátula / Overlay (solo si no es preview original)
        if (!state.isPreviewOriginal && state.cover !== 'ninguno' && isOverlayLoaded) {
            ctx.drawImage(overlayImage, 0, 0, POSTER_WIDTH, POSTER_HEIGHT);
        }
    }

    function renderBlurredBackground() {
        ctx.save();
        ctx.filter = 'blur(28px) brightness(50%) saturate(130%)';

        const scale = Math.max(
            POSTER_WIDTH / state.background.width,
            POSTER_HEIGHT / state.background.height
        ) * 1.25;

        const w = state.background.width * scale;
        const h = state.background.height * scale;
        const x = (POSTER_WIDTH - w) / 2;
        const y = (POSTER_HEIGHT - h) / 2;

        ctx.drawImage(state.background, x, y, w, h);
        ctx.restore();
    }

    function drawMainImage(isOriginal = false) {
        ctx.save();
        
        if (!isOriginal) {
            ctx.filter = `brightness(${state.filters.brightness}%) contrast(${state.filters.contrast}%) saturate(${state.filters.saturation}%)`;
        } else {
            ctx.filter = 'none';
        }

        const w = state.background.width;
        const h = state.background.height;

        // Calcular pivote central para que el volteo y la rotación sean naturales
        const centerX = state.backgroundOffset.x + (w * state.backgroundScale) / 2;
        const centerY = state.backgroundOffset.y + (h * state.backgroundScale) / 2;

        ctx.translate(centerX, centerY);

        if (!isOriginal) {
            if (state.rotation !== 0) {
                ctx.rotate((state.rotation * Math.PI) / 180);
            }

            const scaleX = state.backgroundScale * (state.flipH ? -1 : 1);
            const scaleY = state.backgroundScale * (state.flipV ? -1 : 1);
            ctx.scale(scaleX, scaleY);
        } else {
            ctx.scale(state.backgroundScale, state.backgroundScale);
        }

        ctx.drawImage(state.background, -w / 2, -h / 2);
        ctx.restore();
    }

    function renderPlaceholder() {
        const grad = ctx.createLinearGradient(0, 0, 0, POSTER_HEIGHT);
        grad.addColorStop(0, '#111827');
        grad.addColorStop(1, '#0b0f19');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 2;
        ctx.strokeRect(20, 20, POSTER_WIDTH - 40, POSTER_HEIGHT - 40);

        ctx.fillStyle = '#6366f1';
        ctx.beginPath();
        ctx.arc(POSTER_WIDTH / 2, POSTER_HEIGHT / 2 - 50, 48, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        const cx = POSTER_WIDTH / 2;
        const cy = POSTER_HEIGHT / 2 - 50;
        ctx.moveTo(cx, cy - 20);
        ctx.lineTo(cx + 18, cy);
        ctx.lineTo(cx + 7, cy);
        ctx.lineTo(cx + 7, cy + 18);
        ctx.lineTo(cx - 7, cy + 18);
        ctx.lineTo(cx - 7, cy);
        ctx.lineTo(cx - 18, cy);
        ctx.closePath();
        ctx.fill();

        ctx.textAlign = 'center';
        ctx.font = '600 24px "Outfit", sans-serif';
        ctx.fillStyle = '#f3f4f6';
        ctx.fillText('Selecciona o Arrastra un Póster', POSTER_WIDTH / 2, POSTER_HEIGHT / 2 + 35);

        ctx.font = '400 15px "Inter", sans-serif';
        ctx.fillStyle = '#9ca3af';
        ctx.fillText('Resolución: 670 × 998 px | Compatible con JPG, PNG, WebP o Ctrl + V', POSTER_WIDTH / 2, POSTER_HEIGHT / 2 + 70);
    }

    // =========================================================================
    // Ajustes de Escala, Centrado y Transformación
    // =========================================================================
    function getImageDimensions() {
        if (!state.background) return { w: POSTER_WIDTH, h: POSTER_HEIGHT };
        const isSideways = state.rotation === 90 || state.rotation === 270;
        return {
            w: isSideways ? state.background.height : state.background.width,
            h: isSideways ? state.background.width : state.background.height
        };
    }

    function getMinScale() {
        if (!state.background) return 0.3;
        const { w, h } = getImageDimensions();
        return Math.max(POSTER_HEIGHT / h, POSTER_WIDTH / w);
    }

    function fitImageToCanvas() {
        if (!state.background) return;
        const scale = getMinScale();
        state.backgroundScale = scale;
        backScale.value = scale;
        scaleVal.textContent = `${Math.round(scale * 100)}%`;

        centerImage();
    }

    function centerImage() {
        if (!state.background) return;
        const { w, h } = getImageDimensions();
        const scaledW = w * state.backgroundScale;
        const scaledH = h * state.backgroundScale;
        state.backgroundOffset.x = (POSTER_WIDTH - scaledW) / 2;
        state.backgroundOffset.y = (POSTER_HEIGHT - scaledH) / 2;
        render();
    }

    btnCenterImage.addEventListener('click', centerImage);

    btnFitWidth.addEventListener('click', () => {
        if (!state.background) return;
        const { w } = getImageDimensions();
        const scale = POSTER_WIDTH / w;
        state.backgroundScale = scale;
        backScale.value = scale;
        scaleVal.textContent = `${Math.round(scale * 100)}%`;
        centerImage();
    });

    btnFitHeight.addEventListener('click', () => {
        if (!state.background) return;
        const { h } = getImageDimensions();
        const scale = POSTER_HEIGHT / h;
        state.backgroundScale = scale;
        backScale.value = scale;
        scaleVal.textContent = `${Math.round(scale * 100)}%`;
        centerImage();
    });

    // Volteo Horizontal
    btnFlipH.addEventListener('click', () => {
        if (!state.background) return;
        state.flipH = !state.flipH;
        btnFlipH.classList.toggle('active-tool', state.flipH);
        render();
    });

    // Volteo Vertical
    btnFlipV.addEventListener('click', () => {
        if (!state.background) return;
        state.flipV = !state.flipV;
        btnFlipV.classList.toggle('active-tool', state.flipV);
        render();
    });

    // Girar 90°
    btnRotate90.addEventListener('click', () => {
        if (!state.background) return;
        state.rotation = (state.rotation + 90) % 360;
        centerImage();
    });

    // Toggle Fondo Desenfoque
    toggleBlurBg.addEventListener('change', () => {
        state.blurBackground = toggleBlurBg.checked;
        render();
    });

    backScale.addEventListener('input', () => {
        state.backgroundScale = parseFloat(backScale.value);
        scaleVal.textContent = `${Math.round(state.backgroundScale * 100)}%`;
        render();
    });

    // =========================================================================
    // Filtros Fotográficos y Comparador con Original
    // =========================================================================
    filterBrightness.addEventListener('input', () => {
        state.filters.brightness = filterBrightness.value;
        brightnessVal.textContent = `${filterBrightness.value}%`;
        render();
    });

    filterContrast.addEventListener('input', () => {
        state.filters.contrast = filterContrast.value;
        contrastVal.textContent = `${filterContrast.value}%`;
        render();
    });

    filterSaturation.addEventListener('input', () => {
        state.filters.saturation = filterSaturation.value;
        saturationVal.textContent = `${filterSaturation.value}%`;
        render();
    });

    btnResetFilters.addEventListener('click', () => {
        state.filters.brightness = 100;
        state.filters.contrast = 100;
        state.filters.saturation = 100;
        filterBrightness.value = 100;
        brightnessVal.textContent = '100%';
        filterContrast.value = 100;
        contrastVal.textContent = '100%';
        filterSaturation.value = 100;
        saturationVal.textContent = '100%';
        state.flipH = false;
        state.flipV = false;
        state.rotation = 0;
        btnFlipH.classList.remove('active-tool');
        btnFlipV.classList.remove('active-tool');
        fitImageToCanvas();
        showToast('Ajustes y filtros restablecidos', 'info');
    });

    // Mantener presionado para ver original
    function startPreviewOriginal() {
        if (!state.background) return;
        state.isPreviewOriginal = true;
        btnHoldPreview.classList.add('active');
        render();
    }

    function endPreviewOriginal() {
        if (!state.isPreviewOriginal) return;
        state.isPreviewOriginal = false;
        btnHoldPreview.classList.remove('active');
        render();
    }

    btnHoldPreview.addEventListener('mousedown', startPreviewOriginal);
    window.addEventListener('mouseup', endPreviewOriginal);
    btnHoldPreview.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startPreviewOriginal();
    });
    window.addEventListener('touchend', endPreviewOriginal);

    // =========================================================================
    // Arrastre e Interacción con el Lienzo (Mouse & Touch)
    // =========================================================================
    let isDragging = false;
    let dragStart = { x: 0, y: 0 };
    let initialOffset = { x: 0, y: 0 };

    function onPointerDown(clientX, clientY) {
        if (!state.background) return;
        isDragging = true;
        canvasWrapper.classList.add('is-dragging');
        dragStart = { x: clientX, y: clientY };
        initialOffset = { x: state.backgroundOffset.x, y: state.backgroundOffset.y };
    }

    function onPointerMove(clientX, clientY) {
        if (!isDragging || !state.background) return;
        const dx = (clientX - dragStart.x) / state.viewportZoom;
        const dy = (clientY - dragStart.y) / state.viewportZoom;
        state.backgroundOffset.x = initialOffset.x + dx;
        state.backgroundOffset.y = initialOffset.y + dy;
        render();
    }

    function onPointerUp() {
        if (!isDragging) return;
        isDragging = false;
        canvasWrapper.classList.remove('is-dragging');
    }

    canvasWrapper.addEventListener('mousedown', (e) => {
        if (e.button === 0) {
            e.preventDefault();
            onPointerDown(e.clientX, e.clientY);
        }
    });

    window.addEventListener('mousemove', (e) => {
        onPointerMove(e.clientX, e.clientY);
    });

    window.addEventListener('mouseup', onPointerUp);

    // Soporte táctil
    canvasWrapper.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            const touch = e.touches[0];
            onPointerDown(touch.clientX, touch.clientY);
        }
    }, { passive: true });

    window.addEventListener('touchmove', (e) => {
        if (isDragging && e.touches.length === 1) {
            const touch = e.touches[0];
            onPointerMove(touch.clientX, touch.clientY);
        }
    }, { passive: true });

    window.addEventListener('touchend', onPointerUp);

    // Zoom con la rueda del ratón
    canvasViewport.addEventListener('wheel', (e) => {
        if (!state.background) return;
        e.preventDefault();

        const zoomDelta = e.deltaY < 0 ? 0.05 : -0.05;
        let newScale = state.backgroundScale + zoomDelta;
        newScale = Math.min(Math.max(newScale, 0.3), 3.0);

        const rect = canvas.getBoundingClientRect();
        const mouseX = (e.clientX - rect.left) / state.viewportZoom;
        const mouseY = (e.clientY - rect.top) / state.viewportZoom;

        const scaleRatio = newScale / state.backgroundScale;
        state.backgroundOffset.x = mouseX - (mouseX - state.backgroundOffset.x) * scaleRatio;
        state.backgroundOffset.y = mouseY - (mouseY - state.backgroundOffset.y) * scaleRatio;

        state.backgroundScale = newScale;
        backScale.value = newScale;
        scaleVal.textContent = `${Math.round(newScale * 100)}%`;

        render();
    }, { passive: false });

    // Ajuste fino con teclado
    window.addEventListener('keydown', (e) => {
        if (!state.background) return;
        if (['input', 'textarea'].includes(document.activeElement.tagName.toLowerCase())) return;

        const step = e.shiftKey ? 10 : 1;
        let moved = false;

        switch (e.key) {
            case 'ArrowLeft':
                state.backgroundOffset.x -= step;
                moved = true;
                break;
            case 'ArrowRight':
                state.backgroundOffset.x += step;
                moved = true;
                break;
            case 'ArrowUp':
                state.backgroundOffset.y -= step;
                moved = true;
                break;
            case 'ArrowDown':
                state.backgroundOffset.y += step;
                moved = true;
                break;
        }

        if (moved) {
            e.preventDefault();
            render();
        }
    });

    // =========================================================================
    // Controles de Vista y Zoom del Viewport
    // =========================================================================
    function applyViewportScale(scale) {
        state.viewportZoom = Math.min(Math.max(scale, 0.25), 1.5);
        canvasWrapper.style.transform = `scale(${state.viewportZoom})`;
        zoomLevelEl.textContent = `${Math.round(state.viewportZoom * 100)}%`;
    }

    function fitViewport() {
        const vpRect = canvasViewport.getBoundingClientRect();
        const availableWidth = vpRect.width - 60;
        const availableHeight = vpRect.height - 80;

        const scaleX = availableWidth / POSTER_WIDTH;
        const scaleY = availableHeight / POSTER_HEIGHT;
        const idealScale = Math.min(scaleX, scaleY, 0.95);

        applyViewportScale(idealScale);
    }

    btnZoomIn.addEventListener('click', () => applyViewportScale(state.viewportZoom + 0.1));
    btnZoomOut.addEventListener('click', () => applyViewportScale(state.viewportZoom - 0.1));
    btnZoomFit.addEventListener('click', fitViewport);

    window.addEventListener('resize', () => {
        fitViewport();
    });

    // =========================================================================
    // Formato y Calidad de Exportación
    // =========================================================================
    formatPills.forEach(pill => {
        pill.addEventListener('click', () => {
            formatPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');

            state.export.format = pill.dataset.format;
            state.export.ext = pill.dataset.ext;

            if (state.export.ext === 'png') {
                qualityControl.style.opacity = '0.4';
                outputQuality.disabled = true;
            } else {
                qualityControl.style.opacity = '1';
                outputQuality.disabled = false;
            }
        });
    });

    outputQuality.addEventListener('input', () => {
        state.export.quality = parseFloat(outputQuality.value);
        qualityVal.textContent = `${Math.round(state.export.quality * 100)}%`;
    });

    // =========================================================================
    // Exportación y Copiar al Portapapeles
    // =========================================================================
    function getCleanBaseName() {
        let name = outputFilename.value.trim();
        if (!name) {
            name = state.backgroundName || 'Caratula';
        }
        return sanitizeMovieTitle(name);
    }

    // Genera el nombre del archivo final: [Título Película (Año)] - [Carátula].[ext]
    function getCoverFilename(coverKey, suffix) {
        let base = getCleanBaseName();
        let cleanSuffix = (suffix || coverKey || '').trim();
        // Quitar posibles emojis de packs (✨, 📦, etc.)
        cleanSuffix = cleanSuffix.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}]/gu, '').trim();
        cleanSuffix = cleanSuffix.replace(/[\/\\:*?"<>|]/g, '').trim();

        if (coverKey === 'ninguno' || cleanSuffix.toLowerCase() === 'poster') {
            if (!base.toLowerCase().endsWith('poster')) {
                return `${base} - Poster.${state.export.ext}`;
            }
            return `${base}.${state.export.ext}`;
        }
        if (cleanSuffix) {
            if (base.endsWith('-')) {
                return `${base} ${cleanSuffix}.${state.export.ext}`;
            }
            return `${base} - ${cleanSuffix}.${state.export.ext}`;
        }
        return `${base}.${state.export.ext}`;
    }

    // Renderiza una carátula específica sobre el lienzo
    async function renderCoverAsync(coverKey) {
        if (coverKey === 'ninguno') {
            isOverlayLoaded = false;
            render();
            return;
        }

        const coverUrl = customCoverUrls.get(coverKey) || `cover/${coverKey}.png`;
        const tempOverlay = await tryLoadImage(coverUrl);
        ctx.clearRect(0, 0, POSTER_WIDTH, POSTER_HEIGHT);

        if (state.blurBackground) {
            renderBlurredBackground();
        }

        drawMainImage(false);
        ctx.drawImage(tempOverlay, 0, 0, POSTER_WIDTH, POSTER_HEIGHT);
    }

    function canvasToBlobAsync() {
        return new Promise((resolve) => {
            canvas.toBlob((blob) => {
                resolve(blob);
            }, state.export.format, state.export.quality);
        });
    }

    // Guardar en la carpeta cover_download/ del servidor (reemplaza si ya existe)
    async function saveBlobToFolder(blob, filename) {
        const formData = new FormData();
        formData.append('action', 'save_download');
        formData.append('filename', filename);
        formData.append('image', blob, filename);

        const res = await fetch('api_covers.php', {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (!data.success) {
            throw new Error(data.error || 'Error al guardar en cover_download/');
        }
        return data;
    }

    // Guardar en local: pide al usuario la ubicación en su equipo
    async function saveBlobLocal(blob, filename) {
        if (window.showSaveFilePicker) {
            try {
                const ext = state.export.ext || 'jpg';
                const mime = state.export.format || 'image/jpeg';
                const handle = await window.showSaveFilePicker({
                    suggestedName: filename,
                    types: [{
                        description: `Imagen ${ext.toUpperCase()}`,
                        accept: { [mime]: [`.${ext}`] }
                    }]
                });
                const writable = await handle.createWritable();
                await writable.write(blob);
                await writable.close();
                return { success: true, method: 'picker' };
            } catch (err) {
                if (err.name === 'AbortError') {
                    return { success: false, aborted: true };
                }
                console.warn('showSaveFilePicker falló, usando descarga estándar:', err);
            }
        }

        // Descarga tradicional como alternativa
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(link.href), 1500);
        return { success: true, method: 'download' };
    }

    // Ejecuta la exportación para un destino ('folder' o 'local')
    async function executeExport(target = 'folder') {
        if (!state.background) {
            showToast('Primero carga una imagen o importa un póster de TMDb', 'warning');
            return false;
        }

        const isFolder = (target === 'folder');
        const targetBtn = isFolder ? btnSaveToFolder : btnSaveLocal;
        const origHtml = targetBtn ? targetBtn.innerHTML : '';

        if (targetBtn) {
            targetBtn.disabled = true;
            targetBtn.innerHTML = `
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
                    <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                    <path d="M12 2a10 10 0 0 1 10 10"></path>
                </svg>
                <span>Guardando...</span>
            `;
        }

        try {
            const activePack = getPackById(state.cover);
            if (activePack) {
                const total = activePack.covers.length;
                let savedCount = 0;
                for (let i = 0; i < total; i++) {
                    const cKey = activePack.covers[i];
                    showToast(`Generando carátula ${i + 1}/${total}: ${cKey}...`, 'info');
                    await renderCoverAsync(cKey);
                    const blob = await canvasToBlobAsync();
                    if (!blob) throw new Error('No se pudo generar la imagen del lienzo');

                    const fname = getCoverFilename(cKey, cKey);
                    if (isFolder) {
                        await saveBlobToFolder(blob, fname);
                        savedCount++;
                    } else {
                        const res = await saveBlobLocal(blob, fname);
                        if (res && res.aborted) {
                            showToast('Guardado cancelado por el usuario', 'info');
                            break;
                        }
                        savedCount++;
                    }
                    await new Promise(r => setTimeout(r, 250));
                }
                render(); // Restaurar vista original
                if (savedCount > 0) {
                    if (isFolder) {
                        showToast(`¡Pack "${activePack.name}" guardado en carpeta cover_download/ (${savedCount} carátulas)!`, 'success');
                    } else {
                        showToast(`¡Pack "${activePack.name}" guardado con éxito!`, 'success');
                    }
                }
                return (savedCount > 0);
            } else {
                const selectedCard = document.querySelector(`.cover-card[data-cover="${state.cover}"]`);
                let coverTitle = selectedCard ? selectedCard.querySelector('.cover-card-title').textContent.trim() : state.cover;
                if (state.cover === 'ninguno') coverTitle = 'Poster';

                await renderCoverAsync(state.cover);
                const blob = await canvasToBlobAsync();
                if (!blob) throw new Error('No se pudo generar la imagen del lienzo');

                const fname = getCoverFilename(state.cover, coverTitle);
                if (isFolder) {
                    await saveBlobToFolder(blob, fname);
                    render();
                    showToast(`¡Guardado en cover_download/: ${fname}!`, 'success');
                    return true;
                } else {
                    const res = await saveBlobLocal(blob, fname);
                    render();
                    if (res && res.aborted) {
                        return false;
                    }
                    showToast(`¡Carátula guardada: ${fname}!`, 'success');
                    return true;
                }
            }
        } catch (err) {
            console.error('Error al exportar:', err);
            showToast(err.message || 'Error al guardar la carátula', 'danger');
            render();
            return false;
        } finally {
            if (targetBtn) {
                targetBtn.disabled = false;
                targetBtn.innerHTML = origHtml;
            }
        }
    }

    // Copiar al Portapapeles
    if (copyClipboardBtn) {
        copyClipboardBtn.addEventListener('click', async () => {
            if (!state.background) {
                showToast('Primero carga una imagen de póster', 'warning');
                return;
            }

            copyClipboardBtn.disabled = true;
            showToast('Copiando póster al portapapeles...', 'info');

            try {
                render();
                canvas.toBlob(async (blob) => {
                    if (!blob) {
                        showToast('No se pudo generar la imagen para copiar', 'warning');
                        copyClipboardBtn.disabled = false;
                        return;
                    }
                    try {
                        await navigator.clipboard.write([
                            new ClipboardItem({ 'image/png': blob })
                        ]);
                        showToast('¡Póster copiado al portapapeles! Puedes pegarlo con Ctrl + V', 'success');
                    } catch {
                        showToast('El navegador no permitió copiar la imagen al portapapeles directamente', 'warning');
                    } finally {
                        copyClipboardBtn.disabled = false;
                    }
                }, 'image/png');
            } catch {
                showToast('Error al copiar al portapapeles', 'warning');
                copyClipboardBtn.disabled = false;
            }
        });
    }

    // Listeners de Guardado
    if (btnSaveToFolder) {
        btnSaveToFolder.addEventListener('click', async (e) => {
            e.preventDefault();
            const ok = await executeExport('folder');
            if (ok && batchQueue.length > 0 && batchCurrentIndex >= 0) {
                batchQueue[batchCurrentIndex].status = 'saved';
                updateBatchNavigatorUI();
            }
        });
    }

    if (btnSaveLocal) {
        btnSaveLocal.addEventListener('click', async (e) => {
            e.preventDefault();
            const ok = await executeExport('local');
            if (ok && batchQueue.length > 0 && batchCurrentIndex >= 0) {
                batchQueue[batchCurrentIndex].status = 'saved';
                updateBatchNavigatorUI();
            }
        });
    }

    // =========================================================================
    // Gestión de Tema Claro / Oscuro Unificado
    // =========================================================================
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

    // =========================================================================
    // Sistema de Packs de Carátulas (Lectura desde config.json)
    // =========================================================================
    let currentPacks = [];

    // Cargar packs desde config.json (a través de api_packs.php o directo)
    async function loadPacksFromJson() {
        if (window.location.protocol.startsWith('http')) {
            try {
                const res = await fetch(`api_packs.php?v=${Date.now()}`);
                if (res.ok) {
                    const data = await res.json();
                    if (Array.isArray(data)) {
                        currentPacks = data;
                        localStorage.setItem('suite_cover_packs_backup', JSON.stringify(data));
                        sincronizarSidebarPacks();
                        return;
                    }
                }
            } catch (e) {
                console.warn('Intentando leer config.json directo:', e);
            }
        }

        try {
            const res = await fetch(`config.json?v=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                const packsList = Array.isArray(data) ? data : (data.packs || []);
                if (Array.isArray(packsList)) {
                    currentPacks = packsList;
                    localStorage.setItem('suite_cover_packs_backup', JSON.stringify(packsList));
                    sincronizarSidebarPacks();
                    return;
                }
            }
        } catch {}

        try {
            const backup = localStorage.getItem('suite_cover_packs_backup');
            if (backup) {
                currentPacks = JSON.parse(backup);
                sincronizarSidebarPacks();
                return;
            }
        } catch {}

        currentPacks = [];
        sincronizarSidebarPacks();
    }

    function getAllPacks() {
        return currentPacks;
    }

    function getPackById(id) {
        return currentPacks.find(p => p.id === id) || null;
    }

    async function saveCustomPack(newPack) {
        const idx = currentPacks.findIndex(p => p.id === newPack.id);
        if (idx >= 0) {
            currentPacks[idx] = newPack;
        } else {
            currentPacks.push(newPack);
        }

        localStorage.setItem('suite_cover_packs_backup', JSON.stringify(currentPacks));

        if (window.location.protocol.startsWith('http')) {
            try {
                await fetch('api_packs.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'save', pack: newPack })
                });
            } catch (err) {
                console.error('Error al guardar pack en packs.json:', err);
            }
        }
    }

    async function deleteCustomPack(packId) {
        currentPacks = currentPacks.filter(p => p.id !== packId);
        localStorage.setItem('suite_cover_packs_backup', JSON.stringify(currentPacks));

        if (window.location.protocol.startsWith('http')) {
            try {
                await fetch('api_packs.php', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'delete', id: packId })
                });
            } catch (err) {
                console.error('Error al eliminar pack de packs.json:', err);
            }
        }
    }

    // Sincronizar packs con el subgrupo de packs (#packsGrid)
    function sincronizarSidebarPacks() {
        const packsGrid = document.getElementById('packsGrid');
        if (!packsGrid) return;
        
        const allPacks = getAllPacks();
        packsGrid.innerHTML = '';

        if (allPacks.length === 0) {
            packsGrid.innerHTML = `
                <div class="empty-subgroup-msg" style="grid-column: 1/-1; font-size: 0.73rem; color: var(--text-muted); padding: 0.6rem 0.5rem; text-align: center; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px dashed rgba(255,255,255,0.08);">
                    No hay packs creados. Puedes crear packs en <strong>"Gestionar"</strong>.
                </div>
            `;
            return;
        }

        allPacks.forEach(p => {
            const card = document.createElement('div');
            card.className = `cover-card special ${p.isDefault ? '' : 'custom-pack'} ${state.cover === p.id ? 'active' : ''}`;
            card.dataset.cover = p.id;
            card.innerHTML = `
                <div class="cover-card-title">${p.isDefault ? '✨ ' : '📦 '}${p.name}</div>
                <div class="cover-card-tag">${p.tag || (p.covers.length + ' banners en 1 clic')}</div>
            `;
            packsGrid.appendChild(card);
        });
    }

    loadPacksFromJson();

    // =========================================================================
    // Gestor de Carátulas & Packs (File System Access API - Sin PHP)
    // =========================================================================
    function initCoverManager() {
        const btnOpen = document.getElementById('btnOpenCoverManager');
        const modal = document.getElementById('coverManagerModal');
        const btnClose = document.getElementById('btnCloseCoverManager');
        const btnCloseFooter = document.getElementById('btnCloseModalFooter');
        
        // Pestañas
        const tabCoversBtn = document.getElementById('tabCoversBtn');
        const tabPacksBtn = document.getElementById('tabPacksBtn');
        const tabCoversContent = document.getElementById('tabCoversContent');
        const tabPacksContent = document.getElementById('tabPacksContent');

        // Carátulas físicas
        const btnUploadCoverLabel = document.getElementById('btnUploadCoverLabel');
        const coverUploadInput = document.getElementById('coverUploadInput');
        const coverManagerContent = document.getElementById('coverManagerContent');

        // Packs
        const btnToggleNewPack = document.getElementById('btnToggleNewPack');
        const newPackBox = document.getElementById('newPackBox');
        const newPackName = document.getElementById('newPackName');
        const packCoversPicker = document.getElementById('packCoversPicker');
        const btnCancelNewPack = document.getElementById('btnCancelNewPack');
        const btnSaveNewPack = document.getElementById('btnSaveNewPack');
        const packsListContainer = document.getElementById('packsListContainer');

        if (!btnOpen || !modal) return;

        let serverCovers = [];

        // Gestión de Pestañas
        if (tabCoversBtn && tabPacksBtn) {
            tabCoversBtn.addEventListener('click', () => {
                tabCoversBtn.classList.add('active');
                tabPacksBtn.classList.remove('active');
                if (tabCoversContent) tabCoversContent.style.display = 'block';
                if (tabPacksContent) tabPacksContent.style.display = 'none';
            });

            tabPacksBtn.addEventListener('click', () => {
                tabPacksBtn.classList.add('active');
                tabCoversBtn.classList.remove('active');
                if (tabCoversContent) tabCoversContent.style.display = 'none';
                if (tabPacksContent) tabPacksContent.style.display = 'block';
                renderizarListaPacks();
            });
        }

        // Abrir y cerrar modal
        function openModal() {
            modal.style.display = 'flex';
            cargarCaratulasServidor();
            renderizarListaPacks();
        }

        function closeModal() {
            modal.style.display = 'none';
        }

        btnOpen.addEventListener('click', openModal);
        if (btnClose) btnClose.addEventListener('click', closeModal);
        if (btnCloseFooter) btnCloseFooter.addEventListener('click', closeModal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal.style.display === 'flex') {
                closeModal();
            }
        });

        // Cargar carátulas desde api_covers.php (servidor físico)
        async function cargarCaratulasServidor() {
            if (coverManagerContent) {
                coverManagerContent.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2rem;">Cargando carátulas del servidor...</div>';
            }

            if (window.location.protocol.startsWith('http')) {
                try {
                    const res = await fetch(`api_covers.php?v=${Date.now()}`);
                    if (res.ok) {
                        const data = await res.json();
                        if (data.success && Array.isArray(data.covers)) {
                            serverCovers = data.covers;
                            renderizarCaratulasServidor(serverCovers);
                            sincronizarSidebarGrid(serverCovers);
                            poblarSelectorCaratulasPack();
                            return;
                        }
                    }
                } catch (err) {
                    console.warn('api_covers.php no respondió:', err);
                }
            }

            serverCovers = [];
            renderizarCaratulasServidor(serverCovers);
            sincronizarSidebarGrid(serverCovers);
            poblarSelectorCaratulasPack();
        }

        // Renderizado del listado de carátulas en el modal
        function renderizarCaratulasServidor(covers) {
            if (!coverManagerContent) return;
            coverManagerContent.innerHTML = '';

            if (covers.length === 0) {
                coverManagerContent.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 2.5rem;">
                        No hay carátulas en la carpeta <code>cover/</code>. Pulsa <strong>"Subir Nueva Carátula"</strong> para añadir una.
                    </div>
                `;
                return;
            }

            covers.forEach(item => {
                const card = document.createElement('div');
                card.className = 'cover-item-card';
                card.innerHTML = `
                    <div class="cover-item-preview">
                        <img src="${item.url || ('cover/' + item.filename)}?v=${item.mtime || Date.now()}" alt="${item.filename}" loading="lazy">
                    </div>
                    <div class="cover-item-info">
                        <div class="cover-item-name" title="${item.filename}">${item.filename}</div>
                        <div class="cover-item-meta">
                            <span>${item.size_formatted || 'Base'}</span>
                            <span class="badge" style="font-size:0.65rem;">Servidor</span>
                        </div>
                        <div class="cover-item-actions">
                            <button type="button" class="cover-item-btn use-btn" data-cover-key="${item.key}">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                                Usar
                            </button>
                            <button type="button" class="cover-item-btn delete-btn" title="Eliminar del servidor" data-filename="${item.filename}">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <polyline points="3 6 5 6 21 6"></polyline>
                                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                                </svg>
                                Borrar
                            </button>
                        </div>
                    </div>
                `;

                card.querySelector('.use-btn').addEventListener('click', () => {
                    setCover(item.key);
                    showToast(`Carátula activa: ${item.name || item.key}`, 'success');
                    closeModal();
                });

                card.querySelector('.delete-btn').addEventListener('click', async () => {
                    if (!confirm(`¿Eliminar la carátula "${item.filename}" del servidor?`)) return;

                    if (!window.location.protocol.startsWith('http')) {
                        showToast('La eliminación en servidor requiere ejecutar con servidor web', 'warning');
                        return;
                    }

                    try {
                        const formData = new FormData();
                        formData.append('action', 'delete');
                        formData.append('filename', item.filename);

                        const res = await fetch('api_covers.php', { method: 'POST', body: formData });
                        const result = await res.json();
                        if (result.success) {
                            showToast(`"${item.filename}" eliminada del servidor`, 'success');
                            if (state.cover === item.key) {
                                setCover('ninguno');
                            }
                            await cargarCaratulasServidor();
                        } else {
                            showToast(result.error || 'Error al eliminar', 'error');
                        }
                    } catch (err) {
                        console.error('Error al borrar carátula:', err);
                        showToast('Error de conexión al eliminar', 'error');
                    }
                });

                coverManagerContent.appendChild(card);
            });
        }

        // Subir carátula con input file clásico (100% compatible con móvil y desktop)
        if (coverUploadInput) {
            coverUploadInput.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                if (!window.location.protocol.startsWith('http')) {
                    showToast('Para subir archivos al servidor la aplicación debe ejecutarse bajo HTTP/HTTPS', 'warning');
                    coverUploadInput.value = '';
                    return;
                }

                showToast('Subiendo carátula al servidor...', 'info');

                try {
                    const formData = new FormData();
                    formData.append('coverFile', file);

                    const res = await fetch('api_covers.php', { method: 'POST', body: formData });
                    const result = await res.json();

                    if (result.success) {
                        showToast(`Carátula "${file.name}" subida con éxito`, 'success');
                        coverUploadInput.value = '';
                        await cargarCaratulasServidor();
                        const newKey = file.name.replace(/\.[^/.]+$/, "");
                        setCover(newKey);
                    } else {
                        showToast(result.error || 'Error al subir', 'error');
                    }
                } catch (err) {
                    console.error('Error al subir carátula:', err);
                    showToast('No se pudo subir la carátula al servidor', 'error');
                }
            });
        }

        // Cargar carátulas del servidor al arrancar
        cargarCaratulasServidor();

        // =========================================================================
        // Gestión de Packs (Crear, Listar, Eliminar)
        // =========================================================================
        function renderizarListaPacks() {
            if (!packsListContainer) return;
            packsListContainer.innerHTML = '';

            const packs = getAllPacks();

            packs.forEach(pack => {
                const card = document.createElement('div');
                card.className = 'pack-card-item';
                
                const pillsHtml = pack.covers.map(c => `<span class="pack-cover-pill">${c}</span>`).join('');

                card.innerHTML = `
                    <div class="pack-card-details">
                        <div class="pack-card-title">
                            ${pack.name}
                            ${pack.isDefault ? '<span class="badge" style="font-size:0.65rem;">Predeterminado</span>' : ''}
                        </div>
                        <div class="pack-covers-tags">
                            ${pillsHtml}
                        </div>
                    </div>
                    <div class="pack-card-actions">
                        <button type="button" class="btn-action primary use-pack-btn" style="padding:0.4rem 0.8rem; font-size:0.78rem;">
                            Usar Pack
                        </button>
                        ${!pack.isDefault ? `
                            <button type="button" class="btn-action secondary delete-pack-btn" style="padding:0.4rem 0.6rem; color:#ef4444; font-size:0.78rem;" title="Eliminar pack">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                            </button>
                        ` : ''}
                    </div>
                `;

                card.querySelector('.use-pack-btn').addEventListener('click', () => {
                    setCover(pack.id);
                    showToast(`Pack seleccionado: ${pack.name}`, 'success');
                    closeModal();
                });

                const delBtn = card.querySelector('.delete-pack-btn');
                if (delBtn) {
                    delBtn.addEventListener('click', () => {
                        if (confirm(`¿Eliminar el pack "${pack.name}"?`)) {
                            deleteCustomPack(pack.id);
                            renderizarListaPacks();
                            sincronizarSidebarPacks();
                            if (state.cover === pack.id) setCover('ninguno');
                            showToast('Pack eliminado', 'info');
                        }
                    });
                }

                packsListContainer.appendChild(card);
            });
        }

        // Toggle formulario nuevo pack
        if (btnToggleNewPack && newPackBox) {
            btnToggleNewPack.addEventListener('click', () => {
                const isHidden = newPackBox.style.display === 'none';
                newPackBox.style.display = isHidden ? 'flex' : 'none';
                if (isHidden) {
                    poblarSelectorCaratulasPack();
                    if (newPackName) newPackName.focus();
                }
            });
        }

        if (btnCancelNewPack && newPackBox) {
            btnCancelNewPack.addEventListener('click', () => {
                newPackBox.style.display = 'none';
            });
        }

        // Poblar checkboxes con todas las carátulas disponibles en el servidor
        function poblarSelectorCaratulasPack() {
            if (!packCoversPicker) return;
            packCoversPicker.innerHTML = '';

            const items = (serverCovers && serverCovers.length > 0) ? serverCovers : [];
            if (items.length === 0) {
                packCoversPicker.innerHTML = '<div style="font-size:0.75rem; color:var(--text-muted); padding:0.5rem; text-align:center;">No hay carátulas disponibles en cover/. Sube carátulas primero.</div>';
                return;
            }

            items.forEach(c => {
                const label = document.createElement('label');
                label.className = 'pack-cover-checkbox-label';
                label.innerHTML = `
                    <input type="checkbox" value="${c.key}" class="pack-checkbox" style="cursor:pointer;">
                    <span>${c.name || c.key.replace(/_/g, ' ')}</span>
                `;
                packCoversPicker.appendChild(label);
            });
        }

        // Guardar nuevo pack
        if (btnSaveNewPack) {
            btnSaveNewPack.addEventListener('click', () => {
                const name = newPackName.value.trim();
                if (!name) {
                    showToast('Por favor escribe un nombre para el pack', 'warning');
                    return;
                }

                const selectedCovers = Array.from(packCoversPicker.querySelectorAll('.pack-checkbox:checked')).map(cb => cb.value);
                if (selectedCovers.length < 2) {
                    showToast('Selecciona al menos 2 carátulas para formar un pack', 'warning');
                    return;
                }

                const packId = 'pack_' + Date.now();
                const newPack = {
                    id: packId,
                    name: '✨ ' + name,
                    tag: `Descarga ${selectedCovers.length} versiones en 1 clic`,
                    covers: selectedCovers,
                    isDefault: false
                };

                saveCustomPack(newPack);
                newPackName.value = '';
                newPackBox.style.display = 'none';
                renderizarListaPacks();
                sincronizarSidebarPacks();
                setCover(packId);
                showToast(`¡Pack "${name}" creado con éxito!`, 'success');
            });
        }

        sincronizarSidebarPacks();

        // Sincronizar carátulas encontradas en el disco con el subgrupo de banners (#coverGrid)
        function sincronizarSidebarGrid(archivos) {
            if (!coverGrid) return;

            // Mantener tarjeta de 'ninguno'
            const ningunoCard = coverGrid.querySelector('.cover-card[data-cover="ninguno"]');
            coverGrid.innerHTML = '';
            
            if (ningunoCard) {
                coverGrid.appendChild(ningunoCard);
            } else {
                const defaultNinguno = document.createElement('div');
                defaultNinguno.className = `cover-card ${state.cover === 'ninguno' ? 'active' : ''}`;
                defaultNinguno.dataset.cover = 'ninguno';
                defaultNinguno.innerHTML = `
                    <div class="cover-card-title">Ninguno</div>
                    <div class="cover-card-tag">Póster limpio</div>
                `;
                coverGrid.appendChild(defaultNinguno);
            }

            if (!archivos || archivos.length === 0) {
                const emptyMsg = document.createElement('div');
                emptyMsg.className = 'empty-subgroup-msg';
                emptyMsg.style.cssText = 'grid-column: 1/-1; font-size: 0.73rem; color: var(--text-muted); padding: 0.6rem 0.5rem; text-align: center; background: rgba(255,255,255,0.02); border-radius: 6px; border: 1px dashed rgba(255,255,255,0.08);';
                emptyMsg.innerHTML = 'No hay carátulas en la carpeta <code>cover/</code>. Puedes subirlas en <strong>"Gestionar"</strong>.';
                coverGrid.appendChild(emptyMsg);
                return;
            }

            archivos.forEach((item) => {
                const filename = item.filename || (item.entry ? item.entry.name : item.name);
                const coverKey = item.key || filename.replace(/\.[^/.]+$/, "");
                const displayName = item.name || coverKey.replace(/_/g, ' ');

                const card = document.createElement('div');
                card.className = `cover-card ${state.cover === coverKey ? 'active' : ''}`;
                card.dataset.cover = coverKey;
                card.innerHTML = `
                    <div class="cover-card-title">${displayName}</div>
                    <div class="cover-card-tag">${filename}</div>
                `;
                coverGrid.appendChild(card);
            });
        }

        // Cargar automáticamente carátulas físicas al iniciar la aplicación
        cargarCaratulasServidor();
    }
    initCoverManager();

    // =========================================================================
    // Inicialización Inicial
    // =========================================================================
    
    // =========================================================================
    // Paneles Colapsables en la Barra Lateral
    // =========================================================================
    function initCollapsiblePanels() {
        document.querySelectorAll('.panel-header').forEach(header => {
            header.addEventListener('click', (e) => {
                // Evitar colapsar si se pulsa un botón interactivo (Reset, Gestionar, etc.)
                if (e.target.closest('button') && !e.target.closest('.panel-toggle-btn')) {
                    return;
                }
                const panel = header.closest('.panel');
                if (panel) {
                    panel.classList.toggle('collapsed');
                }
            });
        });
    }
    initCollapsiblePanels();

    // =========================================================================
    // Módulo The Movie Database (TMDb) - Consulta y Modal de Carátulas
    // =========================================================================
    let currentTmdbData = null;
    let currentTmdbFilter = 'all';

    const tmdbInput = document.getElementById('tmdbInput');
    const btnFetchTmdb = document.getElementById('btnFetchTmdb');
    const tabTmdbDirect = document.getElementById('tabTmdbDirect');
    const tabTmdbSearch = document.getElementById('tabTmdbSearch');
    const tabTmdbBatch = document.getElementById('tabTmdbBatch');
    const tmdbDirectView = document.getElementById('tmdbDirectView');
    const tmdbSearchView = document.getElementById('tmdbSearchView');
    const tmdbBatchView = document.getElementById('tmdbBatchView');
    const tmdbBatchInput = document.getElementById('tmdbBatchInput');
    const btnStartBatch = document.getElementById('btnStartBatch');
    const btnClearBatchInput = document.getElementById('btnClearBatchInput');
    const batchCountBadge = document.getElementById('batchCountBadge');

    const tmdbBatchNavigator = document.getElementById('tmdbBatchNavigator');
    const batchCurrentIndexEl = document.getElementById('batchCurrentIndex');
    const batchTotalCountEl = document.getElementById('batchTotalCount');
    const batchCurrentTitleEl = document.getElementById('batchCurrentTitle');
    const btnBatchPrev = document.getElementById('btnBatchPrev');
    const btnBatchNext = document.getElementById('btnBatchNext');
    const btnCloseBatch = document.getElementById('btnCloseBatch');
    const batchQueueListEl = document.getElementById('batchQueueList');

    const btnTmdbToggleConfig = document.getElementById('btnTmdbToggleConfig');
    const tmdbConfigSection = document.getElementById('tmdbConfigSection');
    const tmdbApiKeyInput = document.getElementById('tmdbApiKeyInput');
    const btnSaveTmdbKey = document.getElementById('btnSaveTmdbKey');
    const tmdbSearchInput = document.getElementById('tmdbSearchInput');
    const btnSearchTmdb = document.getElementById('btnSearchTmdb');
    const tmdbSearchResults = document.getElementById('tmdbSearchResults');
    const btnReopenTmdbModal = document.getElementById('btnReopenTmdbModal');
    const reopenTmdbCount = document.getElementById('reopenTmdbCount');

    // Elementos del Modal TMDb
    const tmdbPostersModal = document.getElementById('tmdbPostersModal');
    const btnCloseTmdbModal = document.getElementById('btnCloseTmdbModal');
    const btnCloseTmdbModalFooter = document.getElementById('btnCloseTmdbModalFooter');
    const tmdbModalTitle = document.getElementById('tmdbModalTitle');
    const tmdbModalSubtitle = document.getElementById('tmdbModalSubtitle');
    const tmdbModalCountBadge = document.getElementById('tmdbModalCountBadge');
    const tmdbModalGrid = document.getElementById('tmdbModalGrid');
    const tmdbModalEmpty = document.getElementById('tmdbModalEmpty');

    const countAll = document.getElementById('countAll');
    const countEsEs = document.getElementById('countEsEs');
    const countEsMx = document.getElementById('countEsMx');
    const countEn = document.getElementById('countEn');
    const countMargin = document.getElementById('countMargin');
    const countTextless = document.getElementById('countTextless');

    const tmdbCacheStats = document.getElementById('tmdbCacheStats');
    const btnClearTmdbCache = document.getElementById('btnClearTmdbCache');

    // La API Key de TMDb vive solo en el servidor (.tmdb_api_key, no servido por Nginx ni versionado).
    // El navegador nunca la recibe ni la envía en las URLs: solo sabe si existe y su versión enmascarada.
    let tmdbHasServerKey = false;

    function actualizarPlaceholderApiKey(masked) {
        if (!tmdbApiKeyInput) return;
        tmdbApiKeyInput.value = '';
        tmdbApiKeyInput.placeholder = tmdbHasServerKey
            ? `Guardada en el servidor (${masked}). Pega otra para sustituirla`
            : 'Pega tu API Key...';
    }

    async function enviarApiKeyAlServidor(key) {
        const formData = new FormData();
        formData.append('api_key', key);
        const res = await fetch('api_tmdb.php?action=save_config', { method: 'POST', body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.success) throw new Error(data.error || `HTTP ${res.status}`);
        tmdbHasServerKey = !!data.has_key;
        actualizarPlaceholderApiKey(data.api_key_masked || '');
        return data;
    }

    // Actualizar indicador de estadísticas de caché en disco
    async function actualizarStatsCache() {
        if (!tmdbCacheStats || !window.location.protocol.startsWith('http')) return;
        try {
            const res = await fetch(`api_tmdb.php?action=get_cache_info&t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success && data.cache) {
                    const c = data.cache;
                    tmdbCacheStats.textContent = `${c.count} ${c.count === 1 ? 'archivo' : 'archivos'} (${c.formatted})`;
                }
            }
        } catch {
            // Silencioso
        }
    }

    // Variables de configuración de Margen
    let marginConfig = { threshold: 18, percent: 14 };
    const tmdbMarginThresholdInput = document.getElementById('tmdbMarginThresholdInput');
    const tmdbMarginPercentInput = document.getElementById('tmdbMarginPercentInput');
    const marginThresholdVal = document.getElementById('marginThresholdVal');
    const marginPercentVal = document.getElementById('marginPercentVal');
    const btnSaveMarginConfig = document.getElementById('btnSaveMarginConfig');

    // Consultar configuración del servidor (config.json) al iniciar
    async function initTmdbConfig() {
        if (!window.location.protocol.startsWith('http')) return;
        try {
            const res = await fetch(`api_tmdb.php?action=get_config&t=${Date.now()}`);
            if (res.ok) {
                const data = await res.json();
                if (data.success) {
                    if (data.cache && tmdbCacheStats) {
                        const c = data.cache;
                        tmdbCacheStats.textContent = `${c.count} ${c.count === 1 ? 'archivo' : 'archivos'} (${c.formatted})`;
                    }
                    tmdbHasServerKey = !!data.has_server_key;
                    actualizarPlaceholderApiKey(data.api_key_masked || '');

                    // Migración: versiones anteriores guardaban la clave en localStorage
                    let legacyKey = '';
                    try { legacyKey = localStorage.getItem('tmdb_api_key') || ''; } catch {}
                    if (legacyKey) {
                        try {
                            if (!tmdbHasServerKey) await enviarApiKeyAlServidor(legacyKey);
                            localStorage.removeItem('tmdb_api_key');
                        } catch (e) {
                            console.warn('No se pudo migrar la API Key al servidor:', e);
                        }
                    }
                    if (data.margin) {
                        marginConfig = data.margin;
                        if (tmdbMarginThresholdInput) tmdbMarginThresholdInput.value = marginConfig.threshold;
                        if (marginThresholdVal) marginThresholdVal.textContent = marginConfig.threshold;
                        if (tmdbMarginPercentInput) tmdbMarginPercentInput.value = marginConfig.percent;
                        if (marginPercentVal) marginPercentVal.textContent = marginConfig.percent + '%';
                    }
                }
            }
        } catch {}
    }

    initTmdbConfig();

    // Guardar opciones de margen en config.json y reevaluar si hay carátulas cargadas
    async function guardarConfiguracionMargen(notify = false) {
        if (!window.location.protocol.startsWith('http')) return;
        try {
            const formData = new FormData();
            formData.append('margin_threshold', marginConfig.threshold);
            formData.append('margin_percent', marginConfig.percent);
            await fetch('api_tmdb.php?action=save_config', {
                method: 'POST',
                body: formData
            });

            // Limpiar caché en memoria de evaluación de bordes
            posterMarginCache.clear();

            // Si hay carátulas cargadas actualmente, reevaluarlas con el nuevo umbral
            if (currentTmdbData && Array.isArray(currentTmdbData.posters)) {
                currentTmdbData.posters.forEach(p => { p.has_margin = undefined; });
                Promise.all(currentTmdbData.posters.map(p => evaluatePosterMargin(p))).then(() => {
                    const marginCount = currentTmdbData.posters.filter(p => p.has_margin).length;
                    if (countMargin) countMargin.textContent = marginCount;
                    if (tmdbPostersModal && tmdbPostersModal.style.display !== 'none') {
                        renderTmdbModalGrid();
                    }
                });
            }

            if (notify) {
                showToast(`✅ Tolerancia (${marginConfig.threshold}) y franja (${marginConfig.percent}%) guardadas en config.json`, 'success');
            }
        } catch (e) {
            console.warn('Error guardando configuración de margen:', e);
            if (notify) {
                showToast('Error al guardar la configuración de margen en config.json', 'error');
            }
        }
    }

    if (tmdbMarginThresholdInput) {
        tmdbMarginThresholdInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            marginConfig.threshold = val;
            if (marginThresholdVal) marginThresholdVal.textContent = val;
        });
        tmdbMarginThresholdInput.addEventListener('change', () => guardarConfiguracionMargen(false));
    }

    if (tmdbMarginPercentInput) {
        tmdbMarginPercentInput.addEventListener('input', (e) => {
            const val = parseInt(e.target.value, 10);
            marginConfig.percent = val;
            if (marginPercentVal) marginPercentVal.textContent = val + '%';
        });
        tmdbMarginPercentInput.addEventListener('change', () => guardarConfiguracionMargen(false));
    }

    if (btnSaveMarginConfig) {
        btnSaveMarginConfig.addEventListener('click', async () => {
            btnSaveMarginConfig.disabled = true;
            const originalHtml = btnSaveMarginConfig.innerHTML;
            btnSaveMarginConfig.textContent = 'Guardando...';
            await guardarConfiguracionMargen(true);
            btnSaveMarginConfig.innerHTML = originalHtml;
            btnSaveMarginConfig.disabled = false;
        });
    }

    // Toggle de la sección de ajustes de TMDb (solo se abre/cierra al pulsar el icono)
    if (btnTmdbToggleConfig && tmdbConfigSection) {
        btnTmdbToggleConfig.addEventListener('click', () => {
            const isHidden = tmdbConfigSection.style.display === 'none';
            if (isHidden) {
                tmdbConfigSection.style.display = 'flex';
                btnTmdbToggleConfig.classList.add('active');
                actualizarStatsCache();
                if (tmdbApiKeyInput) {
                    tmdbApiKeyInput.focus();
                }
            } else {
                tmdbConfigSection.style.display = 'none';
                btnTmdbToggleConfig.classList.remove('active');
            }
        });
    }

    // Botón para limpiar los archivos temporales de caché
    if (btnClearTmdbCache) {
        btnClearTmdbCache.addEventListener('click', async () => {
            if (btnClearTmdbCache.disabled) return;
            btnClearTmdbCache.disabled = true;
            const originalHtml = btnClearTmdbCache.innerHTML;
            btnClearTmdbCache.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
                    <line x1="12" y1="2" x2="12" y2="6"></line>
                    <line x1="12" y1="18" x2="12" y2="22"></line>
                    <line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line>
                    <line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line>
                    <line x1="2" y1="12" x2="6" y2="12"></line>
                    <line x1="18" y1="12" x2="22" y2="12"></line>
                    <line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line>
                    <line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line>
                </svg>
                <span>Borrando...</span>
            `;

            try {
                const res = await fetch(`api_tmdb.php?action=clear_cache&t=${Date.now()}`);
                const data = await res.json();

                // Vaciar también la caché en memoria del evaluador de bordes
                if (typeof posterMarginCache !== 'undefined' && posterMarginCache.clear) {
                    posterMarginCache.clear();
                }

                if (data.success) {
                    if (tmdbCacheStats) {
                        tmdbCacheStats.textContent = '0 archivos (0 B)';
                    }
                    showToast(`🧹 Caché eliminada: ${data.deleted_count} archivos (${data.freed_formatted} liberados)`, 'success');
                } else {
                    showToast('No se pudo vaciar la caché: ' + (data.error || 'Error desconocido'), 'error');
                }
            } catch (err) {
                console.error('Error al limpiar caché:', err);
                showToast('Error de conexión al limpiar la caché', 'error');
            } finally {
                btnClearTmdbCache.disabled = false;
                btnClearTmdbCache.innerHTML = originalHtml;
            }
        });
    }

    if (btnSaveTmdbKey) {
        btnSaveTmdbKey.addEventListener('click', async () => {
            const val = tmdbApiKeyInput.value.trim();

            // Campo vacío: solo se borra la clave del servidor si se confirma expresamente
            if (!val && (!tmdbHasServerKey || !confirm('¿Eliminar la API Key guardada en el servidor?'))) {
                return;
            }

            try {
                await enviarApiKeyAlServidor(val);
            } catch (e) {
                showToast(`Error guardando la API Key: ${e.message}`, 'danger');
                return;
            }

            showToast(val ? 'API Key guardada en el servidor' : 'API Key eliminada del servidor', 'success');
            if (tmdbConfigSection) {
                tmdbConfigSection.style.display = 'none';
                if (btnTmdbToggleConfig) btnTmdbToggleConfig.classList.remove('active');
            }
        });
    }

    // Pestañas de modo (Directo vs Búsqueda por título vs Lote)
    function switchTmdbTab(tab) {
        if (tabTmdbDirect) tabTmdbDirect.classList.toggle('active', tab === 'direct');
        if (tabTmdbSearch) tabTmdbSearch.classList.toggle('active', tab === 'search');
        if (tabTmdbBatch) tabTmdbBatch.classList.toggle('active', tab === 'batch');

        if (tmdbDirectView) tmdbDirectView.style.display = (tab === 'direct') ? 'block' : 'none';
        if (tmdbSearchView) tmdbSearchView.style.display = (tab === 'search') ? 'block' : 'none';
        if (tmdbBatchView) tmdbBatchView.style.display = (tab === 'batch') ? 'block' : 'none';
    }

    if (tabTmdbDirect) tabTmdbDirect.addEventListener('click', () => switchTmdbTab('direct'));
    if (tabTmdbSearch) tabTmdbSearch.addEventListener('click', () => switchTmdbTab('search'));
    if (tabTmdbBatch) tabTmdbBatch.addEventListener('click', () => switchTmdbTab('batch'));

    // =========================================================================
    // Cola de Procesamiento por Lotes (Batch Queue)
    // =========================================================================
    let batchQueue = [];
    let batchCurrentIndex = -1;

    function extractBatchQueries(rawText) {
        if (!rawText) return [];
        return rawText
            .split(/[\r\n,;]+/)
            .map(s => s.trim())
            .filter(s => s.length > 0);
    }

    function updateBatchCountBadge() {
        if (!tmdbBatchInput || !batchCountBadge) return;
        const count = extractBatchQueries(tmdbBatchInput.value).length;
        batchCountBadge.textContent = count;
    }

    if (tmdbBatchInput) {
        tmdbBatchInput.addEventListener('input', updateBatchCountBadge);
    }

    if (btnClearBatchInput && tmdbBatchInput) {
        btnClearBatchInput.addEventListener('click', () => {
            tmdbBatchInput.value = '';
            updateBatchCountBadge();
        });
    }

    function updateBatchNavigatorUI() {
        if (!tmdbBatchNavigator) return;
        if (batchQueue.length <= 1) {
            tmdbBatchNavigator.style.display = 'none';
            if (btnBatchSaveAndNext) btnBatchSaveAndNext.style.display = 'none';
            return;
        }

        tmdbBatchNavigator.style.display = 'block';
        if (btnBatchSaveAndNext) btnBatchSaveAndNext.style.display = 'flex';

        if (batchCurrentIndexEl) batchCurrentIndexEl.textContent = (batchCurrentIndex + 1);
        if (batchTotalCountEl) batchTotalCountEl.textContent = batchQueue.length;

        const curr = batchQueue[batchCurrentIndex];
        if (batchCurrentTitleEl) {
            batchCurrentTitleEl.textContent = curr ? (curr.title || curr.query) : 'Cargando...';
        }

        if (btnBatchPrev) btnBatchPrev.disabled = (batchCurrentIndex <= 0);
        if (btnBatchNext) btnBatchNext.disabled = (batchCurrentIndex >= batchQueue.length - 1);

        if (batchQueueListEl) {
            batchQueueListEl.innerHTML = '';
            batchQueue.forEach((item, idx) => {
                const row = document.createElement('div');
                row.className = `batch-queue-item ${idx === batchCurrentIndex ? 'active' : ''}`;
                const statusIcon = item.status === 'saved' ? '✅' : (item.status === 'loaded' ? '👁️' : (item.status === 'error' ? '❌' : '⏳'));
                row.innerHTML = `
                    <span class="batch-item-num">${idx + 1}.</span>
                    <span class="batch-item-title">${item.title || item.query}</span>
                    <span class="batch-item-status">${statusIcon}</span>
                `;
                row.addEventListener('click', () => {
                    goToBatchIndex(idx);
                });
                batchQueueListEl.appendChild(row);
            });
        }
    }

    async function goToBatchIndex(index) {
        if (index < 0 || index >= batchQueue.length) return;
        batchCurrentIndex = index;
        const item = batchQueue[batchCurrentIndex];
        updateBatchNavigatorUI();

        showToast(`Lote (${index + 1}/${batchQueue.length}): Consultando ${item.query}...`, 'info');
        await loadFromTmdb(item.query, 'auto', true);

        if (currentTmdbData) {
            item.title = currentTmdbData.display_name || currentTmdbData.title;
            if (item.status !== 'saved') item.status = 'loaded';
        }
        updateBatchNavigatorUI();
    }

    function startBatchQueue(queries) {
        if (!queries || queries.length === 0) {
            showToast('Introduce al menos un ID o enlace de TMDb', 'warning');
            return;
        }
        batchQueue = queries.map(q => ({
            query: q,
            status: 'pending',
            title: q
        }));
        batchCurrentIndex = 0;
        showToast(`Lote iniciado con ${batchQueue.length} películas`, 'success');
        goToBatchIndex(0);
    }

    function closeBatchQueue() {
        batchQueue = [];
        batchCurrentIndex = -1;
        updateBatchNavigatorUI();
        showToast('Modo lote cerrado', 'info');
    }

    if (btnStartBatch && tmdbBatchInput) {
        btnStartBatch.addEventListener('click', () => {
            const queries = extractBatchQueries(tmdbBatchInput.value);
            startBatchQueue(queries);
        });
    }

    if (btnCloseBatch) {
        btnCloseBatch.addEventListener('click', closeBatchQueue);
    }

    if (btnBatchPrev) {
        btnBatchPrev.addEventListener('click', () => {
            if (batchCurrentIndex > 0) goToBatchIndex(batchCurrentIndex - 1);
        });
    }

    if (btnBatchNext) {
        btnBatchNext.addEventListener('click', () => {
            if (batchCurrentIndex < batchQueue.length - 1) goToBatchIndex(batchCurrentIndex + 1);
        });
    }

    // Botón especial: Guardar en Carpeta y avanzar a la siguiente del lote
    if (btnBatchSaveAndNext) {
        btnBatchSaveAndNext.addEventListener('click', async () => {
            if (!state.background) {
                showToast('Primero carga una imagen de póster', 'warning');
                return;
            }
            btnBatchSaveAndNext.disabled = true;
            const ok = await executeExport('folder');
            btnBatchSaveAndNext.disabled = false;
            if (ok && batchQueue.length > 0 && batchCurrentIndex >= 0) {
                batchQueue[batchCurrentIndex].status = 'saved';
                if (batchCurrentIndex < batchQueue.length - 1) {
                    goToBatchIndex(batchCurrentIndex + 1);
                } else {
                    showToast('🎉 ¡Has completado todas las películas del lote!', 'success');
                    updateBatchNavigatorUI();
                }
            }
        });
    }

    if (btnReopenTmdbModal) {
        btnReopenTmdbModal.addEventListener('click', () => {
            if (currentTmdbData) {
                openTmdbPostersModal(currentTmdbData);
            }
        });
    }

    // =========================================================================
    // Detección de Margen / Espacio Superior e Inferior para Carátula
    // =========================================================================
    const posterMarginCache = new Map();

    async function evaluatePosterMargin(p) {
        if (p.has_margin !== undefined) return p.has_margin;
        if (p.lang_category === 'textless') {
            p.has_margin = true;
            return true;
        }
        if (posterMarginCache.has(p.thumb_url)) {
            p.has_margin = posterMarginCache.get(p.thumb_url);
            return p.has_margin;
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = 60;
                    canvas.height = 90;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, 60, 90);

                    // Franja configurable (porcentaje superior e inferior)
                    const pct = (marginConfig.percent || 14) / 100;
                    const stripH = Math.max(4, Math.min(30, Math.round(90 * pct)));
                    const topData = ctx.getImageData(0, 0, 60, stripH).data;
                    const botData = ctx.getImageData(0, 90 - stripH, 60, stripH).data;

                    const getLocalEdgeDiff = (data) => {
                        let diff = 0;
                        let count = 0;
                        for (let i = 4; i < data.length; i += 4) {
                            const b1 = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
                            const b0 = 0.299 * data[i - 4] + 0.587 * data[i - 3] + 0.114 * data[i - 2];
                            diff += Math.abs(b1 - b0);
                            count++;
                        }
                        return count ? diff / count : 0;
                    };

                    const topDiff = getLocalEdgeDiff(topData);
                    const botDiff = getLocalEdgeDiff(botData);

                    // Umbral configurable: menor = más estricto, mayor = más permisivo
                    const thresh = marginConfig.threshold || 18;
                    const hasMargin = (topDiff < thresh || botDiff < thresh);
                    posterMarginCache.set(p.thumb_url, hasMargin);
                    p.has_margin = hasMargin;
                    resolve(hasMargin);
                } catch {
                    p.has_margin = false;
                    resolve(false);
                }
            };
            img.onerror = () => {
                p.has_margin = false;
                resolve(false);
            };
            img.src = p.thumb_url;
        });
    }

    // Normalizar categorización de idiomas (España: es-es, es; Latino: es-mx, es-ar, etc.)
    function normalizePosterLang(p) {
        const cat = (p.lang_category || '').toLowerCase().trim();
        const raw = (p.lang || '').toLowerCase().trim();

        // 1. España: es-es, es_es, 'es' o cualquier es- no latino
        if (cat === 'es-es' || raw === 'es-es' || raw === 'es_es' || raw === 'es' || (raw.startsWith('es-') && !raw.match(/^es-(mx|ar|co|cl|pe|ve|419)/))) {
            p.lang_category = 'es-es';
            p.lang = 'es-ES';
            return 'es-es';
        }
        // 2. Latino: es-mx, es-ar, es-419, etc.
        if (cat === 'es-mx' || raw === 'es-mx' || raw.match(/^es-(mx|ar|co|cl|pe|ve|419)/)) {
            p.lang_category = 'es-mx';
            return 'es-mx';
        }
        // 3. Inglés
        if (cat === 'en' || raw === 'en' || raw.startsWith('en-') || raw === 'en_us') {
            p.lang_category = 'en';
            return 'en';
        }
        // 4. Sin texto / textless
        if (cat === 'textless' || raw === 'xx' || raw === 'null' || !raw) {
            p.lang_category = 'textless';
            return 'textless';
        }

        p.lang_category = cat || 'other';
        return p.lang_category;
    }

    // Modal: Apertura y configuración de filtros
    function openTmdbPostersModal(data) {
        if (!tmdbPostersModal) return;
        currentTmdbData = data;

        const posters = data.posters || [];
        posters.forEach(p => normalizePosterLang(p));

        const title = data.display_name || data.title || 'Contenido TMDb';

        tmdbModalTitle.textContent = title;
        tmdbModalCountBadge.textContent = `${posters.length} carátulas`;
        tmdbModalSubtitle.textContent = `Selecciona tu carátula favorita; se ajustará automáticamente al lienzo`;

        // Actualizar botón en panel lateral para reabrir
        if (btnReopenTmdbModal && reopenTmdbCount) {
            btnReopenTmdbModal.style.display = 'flex';
            reopenTmdbCount.textContent = posters.length;
        }

        // Conteo inicial de variantes separando España y Latino
        const total = posters.length;
        const esEsCount = posters.filter(p => p.lang_category === 'es-es').length;
        const esMxCount = posters.filter(p => p.lang_category === 'es-mx').length;
        const enCount = posters.filter(p => p.lang_category === 'en').length;
        const textlessCount = posters.filter(p => p.lang_category === 'textless').length;

        if (countAll) countAll.textContent = total;
        if (countEsEs) countEsEs.textContent = esEsCount;
        if (countEsMx) countEsMx.textContent = esMxCount;
        if (countEn) countEn.textContent = enCount;
        if (countTextless) countTextless.textContent = textlessCount;

        // Por defecto: mostrar todas
        currentTmdbFilter = 'all';
        document.querySelectorAll('.tmdb-filter-tabs .modal-tab-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.filter === 'all');
        });

        renderTmdbModalGrid();
        tmdbPostersModal.style.display = 'flex';

        // Evaluar márgenes en segundo plano para actualizar el contador y badges
        Promise.all(posters.map(p => evaluatePosterMargin(p))).then(() => {
            const marginCount = posters.filter(p => p.has_margin).length;
            if (countMargin) countMargin.textContent = marginCount;

            // Reordenar dentro de cada grupo para que las que tienen más margen salgan antes
            posters.sort((a, b) => {
                if (a.priority !== b.priority) return a.priority - b.priority;
                if ((b.has_margin ? 1 : 0) !== (a.has_margin ? 1 : 0)) {
                    return (b.has_margin ? 1 : 0) - (a.has_margin ? 1 : 0);
                }
                return 0;
            });

            renderTmdbModalGrid();
        });
    }

    function closeTmdbPostersModal() {
        if (tmdbPostersModal) {
            tmdbPostersModal.style.display = 'none';
        }
    }

    if (btnCloseTmdbModal) btnCloseTmdbModal.addEventListener('click', closeTmdbPostersModal);
    if (btnCloseTmdbModalFooter) btnCloseTmdbModalFooter.addEventListener('click', closeTmdbPostersModal);
    if (tmdbPostersModal) {
        tmdbPostersModal.addEventListener('click', (e) => {
            if (e.target === tmdbPostersModal) closeTmdbPostersModal();
        });
    }

    // Filtrar carátulas en el modal
    document.querySelectorAll('.tmdb-filter-tabs .modal-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.tmdb-filter-tabs .modal-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentTmdbFilter = btn.dataset.filter;
            renderTmdbModalGrid();
        });
    });

    // Renderizar la cuadrícula de carátulas en el modal
    function renderTmdbModalGrid() {
        if (!tmdbModalGrid || !currentTmdbData) return;
        tmdbModalGrid.innerHTML = '';

        const allPosters = currentTmdbData.posters || [];
        let filtered = allPosters;

        if (currentTmdbFilter === 'es-es') {
            filtered = allPosters.filter(p => p.lang_category === 'es-es');
        } else if (currentTmdbFilter === 'es-mx') {
            filtered = allPosters.filter(p => p.lang_category === 'es-mx');
        } else if (currentTmdbFilter === 'en') {
            filtered = allPosters.filter(p => p.lang_category === 'en');
        } else if (currentTmdbFilter === 'margin') {
            filtered = allPosters.filter(p => p.has_margin);
        } else if (currentTmdbFilter === 'textless') {
            filtered = allPosters.filter(p => p.lang_category === 'textless');
        }

        if (filtered.length === 0) {
            if (tmdbModalEmpty) tmdbModalEmpty.style.display = 'block';
            return;
        } else {
            if (tmdbModalEmpty) tmdbModalEmpty.style.display = 'none';
        }

        filtered.forEach((p, idx) => {
            const card = document.createElement('div');
            card.className = 'tmdb-poster-card';

            // Etiqueta de idioma diferenciada
            let langBadgeHtml = '';
            let langLabel = 'Desconocido';
            if (p.lang_category === 'es-es') {
                langBadgeHtml = `<span class="badge-lang badge-lang-es-es">🇪🇸 ES-ES (España)</span>`;
                langLabel = 'Español (España)';
            } else if (p.lang_category === 'es-mx') {
                langBadgeHtml = `<span class="badge-lang badge-lang-es-mx">🇲🇽 ES-MX (Latino)</span>`;
                langLabel = 'Español (Latino)';
            } else if (p.lang_category === 'en') {
                langBadgeHtml = `<span class="badge-lang badge-lang-en">🇬🇧 EN (Inglés)</span>`;
                langLabel = 'Inglés';
            } else if (p.lang_category === 'textless') {
                langBadgeHtml = `<span class="badge-lang badge-lang-textless">✨ Sin texto</span>`;
                langLabel = 'Sin texto / Original';
            } else {
                langBadgeHtml = `<span class="badge-lang badge-lang-other">🌐 ${(p.lang || 'OT').toUpperCase()}</span>`;
                langLabel = p.lang ? p.lang.toUpperCase() : 'Otro';
            }

            const sizeBadgeHtml = p.size ? `<span class="badge-size">${p.size}</span>` : '';
            const marginBadgeHtml = p.has_margin ? `<span class="badge-margin" title="Espacio libre arriba y abajo para carátula">🛡️ Margen libre</span>` : '';

            card.innerHTML = `
                <div class="tmdb-poster-img-wrap">
                    <img src="${p.thumb_url}" alt="Carátula ${idx + 1}" class="tmdb-poster-img" loading="lazy">
                    <div class="tmdb-poster-badges">
                        ${langBadgeHtml}
                        ${sizeBadgeHtml}
                    </div>
                    <div class="tmdb-card-overlay">
                        <span class="tmdb-select-btn-overlay">
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                            Seleccionar
                        </span>
                    </div>
                </div>
                <div class="tmdb-poster-footer">
                    <span class="tmdb-poster-footer-lang">${langLabel}</span>
                    <div style="display:flex; align-items:center; gap:0.35rem;">
                        ${marginBadgeHtml}
                        <span style="font-size:0.65rem; color:var(--text-muted);">${p.size || 'HD'}</span>
                    </div>
                </div>
            `;

            card.addEventListener('click', async () => {
                closeTmdbPostersModal();
                showToast(`Cargando póster en alta definición...`, 'info');
                try {
                    const img = await tryLoadImage(p.original_url);
                    setImageSource(img, currentTmdbData.display_name || currentTmdbData.title);
                    showToast(`Póster cargado y ajustado: ${currentTmdbData.display_name || currentTmdbData.title}`, 'success');
                } catch {
                    try {
                        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(p.original_url)}`;
                        const imgProxy = await tryLoadImage(proxyUrl);
                        setImageSource(imgProxy, currentTmdbData.display_name || currentTmdbData.title);
                        showToast(`Póster cargado y ajustado`, 'success');
                    } catch {
                        showToast('No se pudo descargar la imagen seleccionada', 'danger');
                    }
                }
            });

            tmdbModalGrid.appendChild(card);
        });
    }

    // Consulta de TMDb (por enlace, ID o término)
    async function loadFromTmdb(query, type = 'auto', fromBatch = false) {
        if (!query || !query.trim()) {
            showToast('Introduce un ID o enlace de The Movie Database', 'warning');
            return;
        }

        // Si se han introducido múltiples IDs (separados por coma o salto de línea) y no venimos ya del lote, iniciar lote
        const queries = extractBatchQueries(query);
        if (!fromBatch && queries.length > 1) {
            startBatchQueue(queries);
            return;
        }

        const origBtnText = btnFetchTmdb ? btnFetchTmdb.innerHTML : '';
        if (btnFetchTmdb) {
            btnFetchTmdb.disabled = true;
            btnFetchTmdb.innerHTML = `
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
                <span>Buscando...</span>
            `;
        }

        showToast('Consultando carátulas en The Movie Database...', 'info');

        try {
            const url = `api_tmdb.php?action=fetch_direct&query=${encodeURIComponent(query.trim())}&type=${type}`;
            const response = await fetch(url);
            const data = await response.json();

            if (!data.success) {
                showToast(data.error || 'No se encontró la película o serie en TMDb', 'danger');
                if (batchQueue.length > 0 && batchCurrentIndex >= 0) {
                    batchQueue[batchCurrentIndex].status = 'error';
                    updateBatchNavigatorUI();
                }
                return;
            }

            // Asegurar que display_name incluye el año entre paréntesis
            if (data.year && data.display_name && !data.display_name.includes(`(${data.year})`)) {
                data.display_name = `${data.display_name} (${data.year})`;
            }

            currentTmdbData = data;

            // Si estamos en modo lote, actualizar información del elemento actual
            if (batchQueue.length > 0 && batchCurrentIndex >= 0) {
                batchQueue[batchCurrentIndex].title = data.display_name || data.title;
                if (batchQueue[batchCurrentIndex].status !== 'saved') {
                    batchQueue[batchCurrentIndex].status = 'loaded';
                }
                updateBatchNavigatorUI();
            }

            // Abrir modal con todas las carátulas ordenadas
            if (data.posters && data.posters.length > 0) {
                openTmdbPostersModal(data);
                showToast(`Se han encontrado ${data.posters.length} carátulas. Selecciona la que prefieras.`, 'success');
            } else if (data.poster_url) {
                // Si solo hay una carátula, cargarla directamente
                showToast(`Cargando carátula oficial...`, 'info');
                const img = await tryLoadImage(data.poster_url);
                setImageSource(img, data.display_name || data.title);
            } else {
                showToast('No se encontró ninguna carátula en la ficha de TMDb', 'warning');
            }
        } catch (err) {
            console.error('Error TMDb:', err);
            showToast('Error de conexión con el servicio TMDb', 'danger');
            if (batchQueue.length > 0 && batchCurrentIndex >= 0) {
                batchQueue[batchCurrentIndex].status = 'error';
                updateBatchNavigatorUI();
            }
        } finally {
            if (btnFetchTmdb) {
                btnFetchTmdb.disabled = false;
                btnFetchTmdb.innerHTML = origBtnText;
            }
        }
    }

    if (btnFetchTmdb) {
        btnFetchTmdb.addEventListener('click', () => {
            loadFromTmdb(tmdbInput.value);
        });
    }

    if (tmdbInput) {
        tmdbInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                loadFromTmdb(tmdbInput.value);
            }
        });
    }

    // Búsqueda por título (Modo API)
    async function searchTmdbTitles() {
        if (!tmdbSearchInput || !btnSearchTmdb || !tmdbSearchResults) return;
        const q = tmdbSearchInput.value.trim();
        if (!q) {
            showToast('Escribe un título para buscar', 'warning');
            return;
        }

        if (!tmdbHasServerKey) {
            showToast('Configura tu API Key de TMDb pulsando el icono ⚙️ para buscar por título', 'warning');
            return;
        }

        btnSearchTmdb.disabled = true;
        btnSearchTmdb.textContent = '...';
        tmdbSearchResults.style.display = 'none';
        tmdbSearchResults.innerHTML = '';

        try {
            const url = `api_tmdb.php?action=search&query=${encodeURIComponent(q)}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!data.success || !data.results || data.results.length === 0) {
                showToast('No se encontraron resultados para ese título', 'warning');
                return;
            }

            tmdbSearchResults.style.display = 'flex';
            data.results.slice(0, 10).forEach(item => {
                const row = document.createElement('div');
                row.className = 'tmdb-search-item';
                const typeLabel = item.type === 'tv' ? 'Serie' : 'Película';
                const thumbImg = item.poster_thumb 
                    ? `<img src="${item.poster_thumb}" class="tmdb-search-thumb" alt="${item.title}">` 
                    : `<div class="tmdb-search-thumb" style="display:flex;align-items:center;justify-content:center;font-size:0.6rem;color:var(--text-muted);">Sin foto</div>`;

                row.innerHTML = `
                    ${thumbImg}
                    <div class="tmdb-search-info">
                        <div class="tmdb-search-title">${item.title} ${item.year ? `(${item.year})` : ''}</div>
                        <div class="tmdb-search-meta">${typeLabel} ${item.original_title && item.original_title !== item.title ? `· ${item.original_title}` : ''}</div>
                    </div>
                `;

                row.addEventListener('click', () => {
                    tmdbSearchResults.style.display = 'none';
                    if (tmdbInput) tmdbInput.value = `${item.id}`;
                    loadFromTmdb(item.id, item.type);
                });

                tmdbSearchResults.appendChild(row);
            });
        } catch {
            showToast('Error al buscar títulos en TMDb', 'danger');
        } finally {
            btnSearchTmdb.disabled = false;
            btnSearchTmdb.textContent = 'Buscar';
        }
    }

    if (btnSearchTmdb) btnSearchTmdb.addEventListener('click', searchTmdbTitles);
    if (tmdbSearchInput) {
        tmdbSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                searchTmdbTitles();
            }
        });
    }

    fitViewport();
    render();
});