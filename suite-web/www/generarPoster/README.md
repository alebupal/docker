# 🎬 Generador de Carátulas 4K — Estudio Web de Pósters

Estudio web interactivo en **HTML5 Canvas, JavaScript y PHP** diseñado para componer, ajustar y exportar carátulas de películas y series en alta resolución (**4K UHD**, **Full UHD**, **Remux**, **BDCore**, **Web-DL**, **Web-Rip**).

---

## ✨ Características Principales

- **🔎 Integración con TMDb (The Movie Database)**:
  - **Modo Directo (sin API Key)**: Extracción paralela ultrarrápida (`curl_multi`) de pósters oficiales en español (`es-ES`), inglés (`en`) y sin texto directamente desde `themoviedb.org`, con caché local configurable.
  - **Modo API Oficial v3**: Búsqueda por título, año y selección visual en galería de todos los pósters disponibles.
- **🖼️ Carga Flexible de Imágenes**:
  - Arrastrar y soltar (*Drag & Drop*) en cualquier parte de la ventana.
  - Pegado directo desde el portapapeles (`Ctrl + V`).
  - Carga desde archivo local o mediante URL directa.
- **🎨 Marcos y Plantillas Personalizables (`cover/`)**:
  - Previsualización en vivo de plantillas PNG transparentes (`4K_FULL`, `4K_REMUX`, `4K_BDCORE`, `4K_WEB-DL`, `4K_WEB-RIP`).
  - Gestión de **Packs de descarga** (ej. generar y descargar `FULL + REMUX` simultáneamente en 1 clic).
  - Subida y administración de nuevas plantillas desde la propia interfaz.
- **📐 Ajuste Inteligente en Lienzo (Canvas)**:
  - Detección automática de márgenes y encuadre inteligente del póster bajo la franja superior de la carátula.
  - Controles de zoom, posición horizontal/vertical (`X` / `Y`), rotación, restablecimiento y ajuste por teclado (flechas y `Shift + flechas`).
- **💾 Exportación de Alta Calidad**:
  - Descarga directa en PNG con nomenclatura automática a partir del título y año de la película, además de guardado opcional en `cover_download/`.

---

## 📁 Estructura del Proyecto

```text
generarPoster/
├── index.html          # Interfaz del estudio de composición y modales de búsqueda/ajustes
├── script.js           # Motor de renderizado Canvas, controles de lienzo, atajos y flujos de exportación
├── estilo.css          # Estilos de la aplicación (temas oscuro y claro)
├── api_tmdb.php        # Backend PHP con cURL paralelo y sistema de caché para TMDb
├── api_covers.php      # API REST para listar, subir, eliminar plantillas y guardar carátulas
├── api_packs.php       # API REST para gestionar packs de exportación múltiple
├── config.json         # Configuración persistente (API Key opcional, TTL de caché, márgenes y packs)
├── cover/              # Plantillas PNG base (4K_FULL, 4K_REMUX, 4K_BDCORE, etc.)
├── cache/              # Caché temporal de consultas TMDb (ignorada en Git)
└── cover_download/     # Salida local de carátulas generadas (ignorada en Git)
```

---

## 🚀 Uso

Accede desde el navegador a través del contenedor `suite-web`:

```text
http://<ip-servidor>:8080/generarPoster/
```

1. Busca una película o serie en el buscador **TMDb** (o arrastra una imagen / pega con `Ctrl + V`).
2. Elige la plantilla deseada o un **Pack** (por ejemplo, *FULL + REMUX*).
3. Ajusta el encuadre si es necesario y pulsa **Descargar Carátula**.
