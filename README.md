# 🐳 Gestor y Actualizador de Servicios Docker

Este repositorio contiene un sistema unificado y automatizado en Bash para la gestión, comprobación, actualización, monitorización, recreación, configuración de políticas de reinicio y copia de seguridad de servicios Docker.

Soporta nativamente dos modos de despliegue:
- **`MODE="run"`** (Modo normal): Contenedores individuales lanzados con `docker run`.
- **`MODE="compose"`** (Modo compose/composer): Stacks de contenedores gestionados con `docker-compose.yml`.

---

## 📁 Estructura del Repositorio

```text
docker/
├── update.sh               # 🚀 Script principal unificado (bucle interactivo + CLI)
├── config-template.sh      # 📄 Plantilla de referencia para nuevos servicios
├── README.md               # 📖 Documentación del gestor
├── .github/workflows/
│   └── shellcheck.yml      # CI: bash -n + shellcheck en cada push/PR a main
├── .user_home              # (No versionado) Ruta base persistente (--set-user-home)
│
└── <nombre_servicio>/      # Carpeta para cada servicio gestionado
    ├── config.sh           # Configuración del servicio (MODE="run" o MODE="compose")
    ├── docker-compose.yml  # (Opcional) Solo requerido si MODE="compose"
    └── .env                # (No versionado) Rutas personales y secretos
```

---

## 📦 Servicios Incluidos

| Servicio | Carpeta | Modo | Imagen | Puerto(s) host |
|---|---|---|---|---|
| AceStream Scraper | `acestream-scraper` | compose | `pipepito/acestream-scraper:latest` | 8008 (UI), 8086, 8621, 43110-43111, 26552 |
| AdGuard Home | `adguardhome` | compose | `adguard/adguardhome:latest` | 53, 3000, 8083, 853, 784/udp |
| aMule | `amule` | compose | `ngosang/amule:latest` | 4711 (UI), 4712, 4662, 4665/udp, 4672/udp |
| Backrest | `backrest` | compose | `ghcr.io/garethgeorge/backrest:latest` | 9898 |
| BentoPDF | `bentopdf` | compose | `bentopdfteam/bentopdf:latest` | 3004 |
| ConvertX | `convertx` | compose | `ghcr.io/c4illin/convertx:latest` | 3005 |
| Dockpanel | `dockpanel` | run | `alebupal/dockpanel:latest` | host (8092) |
| Downtify | `downtify` | run | `ghcr.io/henriquesebastiao/downtify:latest` | 8800 |
| DuckDNS | `duckdns` | run | `lscr.io/linuxserver/duckdns:latest` | — |
| FileBrowser Quantum | `filebrowser` | compose | `ghcr.io/gtsteffaniak/filebrowser:stable` | 8082 |
| Homepage | `homepage` | run | `ghcr.io/gethomepage/homepage:latest` | 3002 |
| Immich | `immich-app` | compose | `ghcr.io/immich-app/immich-server:v3` (+ ML, Postgres, Valkey) | 2283 |
| IT Tools | `it_tools` | run | `corentinth/it-tools:latest` | 8087 |
| JDownloader 2 | `jdownloader-2` | run | `jlesage/jdownloader-2:latest` | 5800 |
| Kutt | `kutt` | run | `kutt/kutt:latest` | 3003 |
| Mealie | `mealie` | run | `ghcr.io/mealie-recipes/mealie:latest` | 9005 |
| MeTube | `metube` | run | `ghcr.io/alexta69/metube` | 8081 |
| MusicGrabber | `musicgrabber` | compose | `g33kphr33k/musicgrabber:latest` | 38274 |
| NetAlertX | `netalertx` | compose | `ghcr.io/netalertx/netalertx:latest` | host (20211) |
| Nginx Proxy Manager | `nginx-proxy-manager` | compose | `jc21/nginx-proxy-manager:latest` | 80, 443, 1000 (panel) |
| PairDrop | `pairdrop` | run | `lscr.io/linuxserver/pairdrop:latest` | 3001 |
| Portainer | `portainer` | run | `portainer/portainer-ce:latest` | 9000, 8000 |
| Stirling PDF | `stirling_pdf` | run | `stirlingtools/stirling-pdf:latest` | 8085 |
| Suite Web | `suite-web` | compose | `php:8.5-fpm-alpine` + `nginx:alpine` | 8080 (`SUITE_PORT`) |
| Termix | `termix` | compose | `ghcr.io/termix-ssh/termix:latest` | 8088 |
| Tinyauth | `tinyauth` | compose | `ghcr.io/tinyauthapp/tinyauth:v5` | 3006 |
| Toolbox | `toolbox` | run | `alebupal/toolbox:latest` | host (8090) |
| Tvheadend | `tvheadend` | run | `ghcr.io/linuxserver/tvheadend:latest` | host |
| Tvspy | `tvspy` | run | `alebupal/tvspy:dev` | 32755 |
| Vaultwarden | `vaultwarden` | run | `vaultwarden/server:latest` | 9158 |
| WGDashboard | `wgdashboard` | compose | `ghcr.io/wgdashboard/wgdashboard:latest` | 10086, 51820/udp |

