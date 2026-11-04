#!/bin/bash

NAME="Vaultwarden"
MODE="run"

CONTAINER_NAME="vaultwarden"
IMAGE="vaultwarden/server:latest"

PORTS="
-p 9158:80
"

VOLUMES="
-v ${USER_HOME}/vaultwarden/config:/data
"

EXTRA_ARGS="
--env-file ${USER_HOME}/vaultwarden/.env
"
