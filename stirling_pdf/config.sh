#!/bin/bash

NAME="Stirling PDF"
MODE="run"

CONTAINER_NAME="stirling_pdf"
IMAGE="stirlingtools/stirling-pdf:latest"

PORTS="
-p 8085:8080
"

VOLUMES="
-v ${USER_HOME}/config/tessdata:/usr/share/tessdata
-v ${USER_HOME}/config/configs:/configs
"

EXTRA_ARGS="
--restart unless-stopped
"

DO_BACKUP=false