---

## 🚀 Funcionalidades Principales

1. **🔄 Menú Interactivo de Alto Rendimiento con Caché Global**:
   - Muestra en tiempo real el estado de todos los contenedores (`🟢 RUNNING`, `🔴 STOPPED`, `⚪ OFFLINE`), modo de ejecución y **puerto host asignado** (`:8080`, `:3000`, etc.).
   - **Renderizado instantáneo (<0.05s)** gracias a la caché global del estado de Docker (`refresh_docker_state_cache`), evitando llamadas lentas y repetitivas a la API de Docker.

2. **⚡ Detección Paralela y Ultrarrápida de Actualizaciones (SHA256)**:
   - Comprueba los hashes SHA256 de las imágenes locales frente al registro remoto (`docker buildx imagetools inspect`) mediante un **pool concurrente de trabajadores en paralelo** (hasta 6 tareas simultáneas).
   - Permite con la opción `u` descargar e instalar directamente solo los servicios que tengan versión nueva disponible.

3. **🔁 Gestión de Políticas de Reinicio en Caliente (`restart policy`)**:
   - **Aplicación instantánea sin caídas**: Ejecuta `docker update --restart=<politica>` sobre los contenedores en ejecución sin detener el servicio.
   - **Persistencia automática**: Actualiza o inyecta la política elegida en `docker-compose.yml` (`restart: ...`) o en `config.sh` (`--restart ...` en `EXTRA_ARGS`).
   - Políticas soportadas: `unless-stopped` (recomendada), `always`, `on-failure` y `no`.
   - Modificación individual o masiva para todos los servicios a la vez (atajo `pa` o CLI).

4. **🎯 Selección Flexible de Servicios**:
   - En cualquier menú o comando CLI, los servicios se pueden seleccionar por su **número de índice** (`1..N`), su **carpeta exacta**, o mediante **búsqueda por nombre descriptivo** (`resolve_service_input`).
   - En el menú principal, escribir el número o nombre de un servicio abre directamente su submenú de acciones (el mismo que `p` tras elegir servicio).

5. **⏯️ Ciclo de Vida Integral (Start / Stop / Restart / Recreate)**:
   - Control individual o masivo sobre todos los servicios con un solo comando o selección.
   - **🔨 Recrear contenedor / stack (`recreate`)**: En modo Compose fuerza la reconstrucción limpia (`docker compose up -d --force-recreate --remove-orphans`) aplicando de inmediato cambios en variables de entorno o volúmenes; en modo run renombra el contenedor previo a `<nombre>_old`, crea el nuevo y solo elimina el anterior si el nuevo pasa la **comprobación de salud**; si `docker run` falla o el nuevo no está sano, muestra sus últimos logs, lo borra y restaura y arranca el anterior (rollback).
   - Atajos directos para todos los servicios a la vez: `sa` (start-all), `ra` (restart-all), `ca` (recreate-all), `ta` (stop-all) y `pa` (policy-all).

