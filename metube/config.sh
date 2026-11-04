#!/bin/bash

NAME="Metube"
MODE="run"

CONTAINER_NAME="metube"
IMAGE="ghcr.io/alexta69/metube"

PORTS="
-p 8081:8081
"

VOLUMES="
-v ${DOWNLOADS_DIR}:/downloads
"

EXTRA_ARGS="
--restart unless-stopped
-e PUID=0
-e PGID=0
-e DELETE_FILE_ON_TRASHCAN=true
"

DO_BACKUP=false
