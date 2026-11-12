#!/bin/bash

NAME="Immich"
MODE="compose"
# Misma etiqueta que el compose: IMMICH_VERSION del .env (se carga antes) o la mayor v3
IMAGE="ghcr.io/immich-app/immich-server:${IMMICH_VERSION:-v3}"
DO_BACKUP=false