6. **⚡ Actualización en Caliente Sin Tiempo de Corte (Zero-Downtime)**:
   - En servicios Compose, utiliza `docker compose up -d --remove-orphans`, actualizando y recreando únicamente los contenedores con nuevas imágenes sin destruir redes ni provocar caídas de servicio.

   - **🩺 Comprobación de salud tras actualizar/recrear**: durante `HEALTH_WAIT` segundos (15 por defecto) se comprueba con `docker inspect` que los contenedores siguen en marcha y sin reinicios (`Running`, `Restarting`, `RestartCount`); si la imagen tiene `HEALTHCHECK`, se espera además a `healthy` hasta `HEALTH_TIMEOUT` segundos (90 por defecto). Ambos se pueden fijar por servicio en su `config.sh` (`HEALTH_WAIT=0` desactiva la comprobación) o para toda la ejecución (`HEALTH_WAIT=30 ./update.sh -a`).
     - **Modo run**: si no está sano, se muestran las últimas líneas de `docker logs`, se borra el nuevo y se restaura el `<nombre>_old` (si no había anterior, se deja el nuevo para revisarlo). La actualización queda como ERROR.
     - **Modo compose**: se comprueban todos los contenedores del proyecto (`docker compose ps -a`; los de una sola ejecución que terminan con código 0 cuentan como correctos). Si alguno no está sano se muestran sus logs y se marca ERROR, **sin rollback automático**: en stacks con base de datos (p. ej. Immich) la nueva versión puede haber migrado ya el esquema y volver atrás a ciegas sería peor. Como con error no se hace `docker image prune`, las imágenes anteriores se conservan y el script imprime los `docker tag <id_anterior> <imagen>` + `docker compose up -d` para volver a ellas a mano.

7. **📊 Monitor de Recursos en Vivo (`docker stats`)**:
   - Inspecciona en tiempo real el consumo de CPU, memoria RAM, I/O de red e I/O de disco de todos los contenedores en ejecución.

8. **🧹 Centro de Limpieza y Mantenimiento**:
   - Menú guiado para vaciar el historial de logs, eliminar copias de seguridad antiguas y ejecutar limpieza de imágenes huérfanas (`docker image prune`) o limpieza profunda del sistema (`docker system prune`).

9. **🛡️ Detección y Sugerencia de Puertos Libres**:
   - Al crear un nuevo servicio, comprueba automáticamente si el puerto host elegido ya está en uso por el sistema o por otro contenedor, calculando y sugiriendo el siguiente puerto libre disponible con 1 clic.

10. **💾 Copias de Seguridad Automatizadas y Restauración (Rollback)**:
    - Compatible tanto con contenedores individuales (`MODE="run"`) como con stacks (`MODE="compose"`).
    - Si `DO_BACKUP=true`, realiza un backup comprimido `.tar.gz` antes de actualizar, con el contenedor/stack ya detenido (solo cuando realmente se va a recrear). Si la actualización falla, el backup se conserva.
    - **Si el backup previo falla, no se actualiza**: se muestra el error de `tar` (permisos, disco lleno...), se vuelve a arrancar el contenedor o stack con su versión anterior y la actualización queda como ERROR en el log (`backup previo fallido`). Un aviso de `tar` porque un fichero cambió durante la copia (código 1) no se considera fallo.
    - Las rutas se guardan relativas a `/` (`tar -C /`) y se restauran en su ubicación original; los backups del formato antiguo se siguen detectando y restaurando.
    - Los volúmenes con nombre y los bind mounts externos (en compose) no se incluyen: el script avisa de ellos. En el backup manual (`k`) se ofrece detener temporalmente los servicios.
    - **Restaurador integrado**: Permite listar e intentar restaurar backups desde `$USER_HOME/docker_backups` (configurable con la variable `BACKUP_DIR`).
    - **Retención automática**: en las operaciones que modifican algo (actualizar, ciclo de vida, backup, menú interactivo…) se eliminan los `.tar.gz` de esa carpeta con más de `BACKUP_RETENTION_DAYS` días (7 por defecto; `0` desactiva el borrado), **conservando siempre los `BACKUP_KEEP_MIN` más recientes de cada servicio** (3 por defecto), aunque sean antiguos. No se borra nada al consultar (`--help`, `-l`, `-m`, `-r`, `-s`, `-c`). Ejemplo: `BACKUP_RETENTION_DAYS=30 BACKUP_KEEP_MIN=5 ./update.sh -a`. Lo eliminado se anota en el log de operaciones, `update-containers.log`, dentro de esa misma carpeta.

