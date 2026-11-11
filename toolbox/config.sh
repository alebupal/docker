#!/bin/bash

NAME="Toolbox"
MODE="run"

CONTAINER_NAME="toolbox"
IMAGE="alebupal/toolbox:latest"

PORTS=""

VOLUMES="
-v ${USER_HOME}/config:/config
-v /:/host
"

EXTRA_ARGS="
--network host
--restart unless-stopped
-e TZ=Europe/Madrid
-e PORT=8090
-e DATA_ROOT=/host
-e PUID=0
-e PGID=0
"
