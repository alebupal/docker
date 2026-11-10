#!/bin/bash

NAME="Homepage"
MODE="run"

CONTAINER_NAME="homepage"
IMAGE="ghcr.io/gethomepage/homepage:latest"

PORTS="
-p 3002:3000
"

VOLUMES="
-v ${USER_HOME}/config:/app/config
-v /var/run/docker.sock:/var/run/docker.sock:ro
"

EXTRA_ARGS="
--restart unless-stopped
-e PUID=0
-e PGID=0
-e HOMEPAGE_ALLOWED_HOSTS=${HOMEPAGE_ALLOWED_HOSTS}
"

DO_BACKUP=false