11. **🆕 Asistente y Generador Automático de Servicios**:
    - Generación automática pegando un comando `docker run` completo (se analiza sin ejecutar nada). Los volúmenes con ruta absoluta del host (`/mnt/...`, `/home/...`, `~/...`) conservan su ubicación real, pero esa ruta se guarda en el `.env` del servicio como `<SERVICIO>_<CARPETA>_DIR` y en `config.sh` queda `${VAR}`; los relativos, `$PWD` o volúmenes con nombre se mapean a `${USER_HOME}/config/<nombre del destino>` y el `.env` recibe `USER_HOME=<carpeta del servicio>`. Las variables `-e` sensibles (PASS, TOKEN, SECRET, KEY, HASH) también van al `.env`. Los argumentos con espacios se escriben entre comillas simples en `config.sh` (`-e 'MSG=hola mundo'`), y las variables del `.env` cuyo valor tiene espacios, comillas o `\` se pasan como `-e VAR` (docker toma el valor del `.env`, que en modo `run` se exporta). Así `config.sh` y `docker-compose.yml`, que son lo único que se versiona, no contienen rutas personales ni secretos. Lo mismo aplica al asistente paso a paso, y la plantilla de compose usa `${DATA_DIR}` definido en `.env`.
    - Asistente guiado interactivo paso a paso para crear servicios `docker run` o `docker compose`.

> **Convención de rutas:** el `.env` de cada servicio en modo `run` define `USER_HOME` como la carpeta del propio servicio, y su `config.sh` usa rutas cortas (`${USER_HOME}/config`). Como el `.env` se carga antes que `config.sh`, las rutas personales quedan solo en el `.env`.

> **Cómo se lee el `.env`:** `update.sh` no lo ejecuta con bash: lo lee línea a línea con las mismas reglas que docker compose (`CLAVE=valor`; `'valor'` literal, sin expandir `$`; `"valor"` con `${VAR}` y escapes; `# comentario` tras un espacio). Así los valores con `$` o espacios llegan intactos. En modo `run` las claves se exportan para `docker run -e CLAVE`; en modo `compose` no se exportan y docker compose lee su `.env` directamente, para que el entorno del script nunca tenga prioridad sobre el fichero.

---

## 💻 Guía de Uso

### 1. Menú Interactivo (Recomendado)
Ejecuta el script sin parámetros para abrir la interfaz interactiva:

```bash
./update.sh
```

**Estructura del menú:**

```text
── 🚀 Actualizaciones (Internet) ──
 c) 🔍 Comprobar actualizaciones disponibles (SHA256)
 a) ⬇️ Actualizar TODOS los servicios (Pull de imágenes y despliegue)

── ⏯️ Control de Contenedores (Local) ──
 p) 🕹️ Ciclo de Vida: Iniciar, Detener, Reiniciar, Recrear o ver comando de arranque
 1..N) 🎯 Número o nombre de un servicio → sus acciones (iniciar, detener, actualizar...)

── 📊 Monitorización y Diagnóstico ──
 l) 📋 Ver logs de un servicio en vivo (tail -f)
 m) 📈 Monitor de recursos en tiempo real (docker stats)

── 🛠️ Administración y Mantenimiento ──
 n) ✨ Crear NUEVO servicio Docker (Asistente guiado)
 b) 🧹 Limpieza y mantenimiento (Logs, Backups, Prune del sistema)
 k) 💾 Crear copia de seguridad ahora (individual o de TODOS)
 r) 💾 Restaurar copia de seguridad (Rollback)
 h) ⚙️ Configurar ruta base de usuario (actual: /home/usuario)

── ℹ️ Ayuda y Salida ──
 ?) ❓ Ayuda detallada y comandos CLI
 q) 🚪 Salir
```

#### Uso del menú `p` (Gestión de Servicios y Ciclo de Vida):
Al pulsar `p`, tienes centralizadas todas las operaciones sobre tus contenedores:
* **`1..N`** o **Nombre**: Elige un servicio específico $\rightarrow$ selecciona acción:
  - `1) ▶ Iniciar (start)`
  - `2) ⏹ Detener (stop)`
  - `3) 🔄 Reiniciar (restart)`
  - `4) 🔨 Recrear contenedor / stack (recreate)`
  - `5) 🚀 Actualizar imagen y desplegar (Pull desde internet)`
  - `6) 🔁 Cambiar política de reinicio (restart policy)`
* **`a`**: Gestionar TODOS los servicios $\rightarrow$ selecciona la acción deseada para todos.
* **`ua`**: *(Atajo rápido)* **Actualizar TODOS** descargando nuevas imágenes desde internet (`update-all`).
* **`ca`**: *(Atajo rápido)* **Recrear TODOS** en local sin descargar (`recreate-all`).
* **`sa`**: *(Atajo rápido)* **Iniciar TODOS** los servicios detenidos (`start-all`).
* **`ra`**: *(Atajo rápido)* **Reiniciar TODOS** los servicios (`restart-all`).
* **`ta`**: *(Atajo rápido)* **Detener TODOS** los servicios (`stop-all`).
* **`pa`**: *(Atajo rápido)* **Cambiar política de reinicio a TODOS** (`policy-all`).

