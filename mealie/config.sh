#!/bin/bash

NAME="Mealie"
MODE="run"

CONTAINER_NAME="mealie"
IMAGE="ghcr.io/mealie-recipes/mealie:latest"

PORTS="
-p 9005:9000
"

VOLUMES="
-v ${USER_HOME}/config:/app/data/
"

EXTRA_ARGS="
--restart unless-stopped
-e PUID=0
-e PGID=0
-e TZ=Europe/Madrid
-e BASE_URL=${BASE_URL}
"

DO_BACKUP=false
