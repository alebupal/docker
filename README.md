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
│
└── <nombre_servicio>/      # Carpeta para cada servicio gestionado
    ├── config.sh           # Configuración del servicio (MODE="run" o MODE="compose")
    └── docker-compose.yml  # (Opcional) Solo requerido si MODE="compose"
```

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
   - **🔨 Recrear contenedor / stack (`recreate`)**: En modo Compose fuerza la reconstrucción limpia (`docker compose up -d --force-recreate --remove-orphans`) aplicando de inmediato cambios en variables de entorno o volúmenes; en modo run renombra el contenedor previo a `<nombre>_old`, crea el nuevo y solo entonces elimina el anterior; si `docker run` falla, borra el nuevo y restaura y arranca el anterior (rollback).
   - Atajos directos para todos los servicios a la vez: `sa` (start-all), `ra` (restart-all), `ca` (recreate-all), `ta` (stop-all) y `pa` (policy-all).

6. **⚡ Actualización en Caliente Sin Tiempo de Corte (Zero-Downtime)**:
   - En servicios Compose, utiliza `docker compose up -d --remove-orphans`, actualizando y recreando únicamente los contenedores con nuevas imágenes sin destruir redes ni provocar caídas de servicio.

7. **📊 Monitor de Recursos en Vivo (`docker stats`)**:
   - Inspecciona en tiempo real el consumo de CPU, memoria RAM, I/O de red e I/O de disco de todos los contenedores en ejecución.

8. **🧹 Centro de Limpieza y Mantenimiento**:
   - Menú guiado para vaciar el historial de logs, eliminar copias de seguridad antiguas y ejecutar limpieza de imágenes huérfanas (`docker image prune`) o limpieza profunda del sistema (`docker system prune`).

9. **🛡️ Detección y Sugerencia de Puertos Libres**:
   - Al crear un nuevo servicio, comprueba automáticamente si el puerto host elegido ya está en uso por el sistema o por otro contenedor, calculando y sugiriendo el siguiente puerto libre disponible con 1 clic.

10. **💾 Copias de Seguridad Automatizadas y Restauración (Rollback)**:
    - Compatible tanto con contenedores individuales (`MODE="run"`) como con stacks (`MODE="compose"`).
    - Si `DO_BACKUP=true`, realiza un backup comprimido `.tar.gz` antes de actualizar, con el contenedor/stack ya detenido (solo cuando realmente se va a recrear). Si la actualización falla, el backup se conserva.
    - Las rutas se guardan relativas a `/` (`tar -C /`) y se restauran en su ubicación original; los backups del formato antiguo se siguen detectando y restaurando.
    - Los volúmenes con nombre y los bind mounts externos (en compose) no se incluyen: el script avisa de ellos. En el backup manual (`k`) se ofrece detener temporalmente los servicios.
    - **Restaurador integrado**: Permite listar e intentar restaurar backups desde `$HOME/docker_backups`.

11. **🆕 Asistente y Generador Automático de Servicios**:
    - Generación automática pegando un comando `docker run` completo (se analiza sin ejecutar nada). Los volúmenes con ruta absoluta del host (`/mnt/...`, `/home/...`, `~/...`) conservan su ubicación real, pero esa ruta se guarda en el `.env` del servicio como `<SERVICIO>_<CARPETA>_DIR` y en `config.sh` queda `${VAR}`; los relativos, `$PWD` o volúmenes con nombre se mapean a `${USER_HOME}/<svc>/config/<nombre del destino>` (sin expandir). Las variables `-e` sensibles (PASS, TOKEN, SECRET, KEY, HASH) también van al `.env`. Así `config.sh` y `docker-compose.yml`, que son lo único que se versiona, no contienen rutas personales ni secretos. Lo mismo aplica al asistente paso a paso, y la plantilla de compose usa `${DATA_DIR}` definido en `.env`.
    - Asistente guiado interactivo paso a paso para crear servicios `docker run` o `docker compose`.

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
 c) 🔍 Comprobar actualizaciones disponibles (SHA256 en paralelo)
 a) ⬇️ Actualizar TODOS los servicios (Pull de imágenes y despliegue)

── ⏯️ Control de Contenedores (Local) ──
 p) 🕹️ Ciclo de Vida: Iniciar, Detener, Reiniciar, Recrear o Restart Policy
 1..N) 🎯 Número o nombre de un servicio → sus acciones (iniciar, detener, actualizar...)

── 📊 Monitorización y Diagnóstico ──
 l) 📋 Ver logs de un servicio en vivo (tail -f)
 m) 📈 Monitor de recursos en tiempo real (docker stats)
 s) 📜 Mostrar comandos de arranque exactos (run / compose)

── 🛠️ Administración y Mantenimiento ──
 n) ✨ Crear NUEVO servicio Docker (Asistente guiado)
 b) 🧹 Limpieza y mantenimiento (Logs, Backups, Prune del sistema)
 k) 💾 Crear copia de seguridad ahora (individual o de TODOS)
 r) ⏪ Restaurar copia de seguridad (Rollback)
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
./update.sh --help    # o ./update.sh -?

# Comprobar actualizaciones de todos los servicios (SHA256 en paralelo)
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

# Cambiar política de reinicio (unless-stopped | always | on-failure | no)
./update.sh --restart-policy <servicio> <politica>   # ej: ./update.sh -rp portainer unless-stopped
./update.sh --restart-policy all <politica>          # Aplicar a todos los servicios
./update.sh --policy <politica>                      # Atajo directo para aplicar a todos

# Actualizar todos los servicios de forma masiva (Pull + Deploy)
./update.sh -a        # o ./update.sh --all
./update.sh -a -f     # Forzar además recreación de todos los servicios

# Actualizar un único servicio específico por su carpeta o índice
./update.sh <servicio>
./update.sh -f <servicio>  # Forzar recreación
# (no ejecuta 'docker image prune'; la limpieza se hace en las actualizaciones masivas o con -b)

# Monitor de recursos en vivo (CPU / Memoria / Red)
./update.sh -m        # o ./update.sh --stats

# Ver logs en vivo de un servicio (tail -f)
./update.sh -l <servicio>

# Mostrar comandos de arranque de todos los servicios
./update.sh -s        # o ./update.sh --show (valores sensibles enmascarados)

# Menú de limpieza y mantenimiento
./update.sh -b        # o ./update.sh --clean

# Crear copia de seguridad manual (individual o masiva)
./update.sh -k            # Menú guiado de backup
./update.sh -k <servicio> # o ./update.sh --backup <servicio>
./update.sh -k all        # o ./update.sh --backup all (TODOS)

# Asistente de restauración de copias de seguridad (Rollback)
./update.sh -r        # o ./update.sh --restore

# Crear nuevo servicio interactivamente o desde un comando 'docker run'
./update.sh -n
./update.sh -n 'docker run -d -p 8080:80 --name mi_app nginx:alpine'

# Configurar ruta base persistente del usuario
./update.sh --set-user-home /home/usuario
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
-v $PWD/data:/data
"

EXTRA_ARGS="
--restart unless-stopped
--pull=always
--init
"

COMMAND=""

DO_BACKUP=false
```

### Ejemplo B: Servicio `docker compose` (`MODE="compose"`)
```bash
#!/bin/bash

NAME="Mi Stack Compose"
MODE="compose"

IMAGE="mi_imagen:latest" # Opcional, para comprobaciones remotas de versión
DO_BACKUP=false
```
*(Nota: Para `MODE="compose"`, debe existir el archivo `docker-compose.yml` en la misma carpeta, definiendo su directiva `restart: unless-stopped`).*

---

## 📋 Requisitos del Sistema

El script verifica automáticamente la presencia de las herramientas necesarias al arrancar:
- `bash` (v4.0+)
- `docker` & `docker compose`
- `tar` & `gzip`