---

### 2. Uso por Línea de Comandos (CLI)
Puedes invocar todas las funciones directamente mediante argumentos para automatización o tareas programadas de `cron`:

```bash
# Pantalla de ayuda y documentación
./update.sh --help    # o ./update.sh -?  /  ./update.sh help

# Comprobar actualizaciones de todos los servicios (SHA256 en paralelo; requiere docker buildx)
./update.sh -c        # o ./update.sh --check

# Ciclo de vida para un servicio individual
./update.sh --start <servicio>
./update.sh --stop <servicio>
./update.sh --restart <servicio>
./update.sh --recreate <servicio>    # Recrear contenedor/stack forzosamente

# Ciclo de vida masivo (TODOS los servicios a la vez)
./update.sh --start-all       # o ./update.sh --start all
./update.sh --stop-all        # o ./update.sh --stop all
./update.sh --restart-all     # o ./update.sh --restart all
./update.sh --recreate-all    # o ./update.sh --recreate all
# ⚠️ Sin <servicio>, --start/--stop/--restart/--recreate se aplican a TODOS los servicios.

# Cambiar política de reinicio (unless-stopped | always | on-failure | no)
./update.sh --restart-policy <servicio> <politica>   # ej: ./update.sh -rp portainer unless-stopped
./update.sh --restart-policy all <politica>          # Aplicar a todos los servicios
./update.sh --policy <politica>                      # Atajo directo para aplicar a todos
./update.sh -rp all                                  # Sin política: aplica unless-stopped

# Actualizar todos los servicios de forma masiva (Pull + Deploy)
./update.sh -a        # o ./update.sh --all
./update.sh -a -f     # Forzar además recreación de todos los servicios (o -fa / -af)

# Actualizar un único servicio por su carpeta, índice o parte de su nombre
# (si el texto coincide con varios servicios se usa el primero)
./update.sh <servicio>
./update.sh -f <servicio>  # Forzar recreación (o ./update.sh <servicio> -f / --force)
# (no ejecuta 'docker image prune'; la limpieza se hace en las actualizaciones masivas o con -b)

# Monitor de recursos en vivo (CPU / Memoria / Red)
./update.sh -m        # o ./update.sh --stats

# Ver logs en vivo de un servicio (tail -f)
./update.sh -l <servicio>   # o ./update.sh --logs <servicio>

# Mostrar comandos de arranque exactos (valores sensibles enmascarados)
./update.sh -s                    # o ./update.sh --show / --show all: todos los servicios
./update.sh -s portainer it_tools # solo los indicados
# En el menú interactivo: 'p' → servicio → 7) Mostrar comando de arranque, o 'ma' para todos

# Menú de limpieza y mantenimiento
./update.sh -b        # o ./update.sh --clean

# Crear copia de seguridad manual (individual o masiva)
./update.sh -k            # Menú guiado de backup
./update.sh -k <servicio> # o ./update.sh --backup <servicio>
./update.sh -k all        # o ./update.sh --backup all (TODOS)

# Asistente de restauración de copias de seguridad (Rollback)
./update.sh -r        # o ./update.sh --restore

# Crear nuevo servicio interactivamente o desde un comando 'docker run'
./update.sh -n            # o ./update.sh --new
./update.sh -n 'docker run -d -p 8080:80 --name mi_app nginx:alpine'

# Configurar ruta base persistente del usuario
./update.sh --set-user-home /home/usuario

# Salidas en TSV para scripts y para el panel web Dockpanel (sin colores ni preguntas)
./update.sh --list        # carpeta, nombre, modo, puerto, RUNNING|STOPPED|OFFLINE, imagen, contenedor, backup
./update.sh --check-tsv [svc...]  # carpeta, update|ok|error (cada línea en cuanto termina ese servicio)
                                  # con actualización, antes: carpeta, images, img1,img2
```

---

## ⚙️ Configuración de un Servicio (`config.sh`)

Cada servicio se ubica en su propia subcarpeta con un archivo `config.sh`.

### Ejemplo A: Servicio `docker run` (`MODE="run"`)
```bash
#!/bin/bash

NAME="Mi Contenedor"
MODE="run"

CONTAINER_NAME="mi_contenedor"
IMAGE="nginx:alpine"

PORTS="
-p 8080:80
"

VOLUMES="
-v ${USER_HOME}/data:/data
"

EXTRA_ARGS="
--restart unless-stopped
--pull=always
--init
"

COMMAND=""

DO_BACKUP=false

# (Opcional) Comprobación de salud tras actualizar/recrear (por defecto 15 y 90 s)
# HEALTH_WAIT=30      # 0 = no comprobar
# HEALTH_TIMEOUT=180
```

