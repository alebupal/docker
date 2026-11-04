#!/bin/bash

NAME="It Tools"
MODE="run"

CONTAINER_NAME="it_tools"
IMAGE="corentinth/it-tools:latest"

PORTS="
-p 8087:80
"

VOLUMES=""

EXTRA_ARGS="
--restart unless-stopped
"

DO_BACKUP=false
