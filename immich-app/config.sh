#!/bin/bash

NAME="Immich"
MODE="compose"
# Versión fijada en .env (IMMICH_VERSION=vX.Y.Z), que se carga antes que este fichero
IMAGE="ghcr.io/immich-app/immich-server:${IMMICH_VERSION}"
DO_BACKUP=false