> **Espacios y comillas:** `PORTS`, `VOLUMES`, `EXTRA_ARGS` y `COMMAND` se dividen en argumentos por espacios y saltos de línea, pero respetando comillas (como el shell, sin ejecutar nada). Como el bloque ya va entre comillas dobles, usa **comillas simples** dentro: `-e 'MSG=hola mundo'`, `-v '${DATOS_DIR}:/datos'` (si la ruta del `.env` tiene espacios) o `COMMAND="sh -c 'echo hola; sleep 1'"`. Sin comillas todo funciona igual que siempre.

### Ejemplo B: Servicio `docker compose` (`MODE="compose"`)
```bash
#!/bin/bash

NAME="Mi Stack Compose"
MODE="compose"

IMAGE="mi_imagen:latest" # Opcional, para comprobaciones remotas de versión
DO_BACKUP=false
```
*(Nota: Para `MODE="compose"`, debe existir el archivo `docker-compose.yml` en la misma carpeta; se recomienda definir `restart: unless-stopped` en cada servicio. En modo `run`, si `EXTRA_ARGS` no incluye `--restart`, el script añade `--restart=unless-stopped`).*

*`IMAGE` es la única imagen que vigila la comprobación de actualizaciones (`c`): en stacks con varias imágenes (p. ej. Suite Web vigila `nginx:alpine`), las demás solo se actualizan al hacer `a` o `./update.sh <servicio>`.*

### Etiquetas de imagen

Casi todos los servicios usan `latest` (MeTube sin etiqueta, que equivale a `latest`). Excepciones: Immich `v3` (fijada a la versión mayor 3), FileBrowser `stable`, Tinyauth `v5` (fijada a la versión mayor 5) y Tvspy `dev`. Son etiquetas que avanzan solas, así que la comprobación (`c`) avisa cuando hay una imagen nueva y la actualización la descarga. Immich usa por defecto `v3`: recibe las actualizaciones de la v3 pero no salta a una v4 sin que lo cambies. Se sobrescribe con `IMMICH_VERSION` en su `.env` (no se versiona), por ejemplo `v3.4.1` para fijar una versión exacta; `config.sh` usa la misma variable para la comprobación de actualizaciones. Antes de actualizar servicios con base de datos (Immich, Vaultwarden) conviene revisar sus notas de versión y hacer backup (`k`).

---

## 🔐 Notas de servicios concretos

### Tinyauth (puerto 3006) con Nginx Proxy Manager

Tinyauth pone un login delante de las webs que ya publicas con Nginx Proxy Manager (NPM). Las direcciones no cambian: al abrir una web protegida, NPM pregunta a tinyauth si ya has iniciado sesión; si no, te lleva a la página de login de tinyauth y, al entrar, te devuelve a la web. La sesión vale para todos los subdominios del mismo dominio (p. ej. `*.tudominio.duckdns.org`), así que solo inicias sesión una vez.

#### 1. Configurar tinyauth (`tinyauth/.env`, no se versiona)

```
TINYAUTH_APPURL=https://tinyauth.tudominio.duckdns.org
TINYAUTH_AUTH_USERS='usuario1:$2a$10$...,usuario2:$2a$10$...'
```

- `TINYAUTH_APPURL`: URL pública completa de tinyauth, con `https://` y sin barra final.
- `TINYAUTH_AUTH_USERS`: uno o varios usuarios `usuario:hash` separados por comas, **entre comillas simples y sin `$$`** (así docker compose y `update.sh` los leen igual, sin expandir los `$`). Cada usuario se genera con:
  ```bash
  docker run -it --rm ghcr.io/tinyauthapp/tinyauth:v5 user create --interactive
  ```
  (si pregunta por el formato para Docker, responde que no).
- Tras cambiar el `.env`, **recrea** el servicio (`update.sh` → tinyauth → 4); un reinicio no relee el `.env`.
- Tinyauth no tiene panel de usuarios: se gestionan en este `.env`. Admite también usuarios desde LDAP u OAuth/OIDC si en el futuro hace falta un panel (p. ej. LLDAP o Pocket ID).

#### 2. Crear en NPM el proxy host de tinyauth

