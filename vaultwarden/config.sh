#!/bin/bash

NAME="Vaultwarden"
MODE="run"

CONTAINER_NAME="vaultwarden"
IMAGE="vaultwarden/server:1.37.5"

PORTS="
-p 9158:80
"

VOLUMES="
-v ${USER_HOME}/config:/data
"

EXTRA_ARGS="
--env-file ${USER_HOME}/.env
"
