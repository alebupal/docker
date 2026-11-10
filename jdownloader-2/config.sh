#!/bin/bash

NAME="JDownloader 2"
MODE="run"

CONTAINER_NAME="jdownloader-2"
IMAGE="jlesage/jdownloader-2:latest"

PORTS="
-p 5800:5800
"

VOLUMES="
-v ${USER_HOME}/config:/config:rw
-v ${DOWNLOADS_DIR}:/output:rw
"

EXTRA_ARGS=""
