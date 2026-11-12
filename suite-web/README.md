# 🌐 Suite Web (Nginx + PHP-FPM)

Stack ligero basado en **Nginx Alpine** y **PHP 8.5 FPM Alpine** que aloja utilidades y aplicaciones web propias del homelab bajo un único servicio unificado.

---

## 📦 Aplicaciones Incluidas en `www/`

1. **[📂 Centro de Descargas (`www/descargas/`)](www/descargas/README.md)**
   - Explorador web interactivo en árbol de directorios con búsqueda instantánea, vistas en lista/cuadrícula y copiado directo de enlaces de descarga.
2. **[🎬 Generador de Carátulas 4K (`www/generarPoster/`)](www/generarPoster/README.md)**
   - Estudio de diseño de carátulas para colecciones de cine y series con integración TMDb, plantillas 4K y exportación por lotes (Packs).
3. **🔒 Generador de Contraseñas (`www/generarPassword/`)**
   - No versionado (excluido en `.gitignore`). Nginx solo lo sirve cuando se accede por IP local (`192.168.x.x`, `localhost` o `127.x`) y devuelve 404 desde cualquier dominio público.

---

## ⚙️ Arquitectura del Stack

- **Contenedor Web (`suite_nginx`)**: `nginx:alpine` expuesto por defecto en el puerto `8080` (`${SUITE_PORT:-8080}:80`), con compresión `gzip`, soporte para subidas de hasta `128M`, detección de la IP real tras Nginx Proxy Manager (`X-Forwarded-For`) y página `404.html` personalizada, que también hace de portal (`/` redirige a `/404.html`).
- **Contenedor PHP (`suite_php`)**: `php:8.5-fpm-alpine` conectado por red interna `suite_net` con límites ampliados en `php/uploads.ini` (subidas de 128M, 256M de memoria, 300 s de ejecución, zona horaria `Europe/Madrid`).
- **Comprobación de actualizaciones**: `config.sh` vigila `nginx:alpine` (`IMAGE`); la imagen de PHP se actualiza al hacer `./update.sh suite-web`, pero la opción `c` no avisa de sus versiones nuevas.

---

## 🚀 Despliegue

Desde el gestor principal en la raíz del repositorio:

```bash
./update.sh suite-web
```

O directamente con Docker Compose:

```bash
cd suite-web && docker compose up -d
```

