#!/bin/bash

NAME="Downtify"
MODE="run"

CONTAINER_NAME="downtify"
IMAGE="ghcr.io/henriquesebastiao/downtify:latest"

PORTS="
-p 8800:8000
"

VOLUMES="
-v ${DOWNLOADS_DIR}:/downloads
-v ${USER_HOME}/downtify/config:/data
"

EXTRA_ARGS="
--restart unless-stopped
"

DO_BACKUP=false
