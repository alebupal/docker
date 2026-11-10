#!/bin/bash

NAME="Portainer"
MODE="run"

CONTAINER_NAME="portainer"
IMAGE="portainer/portainer-ce:latest"

PORTS="
-p 8000:8000
-p 9000:9000
"

VOLUMES="
-v /var/run/docker.sock:/var/run/docker.sock
-v ${USER_HOME}/config:/data
"

EXTRA_ARGS="
--restart unless-stopped
"

# Backup configurables
#DO_BACKUP=true                # Activamos backup
#BACKUP_DIR="${USER_HOME}/../docker_backups"  # Directorio donde se guardará el backup
