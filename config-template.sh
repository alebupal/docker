#!/bin/bash
# =============================================================================
# Plantilla de Configuración para servicio Docker
#
# Para crear un nuevo servicio:
# 1. Crea una carpeta dentro de este directorio (ej: mi-servicio/).
# 2. Copia este archivo dentro de esa carpeta con el nombre "config.sh".
# 3. Modifica los parámetros según las necesidades del servicio.
#
# Modos disponibles (MODE):
# - "run"     : Para contenedores individuales lanzados con 'docker run'.
# - "compose" : Para stacks/servicios lanzados con 'docker compose' (requiere docker-compose.yml).
# =============================================================================

# Nombre descriptivo del servicio
NAME="Mi Servicio Docker"

# Modo de despliegue: "run" o "compose"
MODE="run"

# =============================================================================
# CONFIGURACIÓN PARA MODE="run" (Tipo normal)
# =============================================================================
CONTAINER_NAME="mi_contenedor"
IMAGE="nginx:latest"

# Puertos mapeados (opcional)
PORTS="
-p 8080:80
"

# Volúmenes mapeados (opcional)
# Convención: rutas cortas con ${USER_HOME}. En el .env del servicio (no se versiona) define
#   USER_HOME=/ruta/a/tus/servicios/mi-servicio
# y cualquier ruta externa como variable (p. ej. DATOS_DIR=/ruta/real). El .env se carga
# antes que este fichero, así que aquí no queda ninguna ruta personal.
VOLUMES="
-v ${USER_HOME}/data:/usr/share/nginx/html
"

# Argumentos adicionales para docker run (opcional)
EXTRA_ARGS="
--restart=always
"

# Comando / Argumentos tras la imagen (opcional, ej: "--setup ejemplo" o "redis-server --appendonly yes")
# COMMAND=""

# =============================================================================
# CONFIGURACIÓN PARA MODE="compose" (Tipo compose/composer)
# =============================================================================
# Si MODE="compose", coloca el archivo 'docker-compose.yml' en la carpeta del servicio.
# Opcionalmente, puedes especificar IMAGE si la pila usa una imagen principal a monitorizar.
# IMAGE="mi-imagen:latest"

# =============================================================================
# COPIAS DE SEGURIDAD (BACKUP)
# =============================================================================
DO_BACKUP=false                      # true / false (realizar backup de volúmenes antes de actualizar)
# BACKUP_DIR="$HOME/docker_backups" # Opcional: directorio donde se guardarán los backups
