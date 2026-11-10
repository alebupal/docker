#!/bin/bash

NAME="WG-Easy"
MODE="run"

CONTAINER_NAME="wg-easy"
IMAGE="ghcr.io/wg-easy/wg-easy:latest"

PORTS="
-p 51820:51820/udp
-p 51821:51821/tcp
"

VOLUMES="
-v ${USER_HOME}/wireguard:/etc/wireguard
"

EXTRA_ARGS="
-e WG_HOST=${WG_HOST}
-e PASSWORD_HASH=${PASSWORD_HASH}
-e LANG=es
--cap-add=NET_ADMIN
--cap-add=SYS_MODULE
--sysctl net.ipv4.conf.all.src_valid_mark=1
--sysctl net.ipv4.ip_forward=1
"