| Campo | Valor |
|---|---|
| Domain Names | `tinyauth.tudominio.duckdns.org` |
| Scheme / Forward Hostname / Port | `http` / IP del servidor / `3006` |
| Block Common Exploits | **Desactivado** (bloquea las URLs de redirección del login) |
| SSL | Certificado Let's Encrypt + Force SSL |

#### 3. Proteger una web que ya tienes en NPM

1. Edita su proxy host. **No cambies la pestaña Details** (dominio, IP y puerto siguen igual).
2. En la pestaña **Advanced** pega este bloque. Es el mismo para todas las webs: reutiliza el destino de Details mediante las variables de NPM. Solo hay que cambiar `IP-del-servidor` en la línea de `/tinyauth`.

```nginx
location / {
  # Destino de la pestaña Details (variables de NPM)
  proxy_pass $forward_scheme://$server:$port;
  proxy_set_header Host $host;
  proxy_set_header X-Forwarded-Proto $scheme;
  proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  proxy_set_header X-Real-IP $remote_addr;
  # WebSockets
  proxy_http_version 1.1;
  proxy_set_header Upgrade $http_upgrade;
  proxy_set_header Connection $http_connection;

  # Comprobación de sesión con tinyauth
  auth_request /tinyauth;
  auth_request_set $redirection_url $upstream_http_x_tinyauth_location;
  error_page 401 403 =302 $redirection_url;
}

location /tinyauth {
  internal;
  # IP y puerto publicado de tinyauth (no su dominio)
  proxy_pass http://IP-del-servidor:3006/api/auth/nginx;
  proxy_pass_request_body off;
  proxy_set_header content-length "";
  proxy_set_header x-original-url $scheme://$host$is_request_port$request_port$request_uri;
  proxy_set_header x-original-method $request_method;
  proxy_set_header x-forwarded-for $proxy_add_x_forwarded_for;
  proxy_set_header x-real-ip $remote_addr;
}
```

3. Guarda y prueba en una ventana de incógnito: debe llevarte al login de tinyauth y, tras entrar, volver a la web.

