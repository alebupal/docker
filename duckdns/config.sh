#!/bin/bash

NAME="DuckDNS"
MODE="run"

CONTAINER_NAME="duckdns"
IMAGE="lscr.io/linuxserver/duckdns:latest"

PORTS=""

VOLUMES="
-v ${USER_HOME}/duckdns/config:/config
"

EXTRA_ARGS="
-e TZ=Europe/Madrid
-e SUBDOMAINS=${SUBDOMAINS}
-e TOKEN=${TOKEN}
"
