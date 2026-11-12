#!/bin/bash

NAME="Dockpanel"
MODE="run"

CONTAINER_NAME="dockpanel"
IMAGE="alebupal/dockpanel:latest"

# Red del host (sin PORTS): el chroot usa el DNS del host (p. ej. systemd-resolved en
# 127.0.0.53), que no es accesible desde la red bridge. Puerto web: PORT.
PORTS=""

# Raíz del host en /host: el panel ejecuta este mismo update.sh y el docker CLI del host con
# 'chroot /host', así que rutas de volúmenes, backups y stacks compose son las reales.
# ${BASE_DIR} es la carpeta de update.sh (la variable la define el propio update.sh).
VOLUMES="
-v /:/host
"

# Seguridad: el panel tiene control total del host (como el socket de Docker). No lo publiques
# sin autenticación: ponlo detrás de Nginx Proxy Manager + Tinyauth o define AUTH_USER y
# AUTH_PASSWORD en el .env de esta carpeta (no se versiona) y añade aquí:
#   -e AUTH_USER -e AUTH_PASSWORD
EXTRA_ARGS="
--network host
--restart unless-stopped
-e TZ=Europe/Madrid
-e PORT=8092
-e DOCKER_DIR=${BASE_DIR}
-e SELF_CONTAINER=dockpanel
"
