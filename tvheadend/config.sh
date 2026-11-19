#!/bin/bash

NAME="Tvheadend"
MODE="run"

CONTAINER_NAME="tvheadend"
IMAGE="ghcr.io/linuxserver/tvheadend:latest"
WEB_PORT="9981"

PORTS=""
VOLUMES="
-v ${USER_HOME}/config:/config
-v ${RECORDINGS_DIR}:/recordings
-v ${USER_HOME}/picons:/picons
"

EXTRA_ARGS="
--network=host
-e TZ=Europe/Madrid
"
