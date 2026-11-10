# 📂 Centro de Descargas — Explorador Web de Archivos

Aplicación web ligera en **PHP, JavaScript Vanilla y CSS3** para explorar directorios en árbol, buscar ficheros en tiempo real y compartir o descargar archivos directamente desde el navegador.

---

## ✨ Características Principales

- **🌳 Árbol de Directorios Dinámico**:
  - Escaneo recursivo automático en cada visita o bajo demanda mediante el botón **Actualizar** (`?ajax=1`).
  - Panel lateral navegable con botones para expandir o colapsar todas las ramas del árbol.
- **🔍 Búsqueda Global Instantánea**:
  - Filtra archivos y carpetas en tiempo real en todo el árbol sin necesidad de recargar la página.
- **🗂️ Vistas en Lista y Cuadrícula (Grid)**:
  - Alternancia instantánea entre vista detallada por filas y vista de tarjetas.
  - Clasificación e iconos automáticos según la extensión (`.apk`, `.exe`, `.deb`, `.iso`, `.zip`, vídeo, audio, imagen, documento, código).
- **🔗 Copiado Rápido de Enlaces Directos**:
  - Botón de 1 clic para copiar al portapapeles la URL pública directa de cualquier archivo junto con descarga directa.
- **🌗 Tema Oscuro / Claro**:
  - Selector de tema persistente mediante `localStorage` (`suite_theme`), sincronizado con el resto de aplicaciones de **Suite Web**.

---

## 📁 Estructura del Proyecto

```text
descargas/
├── index.php              # Interfaz principal e inyección inicial del árbol en vivo
├── actualizar_arbol.php   # Motor PHP de escaneo recursivo y endpoint AJAX (?ajax=1)
├── script.js              # Lógica de navegación, breadcrumbs, búsqueda, vistas y portapapeles
├── estilo.css             # Diseño responsive con soporte para tema claro y oscuro
└── descargas/             # Carpeta raíz donde se alojan los ficheros a compartir (ignorada en Git)
```

---

## 🚀 Uso

1. Coloca tus archivos o subcarpetas dentro de `suite-web/www/descargas/descargas/` (o directamente en el directorio).
2. Accede desde el navegador a:
   ```text
   http://<ip-servidor>:8080/descargas/
   ```
3. El índice de archivos se actualiza automáticamente al cargar la página o pulsando el botón **Actualizar** de la barra superior.

