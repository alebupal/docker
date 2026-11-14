# 🌐 Suite Web (Nginx + PHP-FPM)

Stack ligero basado en **Nginx Alpine** y **PHP 8.5 FPM Alpine** que aloja utilidades y aplicaciones web propias del homelab bajo un único servicio unificado.

---

## 📦 Aplicaciones Incluidas en `www/`

1. **[📂 Centro de Descargas (`www/descargas/`)](www/descargas/README.md)**
   - Explorador web interactivo en árbol de directorios con búsqueda instantánea, vistas en lista/cuadrícula y copiado directo de enlaces de descarga.
2. **[🎬 Generador de Carátulas 4K (`www/generarPoster/`)](www/generarPoster/README.md)**
   - Estudio de diseño de carátulas para colecciones de cine y series con integración TMDb, plantillas 4K y exportación por lotes (Packs).
3. **🔒 Generador de Contraseñas (`www/generarPassword/`)**
   - No versionado (excluido en `.gitignore`). Nginx solo lo sirve a clientes de la red local y devuelve 404 al resto (ver [Seguridad](#-seguridad-red-local-y-acceso-desde-fuera)).

---

## ⚙️ Arquitectura del Stack

- **Contenedor Web (`suite_nginx`)**: `nginx:alpine` expuesto por defecto en el puerto `8080` (`${SUITE_PORT:-8080}:80`), con compresión `gzip`, soporte para subidas de hasta `128M`, detección de la IP real tras Nginx Proxy Manager (`X-Forwarded-For`) y cabeceras de seguridad (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`). El portal es `www/index.html` y se sirve en `/`; la misma página hace de error 404 (muestra «404 · No hemos encontrado esta página» cuando la ruta no existe).
- **Contenedor PHP (`suite_php`)**: `php:8.5-fpm-alpine` conectado por red interna `suite_net` con límites ampliados en `php/uploads.ini` (subidas de 128M, 256M de memoria, 300 s de ejecución, zona horaria `Europe/Madrid`). Los errores y avisos de PHP van al log del contenedor (`docker logs suite_php`), nunca a las respuestas.
- **Healthchecks**: `suite_php` comprueba que PHP-FPM escucha en el `9000` y `suite_nginx` que sirve el portal; nginx no arranca hasta que PHP está sano. `update.sh` usa este estado para saber si el stack quedó bien tras actualizar.
- **Comprobación de actualizaciones**: `update.sh` (opción `c` y Dockpanel) comprueba **las dos imágenes** del `docker-compose.yml` (`nginx:alpine` y `php:8.5-fpm-alpine`); `IMAGE` de `config.sh` solo se usa si no se pueden leer las del compose.

---

## 🔒 Seguridad: red local y acceso desde fuera

Nginx decide qué es «red local» por la **IP real del cliente** (`127.0.0.0/8`, `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`; tras Nginx Proxy Manager se toma de `X-Forwarded-For`). No usa la cabecera `Host`, que la elige quien hace la petición.

| Desde la red local | Desde fuera (p. ej. publicado por NPM con un dominio) |
|---|---|
| Todo funciona. | **Solo lectura**: se ven el portal, las descargas y el generador de carátulas (buscar en TMDb, componer y descargar la imagen en el navegador). |
| | Responden `403 {"success":false,"error":"Esta acción solo está disponible desde la red local"}`: cualquier `POST` a un `.php` (subir o borrar plantillas, guardar en `cover_download/`, packs, API Key y márgenes), `api_tmdb.php?action=clear_cache` y el proxy de imágenes `api_imagen.php`. |
| | El generador de contraseñas responde `404`. El botón «Actualizar» de descargas usa el último escaneo (no fuerza uno nuevo). |

Si accedes por VPN (WireGuard, Tailscale…) con una IP de esos rangos, cuentas como red local.

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

