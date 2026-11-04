#!/bin/bash

NAME="Tvspy"
MODE="run"

CONTAINER_NAME="tvspy"
IMAGE="alebupal/tvspy:dev"

PORTS="
-p 32755:80
"

VOLUMES="
-v ${USER_HOME}/tvspy/config:/app/backend/src/database/file
"

EXTRA_ARGS="
-e TZ=Europe/Madrid
-e LOCALE=es-ES
"
