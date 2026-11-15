#!/bin/bash

NAME="Mealie Importer"
MODE="run"

CONTAINER_NAME="mealie-importer"
IMAGE="alebupal/mealie-importer:latest"

PORTS="
-p 8094:8094
"

VOLUMES="
-v ${USER_HOME}/config/mealie-importer:/app/data
"

EXTRA_ARGS="
--restart unless-stopped
-e TZ=Europe/Madrid
-e PORT=8094
-e MEALIE_URL
-e MEALIE_TOKEN
"