**Notas**
- Al definir `location /` en Advanced, NPM usa ese bloque en lugar del suyo por defecto; por eso el bloque repite el reenvío a la web además de la comprobación de tinyauth.
- Si la línea con variables diera problemas, usa el destino explícito: `proxy_pass http://IP-del-servidor:PUERTO-DE-LA-WEB;` (es la forma de la guía oficial: https://tinyauth.app/docs/guides/nginx-proxy-manager/).
- **Deshacer**: borra el bloque de Advanced y guarda; la web vuelve a funcionar como antes.
- Para que tinyauth vea la IP real del cliente (necesario si usas reglas por IP), define `TINYAUTH_AUTH_TRUSTEDPROXIES` con la red desde la que llega NPM.

#### Qué proteger y qué no

- ✅ Webs que usas solo desde el navegador y sin login propio (o con uno débil): MeTube, IT-Tools, Bento PDF, Stirling PDF, Homepage, ConvertX…
- ❌ Servicios que usan **apps o clientes** (Vaultwarden, Immich, JDownloader/MyJD, WireGuard…): sus apps no pueden pasar por el login de tinyauth y dejarían de conectar. Ya tienen su propio login.

### Immich (puerto 2283): versión y copias de la base de datos

**Versión.** El compose usa `${IMMICH_VERSION:-v3}`. Para pasar a una nueva versión mayor (v4…), primero lee sus notas de versión y sustituye `docker-compose.yml` por el oficial de esa release (`https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml`), conservando las adaptaciones locales que se explican en su cabecera. Después cambia `IMMICH_VERSION` en el `.env` y actualiza. Las imágenes de Postgres y Valkey van fijadas por digest y **solo deben cambiarse cuando cambie el compose oficial**.

**Copias de la base de datos.** No uses `DO_BACKUP=true` (ni copias de ficheros) sobre la carpeta de Postgres (`DB_DATA_LOCATION`) con la base de datos en marcha: una copia de ficheros hecha en caliente puede quedar inconsistente y no restaurarse. Immich ya hace volcados lógicos (`pg_dump`) automáticos:

- Se guardan en `UPLOAD_LOCATION/backups/` (`immich-db-backup-*.sql.gz`). Por defecto se crean a diario a las 02:00 y se conservan los 14 últimos.
- **Comprobar que están activos:** en Immich, *Administración → Ajustes → Copias de seguridad de la base de datos* (*Database Dump Settings*) debe estar habilitado. En el servidor, `ls -lt "$UPLOAD_LOCATION/backups" | head` debe mostrar un fichero de las últimas 24 h.
- Copia `UPLOAD_LOCATION` completo (fotos + `backups/`) fuera del servidor, por ejemplo con Backrest. Así quedan cubiertos tanto los ficheros como la base de datos.

**Restaurar.** Hay dos formas:

- **Desde la web (recomendado):** en *Administración → Ajustes*, sección *Restaurar copia de la base de datos*. En una instalación nueva, la pantalla de bienvenida ofrece *Restore from backup*. Antes de restaurar, Immich crea automáticamente un punto de restauración y vuelve a él si la restauración falla.
- **Por línea de comandos** (procedimiento oficial, desde `immich-app/`; ⚠️ borra la base de datos actual):

```bash
docker compose down
# Vaciar la carpeta de Postgres (DB_DATA_LOCATION del .env) para partir de cero:
# sudo rm -rf "<DB_DATA_LOCATION>"
docker compose create
docker start immich_postgres && sleep 10
gunzip --stdout "<UPLOAD_LOCATION>/backups/immich-db-backup-XXXX.sql.gz" \
| sed "s/SELECT pg_catalog.set_config('search_path', '', false);/SELECT pg_catalog.set_config('search_path', 'public, pg_catalog', true);/g" \
| docker exec -i immich_postgres psql --dbname=<DB_DATABASE_NAME> --username=<DB_USERNAME> --single-transaction --set ON_ERROR_STOP=on
docker compose up -d
```

Restaura con la misma versión de Immich que generó el volcado, o con una compatible.

### Toolbox (puerto 8090)

Utilidades del servidor en un único contenedor (`alebupal/toolbox:latest`): explorador doble panel Origen ⇄ Destino para copiar/mover archivos en segundo plano por todo `/host`, subidas FTP/FTPS para Nintendo Switch (con buscador LAN mediante `--network host`), visor integrado de su documentación y acceso equivalente por SSH:

- Actualizar servicio: `./update.sh toolbox`
- Abrir menú CLI por SSH: `docker exec -it toolbox toolbox`
- Consultar progreso/logs de la web por SSH: `docker exec -it toolbox toolbox web estado` y `docker exec -it toolbox toolbox web logs`
- Ver ayuda detallada de todos los comandos SSH: `docker exec -it toolbox toolbox readme` (el código y su README viven en el repositorio aparte `toolbox`).

### Dockpanel (puerto 8092)

Interfaz web de este mismo `update.sh` (`alebupal/dockpanel:latest`): tabla de servicios con estado, puerto y aviso de actualización, botones para iniciar/detener/reiniciar/recrear/actualizar/logs/backup/política (por servicio o todos), comprobación de actualizaciones y una **terminal en el navegador** donde se ve la salida real del script y se responden sus preguntas (incluido el menú interactivo completo). No reimplementa nada: ejecuta `update.sh` del host con `chroot /host`, y las tareas que modifican algo corren en un contenedor auxiliar efímero, así que puede actualizarse a sí mismo y las tareas siguen aunque se cierre la página.

- Desplegar/actualizar: `./update.sh dockpanel`
- Mismo script desde el contenedor: `docker exec -it dockpanel update.sh [opciones]` (sin `-t` para cron); las tareas que lanza aparecen también en la web.
- ⚠️ Tiene control total del host: publícalo solo detrás de Tinyauth o con `AUTH_USER`/`AUTH_PASSWORD` (ver `dockpanel/config.sh`).
- Fija la ruta base una vez (`./update.sh --set-user-home …` o botón ⚙️): sin `.user_home`, dentro del panel `HOME` es `/root`.
- El código y su README viven en el repositorio aparte `dockpanel`.

## 📋 Requisitos del Sistema

El script verifica automáticamente la presencia de las herramientas necesarias al arrancar:
- `bash` (v4.0+)
- `docker` & `docker compose`
- `tar` & `gzip`
- `docker buildx` (opcional, solo para comprobar actualizaciones con `c` / `--check`)

## ✅ Integración Continua

Cada push o PR a `main` ejecuta `.github/workflows/shellcheck.yml`: `bash -n` y `shellcheck -S warning` sobre `update.sh` y los `config.sh` de los servicios (en estos se ignora `SC2034`, porque sus variables se usan desde `update.sh`).
