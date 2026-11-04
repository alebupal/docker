#!/bin/bash

NAME="Pairdrop"
MODE="run"

CONTAINER_NAME="pairdrop"
IMAGE="lscr.io/linuxserver/pairdrop:latest"

PORTS="
-p 3001:3000
"

VOLUMES=""

EXTRA_ARGS="
--restart unless-stopped
"

DO_BACKUP=false
