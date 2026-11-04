#!/bin/bash

NAME="Kutt"
MODE="run"

CONTAINER_NAME="kutt"
IMAGE="kutt/kutt:latest"

PORTS="
-p 3003:3000
"

VOLUMES="
-v ${USER_HOME}/kutt/config:/var/lib/kutt
"

EXTRA_ARGS="
--restart unless-stopped
-e DEFAULT_DOMAIN=${DEFAULT_DOMAIN}
-e JWT_SECRET=${JWT_SECRET}
-e DB_CLIENT=better-sqlite3
-e DB_FILENAME=/var/lib/kutt/data.sqlite
-e TRUST_PROXY=true
"

DO_BACKUP=false
