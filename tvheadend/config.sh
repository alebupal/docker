#!/bin/bash

NAME="Tvheadend"
MODE="run"

CONTAINER_NAME="tvheadend"
IMAGE="ghcr.io/linuxserver/tvheadend:latest"

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
