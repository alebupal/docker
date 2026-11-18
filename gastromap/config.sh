#!/bin/bash

NAME="GastroMap"
MODE="compose"
IMAGE="alebupal/gastromap:latest"
DO_BACKUP=false

PORTS="
-p 3007:3000
"
