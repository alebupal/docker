#!/bin/bash

NAME="Tvheadend"
MODE="run"

CONTAINER_NAME="tvheadend"
IMAGE="ghcr.io/linuxserver/tvheadend:latest"

PORTS=""
VOLUMES="
-v ${USER_HOME}/tvheadend/config:/config
-v ${USER_HOME}/tvheadend/grabaciones:/recordings
-v ${USER_HOME}/tvheadend/picons:/picons
"

EXTRA_ARGS="
--network=host
-e TZ=Europe/Madrid
"
