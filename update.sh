#!/bin/bash
# =============================================================================
# update.sh
#
# Script principal unificado para la gestión y actualización de Docker.
# Soporta despliegues 'docker run' (normal) y 'docker compose' (compose/composer).
#
# Funcionalidades:
# - Menú interactivo con estado en tiempo real (RUNNING/STOPPED/OFFLINE).
# - Asistente dinámico para crear nuevos servicios ('config.sh' y 'docker-compose.yml').
# - Comprobación de actualizaciones bajo demanda.
# - Actualización individual o masiva de contenedores/stacks.
# - Verificación previa de requisitos (docker, compose, tar, gzip).
# - Visor de logs en tiempo real (docker logs / docker compose logs).
# - Sistema de restauración de backups (rollback).
# - Limpieza automática de backups antiguos (>7 días).
# - Muestra comandos exactos de arranque para docker run o docker compose.
# =============================================================================

# ─────────────────────────────
# Colores y Configuración Base
# ─────────────────────────────
BLUE="\e[34m"
GREEN="\e[32m"
YELLOW="\e[33m"
RED="\e[31m"
GRAY="\e[90m"
CYAN="\e[36m"
NC="\e[0m"

# Manejo limpio de Ctrl + C (SIGINT)
trap 'echo -e "\n${YELLOW}⚠️ Ejecución interrumpida por el usuario (Ctrl + C). Saliendo...${NC}"; exit 130' INT

SESSION_RESULTS=()

BASE_DIR="$(cd "$(dirname "$0")" && pwd)"

# Cargar ruta base de usuario persistente si existe
if [ -f "$BASE_DIR/.user_home" ]; then
  USER_HOME=$(cat "$BASE_DIR/.user_home" | tr -d '\n\r ')
fi

# Ruta base del usuario (por defecto el directorio home del usuario real)
USER_HOME="${USER_HOME:-${SUDO_USER:+/home/$SUDO_USER}}"
USER_HOME="${USER_HOME:-$HOME}"

BACKUP_DIR="${BACKUP_DIR:-$USER_HOME/docker_backups}"
LOG_FILE="$BACKUP_DIR/update-containers.log"

mkdir -p "$BACKUP_DIR" 2>/dev/null || true

# ─────────────────────────────
# Verificación Previa de Requisitos
# ─────────────────────────────
check_prerequisites() {
  local missing=()
  for cmd in docker tar gzip; do
    if ! command -v "$cmd" >/dev/null 2>&1; then
      missing+=("$cmd")
    fi
  done

  if ! docker compose version >/dev/null 2>&1; then
    missing+=("docker compose plugin")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    echo -e "${RED}❌ Error: Faltan requisitos indispensables en el sistema:${NC}"
    for m in "${missing[@]}"; do
      echo -e "   - $m"
    done
    echo -e "${YELLOW}Por favor, instálalos antes de continuar.${NC}"
    exit 1
  fi
}

# ─────────────────────────────
# Limpieza Automática de Backups Antiguos (>7 días)
# ─────────────────────────────
clean_old_backups() {
  if [ -d "$BACKUP_DIR" ]; then
    find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +7 -delete 2>/dev/null || true
  fi
}

# ─────────────────────────────
# Limpieza de Variables de Configuración
# ─────────────────────────────
reset_config_vars() {
  NAME=""
  MODE="run"
  CONTAINER_NAME=""
  IMAGE=""
  PORTS=""
  VOLUMES=""
  EXTRA_ARGS=""
  COMMAND=""
  DO_BACKUP=false
}

# ─────────────────────────────
# Cargar Servicio
# ─────────────────────────────
load_service_config() {
  local service="$1"
  reset_config_vars
  local env_file="$BASE_DIR/$service/.env"
  if [ -f "$env_file" ]; then
    set -a
    source "$env_file"
    set +a
  fi
  local config_file="$BASE_DIR/$service/config.sh"
  if [ -f "$config_file" ]; then
    source "$config_file"
    [ -z "$NAME" ] && NAME="$service"
    return 0
  else
    return 1
  fi
}

# ─────────────────────────────
# Descubrir Servicios
# ─────────────────────────────
discover_services() {
  SERVICES=()
  for dir in "$BASE_DIR"/*/; do
    if [ -f "${dir}config.sh" ]; then
      SERVICES+=("$(basename "$dir")")
    fi
  done
}

# ─────────────────────────────
# Caché Global del Estado de Docker (Optimización de Carga Instantánea)
# ─────────────────────────────
DOCKER_CACHE_INITIALIZED=false
DOCKER_RUNNING_CONTAINERS=" "
DOCKER_ALL_CONTAINERS=" "
DOCKER_COMPOSE_RUNNING_PROJECTS=" "
DOCKER_COMPOSE_ALL_PROJECTS=" "

refresh_docker_state_cache() {
  DOCKER_RUNNING_CONTAINERS=" "
  DOCKER_ALL_CONTAINERS=" "
  DOCKER_COMPOSE_RUNNING_PROJECTS=" "
  DOCKER_COMPOSE_ALL_PROJECTS=" "

  local raw
  raw=$(docker ps -a --format '{{.Names}}|{{.State}}|{{.Label "com.docker.compose.project"}}' 2>/dev/null || true)
  if [ -n "$raw" ]; then
    while IFS='|' read -r c_name c_state c_proj; do
      [ -z "$c_name" ] && continue
      DOCKER_ALL_CONTAINERS+="$c_name "
      if [ "$c_state" = "running" ]; then
        DOCKER_RUNNING_CONTAINERS+="$c_name "
      fi
      if [ -n "$c_proj" ]; then
        DOCKER_COMPOSE_ALL_PROJECTS+="$c_proj "
        if [ "$c_state" = "running" ]; then
          DOCKER_COMPOSE_RUNNING_PROJECTS+="$c_proj "
        fi
      fi
    done <<< "$raw"
  fi
  DOCKER_CACHE_INITIALIZED=true
}

invalidate_docker_state_cache() {
  DOCKER_CACHE_INITIALIZED=false
}

# Obtener puerto principal para visualización
get_service_port() {
  local service="$1"
  local port=""
  local cfg_file="$BASE_DIR/$service/config.sh"
  local dc_file="$BASE_DIR/$service/docker-compose.yml"

  if [ -f "$cfg_file" ]; then
    port=$(grep -E '^[[:space:]]*-p[[:space:]]+[0-9]+' "$cfg_file" 2>/dev/null | head -n 1 | awk '{print $2}' | cut -d: -f1)
  fi
  if [ -z "$port" ] && [ -f "$dc_file" ]; then
    port=$(grep -E '^[[:space:]]*-[[:space:]]*["0-9]+:[0-9]+' "$dc_file" 2>/dev/null | head -n 1 | sed -E 's/[^0-9]*([0-9]+):.*/\1/')
  fi
  if [ -n "$port" ]; then
    echo ":$port"
  else
    echo "-"
  fi
}

# Selector inteligente de servicio por número, nombre o coincidencia parcial
resolve_service_input() {
  local input="$1"
  [ -z "$input" ] && return 1

  # Selección numérica 1..N
  if [[ "$input" =~ ^[0-9]+$ ]] && [ "$input" -ge 1 ] && [ "$input" -le "${#SERVICES[@]}" ]; then
    echo "${SERVICES[$((input-1))]}"
    return 0
  fi

  local lower_in
  lower_in=$(echo "$input" | tr '[:upper:]' '[:lower:]')

  # 1. Coincidencia exacta con nombre de carpeta
  for s in "${SERVICES[@]}"; do
    local lower_folder
    lower_folder=$(echo "$s" | tr '[:upper:]' '[:lower:]')
    if [ "$lower_folder" = "$lower_in" ]; then
      echo "$s"
      return 0
    fi
  done

  # 2. Coincidencia exacta con NAME descriptivo
  for s in "${SERVICES[@]}"; do
    load_service_config "$s"
    local lower_name
    lower_name=$(echo "$NAME" | tr '[:upper:]' '[:lower:]')
    if [ "$lower_name" = "$lower_in" ]; then
      echo "$s"
      return 0
    fi
  done

  # 3. Coincidencia parcial (subcadena)
  for s in "${SERVICES[@]}"; do
    load_service_config "$s"
    local lower_folder
    lower_folder=$(echo "$s" | tr '[:upper:]' '[:lower:]')
    local lower_name
    lower_name=$(echo "$NAME" | tr '[:upper:]' '[:lower:]')
    if [[ "$lower_folder" == *"$lower_in"* ]] || [[ "$lower_name" == *"$lower_in"* ]]; then
      echo "$s"
      return 0
    fi
  done

  return 1
}

# ─────────────────────────────
# Estado en Tiempo Real del Servicio (Consulta ultra-rápida sobre caché)
# ─────────────────────────────
get_service_status() {
  local service="$1"
  load_service_config "$service" || { echo -e "${GRAY}OFFLINE${NC}"; return; }

  if [ "$DOCKER_CACHE_INITIALIZED" != true ]; then
    refresh_docker_state_cache
  fi

  if [ "$MODE" = "compose" ]; then
    local p_norm="${service//_/-}"
    local p_under="${service//-/_}"
    local dc_file="$BASE_DIR/$service/docker-compose.yml"

    # Si docker-compose.yml tiene definido "name: mi_proyecto"
    local custom_proj=""
    if [ -f "$dc_file" ]; then
      custom_proj=$(grep -E '^[[:space:]]*name:[[:space:]]*[a-zA-Z0-9_-]+' "$dc_file" 2>/dev/null | head -n 1 | awk '{print $2}' | tr -d '"\x27')
    fi

    # 1. Comprobar por etiqueta de proyecto compose (carpeta o name: explícito)
    if [[ "$DOCKER_COMPOSE_RUNNING_PROJECTS" == *" $service "* ]] || \
       [[ "$DOCKER_COMPOSE_RUNNING_PROJECTS" == *" $p_norm "* ]] || \
       [[ "$DOCKER_COMPOSE_RUNNING_PROJECTS" == *" $p_under "* ]] || \
       { [ -n "$custom_proj" ] && [[ "$DOCKER_COMPOSE_RUNNING_PROJECTS" == *" $custom_proj "* ]]; }; then
      echo -e "${GREEN}🟢 RUNNING${NC}"
      return
    fi

    # 2. Comprobar contenedores definidos en docker-compose.yml
    if [ -f "$dc_file" ]; then
      local dc_cnames
      dc_cnames=$(grep -E '^[[:space:]]*container_name:[[:space:]]*[a-zA-Z0-9_-]+' "$dc_file" 2>/dev/null | awk '{print $2}' | tr -d '"\x27')
      if [ -n "$dc_cnames" ]; then
        for cn in $dc_cnames; do
          if [[ "$DOCKER_RUNNING_CONTAINERS" == *" $cn "* ]]; then
            echo -e "${GREEN}🟢 RUNNING${NC}"
            return
          fi
        done
        for cn in $dc_cnames; do
          if [[ "$DOCKER_ALL_CONTAINERS" == *" $cn "* ]]; then
            echo -e "${RED}🔴 STOPPED${NC}"
            return
          fi
        done
      fi
    fi

    if [[ "$DOCKER_COMPOSE_ALL_PROJECTS" == *" $service "* ]] || \
       [[ "$DOCKER_COMPOSE_ALL_PROJECTS" == *" $p_norm "* ]] || \
       [[ "$DOCKER_COMPOSE_ALL_PROJECTS" == *" $p_under "* ]] || \
       { [ -n "$custom_proj" ] && [[ "$DOCKER_COMPOSE_ALL_PROJECTS" == *" $custom_proj "* ]]; }; then
      echo -e "${RED}🔴 STOPPED${NC}"
      return
    fi

    # 3. Comprobar por nombre de contenedor esperado en config.sh
    local expected_name="${CONTAINER_NAME:-$service}"
    if [[ "$DOCKER_RUNNING_CONTAINERS" == *" $expected_name "* ]]; then
      echo -e "${GREEN}🟢 RUNNING${NC}"
      return
    elif [[ "$DOCKER_ALL_CONTAINERS" == *" $expected_name "* ]]; then
      echo -e "${RED}🔴 STOPPED${NC}"
      return
    fi

    echo -e "${GRAY}⚪ OFFLINE${NC}"
    return
  fi

  # MODE="run"
  if [ -n "$CONTAINER_NAME" ]; then
    if [[ "$DOCKER_RUNNING_CONTAINERS" == *" $CONTAINER_NAME "* ]]; then
      echo -e "${GREEN}🟢 RUNNING${NC}"
    elif [[ "$DOCKER_ALL_CONTAINERS" == *" $CONTAINER_NAME "* ]]; then
      echo -e "${RED}🔴 STOPPED${NC}"
    else
      echo -e "${GRAY}⚪ OFFLINE${NC}"
    fi
  else
    echo -e "${GRAY}⚪ OFFLINE${NC}"
  fi
}

# ─────────────────────────────
# Ver Logs en Vivo
# ─────────────────────────────
view_service_logs() {
  local service="$1"
  if [ -z "$service" ]; then
    echo ""
    echo -e "${BLUE}📜 Selecciona servicio para ver logs:${NC}"
    local i=1
    for s in "${SERVICES[@]}"; do
      load_service_config "$s"
      echo -e " $i) $NAME ($s)"
      ((i++))
    done
    read -rp "👉 Número o nombre de servicio: " LOG_OPT
    local resolved
    resolved=$(resolve_service_input "$LOG_OPT")
    if [ -n "$resolved" ]; then
      service="$resolved"
    else
      echo -e "${RED}❌ Servicio no encontrado: '$LOG_OPT'${NC}"
      return 1
    fi
  fi

  load_service_config "$service" || return 1
  echo -e "${CYAN}📜 Mostrando logs de $NAME ($service)... (Pulsa Ctrl+C para salir)${NC}"

  if [ "$MODE" = "compose" ]; then
    (cd "$BASE_DIR/$service" && docker compose logs --tail 100 -f)
  else
    if [ -n "$CONTAINER_NAME" ]; then
      docker logs --tail 100 -f "$CONTAINER_NAME"
    else
      echo -e "${RED}❌ CONTAINER_NAME no definido en config.sh${NC}"
    fi
  fi
}

# ─────────────────────────────
# Control de Ciclo de Vida (Start / Stop / Restart)
# ─────────────────────────────
lifecycle_service() {
  local service="$1"
  local action="$2" # start, stop, restart, recreate

  if [ "$service" = "all" ] || [ "$service" = "ALL" ] || [ "$service" = "-a" ]; then
    for s in "${SERVICES[@]}"; do
      lifecycle_service "$s" "$action"
    done
    return 0
  fi

  load_service_config "$service" || {
    echo -e "${RED}❌ No se pudo cargar configuración de $service${NC}"
    return 1
  }

  echo -e "${BLUE}▶ Ejecutando '${action}' en $NAME ($service) [Modo: $MODE]...${NC}"

  if [ "$MODE" = "compose" ]; then
    local service_dir="$BASE_DIR/$service"
    (
      cd "$service_dir" || exit 1
      case "$action" in
        start)
          docker compose up -d
          ;;
        stop)
          docker compose stop
          ;;
        restart)
          docker compose restart
          ;;
        recreate)
          docker compose up -d --force-recreate --remove-orphans
          ;;
        *)
          echo -e "${RED}❌ Acción inválida: $action${NC}"
          return 1
          ;;
      esac
    )
  else
    if [ -z "$CONTAINER_NAME" ]; then
      echo -e "${RED}❌ CONTAINER_NAME no definido para $service${NC}"
      return 1
    fi
    case "$action" in
      start)
        docker start "$CONTAINER_NAME"
        ;;
      stop)
        docker stop "$CONTAINER_NAME"
        ;;
      restart)
        docker restart "$CONTAINER_NAME"
        ;;
      recreate)
        echo "🛑 Parando y eliminando contenedor anterior $CONTAINER_NAME..."
        docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
        docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
        echo "🚀 Recreando y arrancando contenedor $NAME..."
        local restart_flag="--restart=unless-stopped"
        if [[ "$EXTRA_ARGS" == *"--restart"* ]]; then
          restart_flag=""
        fi
        docker run -d \
          $PORTS \
          ${CONTAINER_NAME:+--name "$CONTAINER_NAME"} \
          $restart_flag \
          $VOLUMES \
          $EXTRA_ARGS \
          "$IMAGE" \
          $COMMAND
        ;;
      *)
        echo -e "${RED}❌ Acción inválida: $action${NC}"
        return 1
        ;;
    esac
  fi

  invalidate_docker_state_cache
  local res_status
  res_status=$(get_service_status "$service")
  echo -e "Estado resultante de ${GREEN}$NAME${NC}: $res_status"
}

# ─────────────────────────────
# Obtener Política de Reinicio Actual
# ─────────────────────────────
get_service_restart_policy() {
  local service="$1"
  load_service_config "$service" || return 1

  local policy=""

  # 1. Intentar desde contenedor Docker en ejecución/existente
  if [ "$MODE" = "compose" ]; then
    local service_dir="$BASE_DIR/$service"
    local cid
    cid=$(cd "$service_dir" 2>/dev/null && docker compose ps -a -q 2>/dev/null | head -n 1)
    if [ -n "$cid" ]; then
      policy=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$cid" 2>/dev/null)
    fi
    if [ -z "$policy" ]; then
      local cname
      cname=$(grep -E '^[[:space:]]*container_name:' "$service_dir/docker-compose.yml" 2>/dev/null | head -n 1 | awk '{print $2}' | tr -d ' "\r')
      if [ -n "$cname" ]; then
        policy=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$cname" 2>/dev/null)
      fi
    fi
    # 2. Si Docker no lo tiene, leer de docker-compose.yml
    if [ -z "$policy" ] && [ -f "$service_dir/docker-compose.yml" ]; then
      policy=$(grep -E '^[[:space:]]*restart:' "$service_dir/docker-compose.yml" 2>/dev/null | head -n 1 | sed -E 's/.*restart:[[:space:]]*//' | tr -d ' "\r')
    fi
  else
    if [ -n "$CONTAINER_NAME" ]; then
      policy=$(docker inspect -f '{{.HostConfig.RestartPolicy.Name}}' "$CONTAINER_NAME" 2>/dev/null)
    fi
    # Si Docker no lo tiene, leer de EXTRA_ARGS
    if [ -z "$policy" ]; then
      policy=$(echo "$EXTRA_ARGS" | grep -oE -- '--restart[= ][a-zA-Z0-9_-]+' | head -n 1 | sed -E 's/--restart[= ]//' | tr -d ' "\r')
    fi
  fi

  if [ -z "$policy" ] || [ "$policy" = "0" ]; then
    policy="unless-stopped"
  fi

  echo "$policy"
}

# ─────────────────────────────
# Cambiar Política de Reinicio
# ─────────────────────────────
change_service_restart_policy() {
  local service="$1"
  local new_policy="$2"

  if [ "$service" = "all" ] || [ "$service" = "ALL" ] || [ "$service" = "-a" ]; then
    echo -e "${BLUE}🔁 Aplicando política de reinicio '${new_policy}' a TODOS los servicios...${NC}"
    for s in "${SERVICES[@]}"; do
      change_service_restart_policy "$s" "$new_policy"
    done
    return 0
  fi

  load_service_config "$service" || {
    echo -e "${RED}❌ No se pudo cargar configuración de $service${NC}"
    return 1
  }

  case "$new_policy" in
    unless-stopped|always|on-failure|no)
      ;;
    *)
      echo -e "${RED}❌ Política de reinicio no válida: '$new_policy'. Opciones: unless-stopped, always, on-failure, no${NC}"
      return 1
      ;;
  esac

  echo -e "🔁 Configurando política '${YELLOW}$new_policy${NC}' para ${GREEN}$NAME${NC} ($service)..."

  # 1. Actualizar contenedor en vivo si existe
  if [ "$MODE" = "compose" ]; then
    local service_dir="$BASE_DIR/$service"
    local c_ids
    c_ids=$(cd "$service_dir" 2>/dev/null && docker compose ps -a -q 2>/dev/null)
    if [ -n "$c_ids" ]; then
      for cid in $c_ids; do
        docker update --restart="$new_policy" "$cid" >/dev/null 2>&1 || true
      done
    fi
    local c_names
    c_names=$(grep -E '^[[:space:]]*container_name:' "$service_dir/docker-compose.yml" 2>/dev/null | awk '{print $2}' | tr -d ' "\r')
    for cn in $c_names; do
      docker update --restart="$new_policy" "$cn" >/dev/null 2>&1 || true
    done

    # 2. Persistir en docker-compose.yml
    local compose_file="$service_dir/docker-compose.yml"
    if [ -f "$compose_file" ]; then
      if grep -q -E '^[[:space:]]*restart:' "$compose_file"; then
        sed -i -E "s/^([[:space:]]*)restart:[[:space:]]*.*/\1restart: $new_policy/" "$compose_file"
      else
        if grep -q -E '^[[:space:]]*container_name:' "$compose_file"; then
          sed -i -E "/^[[:space:]]*container_name:/a \    restart: $new_policy" "$compose_file"
        elif grep -q -E '^[[:space:]]*image:' "$compose_file"; then
          sed -i -E "/^[[:space:]]*image:/a \    restart: $new_policy" "$compose_file"
        fi
      fi
      echo -e "   ${GREEN}✓${NC} Persistido en docker-compose.yml"
    fi
  else
    if [ -n "$CONTAINER_NAME" ]; then
      docker update --restart="$new_policy" "$CONTAINER_NAME" >/dev/null 2>&1 || true
    fi

    # 2. Persistir en config.sh
    local cfg="$BASE_DIR/$service/config.sh"
    if [ -f "$cfg" ]; then
      if grep -q -- "--restart" "$cfg"; then
        sed -i -E "s/--restart([= ])[a-zA-Z0-9_-]+/--restart\1$new_policy/g" "$cfg"
      else
        if grep -q 'EXTRA_ARGS=""' "$cfg"; then
          sed -i "s|EXTRA_ARGS=\"\"|EXTRA_ARGS=\"\n--restart $new_policy\n\"|g" "$cfg"
        elif grep -q 'EXTRA_ARGS="' "$cfg"; then
          sed -i "s|EXTRA_ARGS=\"|EXTRA_ARGS=\"\n--restart $new_policy|g" "$cfg"
        else
          echo -e "\nEXTRA_ARGS=\"\n--restart $new_policy\n\"" >> "$cfg"
        fi
      fi
      echo -e "   ${GREEN}✓${NC} Persistido en config.sh"
    fi
  fi

  echo -e "   ${GREEN}✅ Política de reinicio cambiada a: $new_policy${NC}"
}

select_lifecycle_menu() {
  echo ""
  echo -e "${BLUE}==========================================================="
  echo "⏯️ Gestión de Servicios (Ciclo de Vida y Actualizaciones)"
  echo -e "===========================================================${NC}"

  if [ ${#SERVICES[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠️ No hay servicios configurados.${NC}"
    return 0
  fi

  printf " ${GRAY}%-4s %-25s %-18s %-10s %-8s %s${NC}\n" "#" "SERVICIO" "CARPETA" "MODO" "PUERTO" "ESTADO"
  echo -e "${GRAY}------------------------------------------------------------------------------------------${NC}"
  local i=1
  for s in "${SERVICES[@]}"; do
    load_service_config "$s"
    local st
    st=$(get_service_status "$s")
    local p
    p=$(get_service_port "$s")

    local disp_name="$NAME"
    [ ${#disp_name} -gt 24 ] && disp_name="${disp_name:0:21}..."
    local disp_s="$s"
    [ ${#disp_s} -gt 17 ] && disp_s="${disp_s:0:15}..."

    printf " %2d) ${GREEN}%-24s${NC} ${GRAY}%-18s${NC} ${YELLOW}%-10s${NC} ${CYAN}%-8s${NC} %b\n" \
      "$i" "$disp_name" "$disp_s" "[$MODE]" "$p" "$st"
    ((i++))
  done
  echo -e "${GRAY}------------------------------------------------------------------------------------------${NC}"

  echo ""
  echo -e " ${CYAN}🎯 Selección de objetivo:${NC}"
  echo -e "  ${GREEN}1..N${NC}) Gestionar un servicio específico"
  echo -e "  ${GREEN}a${NC})    ⭐ Gestionar TODOS los servicios"
  echo ""
  echo -e " ${CYAN}⚡ Acciones rápidas para TODOS los servicios:${NC}"
  echo -e "  ${YELLOW}ua${NC}) 🚀 Actualizar TODOS (Pull de imágenes de internet + Deploy)"
  echo -e "  ${YELLOW}ca${NC}) 🔨 Recrear TODOS (En local, sin descargar)"
  echo -e "  ${YELLOW}sa${NC}) ▶  Iniciar TODOS (start-all)"
  echo -e "  ${YELLOW}ra${NC}) 🔄 Reiniciar TODOS (restart-all)"
  echo -e "  ${YELLOW}ta${NC}) ⏹  Detener TODOS (stop-all)"
  echo -e "  ${YELLOW}pa${NC}) 🔁 Cambiar política de reinicio a TODOS (policy-all)"
  echo ""
  echo -e "  ${GRAY}q) Volver al menú principal${NC}"
  echo "-----------------------------------------------------------"
  read -rp "👉 Elige una opción: " SVC_OPT

  local target_services=()
  local direct_action=""

  case "$SVC_OPT" in
    q|Q)
      return 0
      ;;
    ua|UA|update-all|UPDATE-ALL)
      target_services=("${SERVICES[@]}")
      direct_action="update"
      ;;
    ca|CA|recreate-all|RECREATE-ALL)
      target_services=("${SERVICES[@]}")
      direct_action="recreate"
      ;;
    sa|SA|start-all|START-ALL)
      target_services=("${SERVICES[@]}")
      direct_action="start"
      ;;
    ra|RA|restart-all|RESTART-ALL)
      target_services=("${SERVICES[@]}")
      direct_action="restart"
      ;;
    ta|TA|stop-all|STOP-ALL)
      target_services=("${SERVICES[@]}")
      direct_action="stop"
      ;;
    pa|PA|policy-all|POLICY-ALL)
      target_services=("${SERVICES[@]}")
      direct_action="policy"
      ;;
    a|A)
      target_services=("${SERVICES[@]}")
      ;;
    *)
      local resolved
      resolved=$(resolve_service_input "$SVC_OPT")
      if [ -n "$resolved" ]; then
        target_services=("$resolved")
      else
        echo -e "${RED}❌ Opción o servicio inválido: '$SVC_OPT'${NC}"
        return 1
      fi
      ;;
  esac

  local act="$direct_action"
  if [ -z "$act" ]; then
    local target_desc="el servicio seleccionado"
    local current_pol_info=""
    if [ ${#target_services[@]} -eq ${#SERVICES[@]} ]; then
      target_desc="TODOS los servicios"
    else
      load_service_config "${target_services[0]}"
      target_desc="$NAME"
      local cur_p
      cur_p=$(get_service_restart_policy "${target_services[0]}")
      current_pol_info=" [Política actual: ${YELLOW}$cur_p${CYAN}]"
    fi

    echo ""
    echo -e "${CYAN}Acción a aplicar a ${YELLOW}$target_desc${CYAN}${current_pol_info}:${NC}"
    echo -e " 1) ▶ Iniciar (start)"
    echo -e " 2) ⏹ Detener (stop)"
    echo -e " 3) 🔄 Reiniciar (restart)"
    echo -e " 4) 🔨 Recrear contenedor / stack (en local, sin descargar)"
    echo -e " 5) 🚀 Actualizar imagen y desplegar (Pull desde internet)"
    echo -e " 6) 🔁 Cambiar política de reinicio (restart policy)"
    echo -e " q) Cancelar"
    read -rp "👉 Elige la acción: " ACT_OPT

    case "$ACT_OPT" in
      1) act="start" ;;
      2) act="stop" ;;
      3) act="restart" ;;
      4) act="recreate" ;;
      5) act="update" ;;
      6) act="policy" ;;
      *) echo "👋 Cancelado"; return 0 ;;
    esac
  fi

  if [ "$act" = "update" ]; then
    for s in "${target_services[@]}"; do
      update_service "$s" true false
    done
    if [ ${#target_services[@]} -eq ${#SERVICES[@]} ]; then
      echo "🧹 Limpiando imágenes antiguas..."
      docker image prune -f
    fi
  elif [ "$act" = "policy" ]; then
    local current_pol_info=""
    if [ ${#target_services[@]} -eq 1 ]; then
      local cp
      cp=$(get_service_restart_policy "${target_services[0]}")
      current_pol_info=" (actual: ${YELLOW}$cp${CYAN})"
    fi
    echo ""
    echo -e "${CYAN}Selecciona la nueva política de reinicio${current_pol_info}:${NC}"
    echo -e " 1) ${GREEN}unless-stopped${NC} (Recomendado: reinicia siempre salvo detención manual)"
    echo -e " 2) ${YELLOW}always${NC}         (Reinicia siempre en cualquier circunstancia)"
    echo -e " 3) ${BLUE}on-failure${NC}     (Reinicia solo si el contenedor sale con código de error)"
    echo -e " 4) ${RED}no${NC}             (Sin reinicio automático)"
    echo -e " q) Cancelar"
    read -rp "👉 Elige una opción [1-4]: " POL_OPT
    local chosen_pol=""
    case "$POL_OPT" in
      1|unless-stopped) chosen_pol="unless-stopped" ;;
      2|always) chosen_pol="always" ;;
      3|on-failure) chosen_pol="on-failure" ;;
      4|no) chosen_pol="no" ;;
      *) echo "👋 Operación cancelada."; return 0 ;;
    esac

    for s in "${target_services[@]}"; do
      change_service_restart_policy "$s" "$chosen_pol"
    done
  else
    for s in "${target_services[@]}"; do
      lifecycle_service "$s" "$act"
    done
  fi
}

# ─────────────────────────────
# Monitor de Recursos en Vivo (docker stats)
# ─────────────────────────────
monitor_resources() {
  echo ""
  echo -e "${BLUE}==============================="
  echo "📊 Monitor de Recursos de Contenedores"
  echo -e "===============================${NC}"
  if ! docker ps -q 2>/dev/null | grep -q .; then
    echo -e "${YELLOW}⚠️ No hay contenedores en ejecución actualmente.${NC}"
    return 0
  fi
  docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}\t{{.NetIO}}\t{{.BlockIO}}"
}

# ─────────────────────────────
# Mantenimiento y Limpieza (Logs, Backups, Prune)
# ─────────────────────────────
manage_maintenance() {
  echo ""
  echo -e "${BLUE}==============================="
  echo "🧹 Limpieza y Mantenimiento"
  echo -e "===============================${NC}"
  echo -e " 1) 📄 Vaciar archivo de registro de actualizaciones (Log)"
  echo -e " 2) 🗑 Eliminar TODAS las copias de seguridad (.tar.gz)"
  echo -e " 3) ⏱ Eliminar copias de seguridad de más de 3 días"
  echo -e " 4) 🐳 Limpieza de imágenes huérfanas de Docker (image prune)"
  echo -e " 5) 🧼 Limpieza profunda de Docker (imágenes, build cache y volúmenes no usados)"
  echo -e " 6) ✨ Limpieza completa recomendada (Vaciar log + Backups > 3 días + Prune)"
  echo -e " q) Cancelar"
  echo "-------------------------------"
  read -rp "👉 Elige una opción de limpieza: " C_OPT

  case "$C_OPT" in
    1)
      if [ -f "$LOG_FILE" ]; then
        > "$LOG_FILE"
        echo -e "✅ ${GREEN}Archivo de log vaciado ($LOG_FILE).${NC}"
      else
        echo -e "${YELLOW}No existe archivo de log previo.${NC}"
      fi
      ;;
    2)
      read -rp "⚠️ ¿Seguro que deseas eliminar TODOS los backups en $BACKUP_DIR? (s/N): " CONF
      if [[ "$CONF" =~ ^[sS]$ ]]; then
        local count
        count=$(find "$BACKUP_DIR" -name "*.tar.gz" -type f 2>/dev/null | wc -l)
        rm -f "$BACKUP_DIR"/*.tar.gz 2>/dev/null || true
        echo -e "✅ ${GREEN}Se han eliminado $count copias de seguridad.${NC}"
      else
        echo "Cancelado."
      fi
      ;;
    3)
      local count
      count=$(find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +3 2>/dev/null | wc -l)
      find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +3 -delete 2>/dev/null || true
      echo -e "✅ ${GREEN}Se han eliminado $count copias de seguridad de más de 3 días.${NC}"
      ;;
    4)
      echo "🧹 Limpiando imágenes obsoletas..."
      docker image prune -f
      echo -e "✅ ${GREEN}Imágenes huérfanas eliminadas.${NC}"
      ;;
    5)
      read -rp "⚠️ Esto eliminará contenedores parados, redes no usadas y build cache. ¿Continuar? (s/N): " CONF
      if [[ "$CONF" =~ ^[sS]$ ]]; then
        docker system prune -f
        docker builder prune -f 2>/dev/null || true
        echo -e "✅ ${GREEN}Limpieza profunda completada.${NC}"
      else
        echo "Cancelado."
      fi
      ;;
    6)
      [ -f "$LOG_FILE" ] && > "$LOG_FILE"
      find "$BACKUP_DIR" -name "*.tar.gz" -type f -mtime +3 -delete 2>/dev/null || true
      docker image prune -f
      echo -e "✅ ${GREEN}Limpieza completa realizada (Log vaciado, backups antiguos eliminados e imágenes limpiadas).${NC}"
      ;;
    *)
      echo "👋 Cancelado"
      ;;
  esac
}

# ─────────────────────────────
# Restauración de Backups (Rollback)
# ─────────────────────────────
perform_service_backup() {
  local service="$1"
  local mode_flag="$2"
  load_service_config "$service" || return 1

  mkdir -p "$BACKUP_DIR" 2>/dev/null || true
  local ts
  ts=$(date +%Y%m%d_%H%M%S)
  local backup_file="$BACKUP_DIR/${service}_backup_${ts}.tar.gz"
  local service_dir="$BASE_DIR/$service"

  if [ "$mode_flag" != "silent" ]; then
    echo -e "📦 ${CYAN}Creando copia de seguridad para ${GREEN}$NAME${NC} (${GRAY}$service${NC})...${NC}"
  else
    echo -e "💾 ${YELLOW}Haciendo backup previo de $NAME en $backup_file...${NC}" >&2
  fi

  local success=false

  if [ "$MODE" = "compose" ]; then
    if [ -d "$service_dir" ]; then
      if tar -czf "$backup_file" -C "$BASE_DIR" "$service" 2>/dev/null; then
        success=true
      fi
    fi
  else
    local tar_args=()
    if [ -d "$service_dir" ]; then
      tar_args+=("-C" "$BASE_DIR" "$service")
    fi
    if [ -n "$VOLUMES" ]; then
      for vol in $VOLUMES; do
        host_path=$(echo "$vol" | cut -d: -f1 | sed 's/^-v //')
        if [ -d "$host_path" ] && [[ "$host_path" != "$service_dir"* ]]; then
          tar_args+=("$host_path")
        fi
      done
    fi

    if [ ${#tar_args[@]} -gt 0 ]; then
      if tar -czf "$backup_file" "${tar_args[@]}" 2>/dev/null; then
        success=true
      fi
    fi
  fi

  if [ "$success" = true ] && [ -f "$backup_file" ] && [ -s "$backup_file" ]; then
    local fsize
    fsize=$(du -h "$backup_file" | cut -f1)
    if [ "$mode_flag" != "silent" ]; then
      echo -e "  ✅ ${GREEN}Backup generado correctamente:${NC} ${YELLOW}$(basename "$backup_file")${NC} (${CYAN}$fsize${NC})"
      echo -e "  📁 Guardado en: ${CYAN}$backup_file${NC}"
    fi
    echo "$backup_file"
    return 0
  else
    if [ "$mode_flag" != "silent" ]; then
      echo -e "  ❌ ${RED}Error al crear la copia de seguridad para $service${NC}"
    fi
    rm -f "$backup_file" 2>/dev/null || true
    return 1
  fi
}

create_manual_backup_menu() {
  local target="$1"
  discover_services

  echo ""
  echo -e "${BLUE}==============================="
  echo "💾 Crear Copia de Seguridad (Backup)"
  echo -e "===============================${NC}"

  if [ ${#SERVICES[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠️ No se encontraron servicios configurados.${NC}"
    return 0
  fi

  if [ -n "$target" ]; then
    if [ "$target" = "all" ] || [ "$target" = "ALL" ]; then
      echo -e "${CYAN}📦 Generando backup de TODOS los servicios en $BACKUP_DIR...${NC}"
      for s in "${SERVICES[@]}"; do
        perform_service_backup "$s"
      done
      return 0
    elif [[ " ${SERVICES[*]} " =~ " $target " ]]; then
      perform_service_backup "$target"
      return 0
    else
      echo -e "${RED}❌ Servicio no encontrado: $target${NC}"
      return 1
    fi
  fi

  echo "Servicios disponibles para respaldar:"
  local i=1
  for s in "${SERVICES[@]}"; do
    load_service_config "$s"
    echo -e " $i) ${GREEN}$NAME${NC} (${GRAY}$s${NC})"
    ((i++))
  done
  echo " a) 📦 Respaldar TODOS los servicios"
  echo " q) Cancelar"
  echo "-------------------------------"

  read -rp "👉 Elige una opción: " B_OPT

  case "$B_OPT" in
    q|Q)
      echo "👋 Cancelado"
      return 0
      ;;
    a|A)
      echo ""
      echo -e "${CYAN}📦 Generando backup de TODOS los servicios en $BACKUP_DIR...${NC}"
      for s in "${SERVICES[@]}"; do
        perform_service_backup "$s"
      done
      ;;
    *)
      local resolved
      resolved=$(resolve_service_input "$B_OPT")
      if [ -n "$resolved" ]; then
        echo ""
        perform_service_backup "$resolved"
      else
        echo -e "${RED}❌ Opción o servicio inválido: '$B_OPT'${NC}"
      fi
      ;;
  esac
}

restore_backup() {
  echo ""
  echo -e "${BLUE}==============================="
  echo "⏪ Restauración de Copia de Seguridad (Rollback)"
  echo -e "===============================${NC}"

  local backups=()
  while IFS= read -r -d '' file; do
    backups+=("$file")
  done < <(find "$BACKUP_DIR" -name "*.tar.gz" -type f -print0 2>/dev/null | sort -z -r)

  if [ ${#backups[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠️ No se encontraron archivos de backup (.tar.gz) en $BACKUP_DIR.${NC}"
    return 0
  fi

  echo "Backups disponibles para restaurar:"
  local i=1
  for b in "${backups[@]}"; do
    local fname
    fname=$(basename "$b")
    local ftime
    ftime=$(date -r "$b" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || echo "desconocido")
    local fsize
    fsize=$(du -h "$b" | cut -f1)
    echo -e " $i) ${GREEN}$fname${NC} (${CYAN}$fsize${NC} - $ftime)"
    ((i++))
  done

  echo " q) Cancelar"
  echo "-------------------------------"
  read -rp "👉 Elige el backup a restaurar: " B_OPT

  if [ "$B_OPT" = "q" ] || [ "$B_OPT" = "Q" ]; then
    echo "👋 Cancelado"
    return 0
  fi

  if [[ "$B_OPT" =~ ^[0-9]+$ ]] && [ "$B_OPT" -ge 1 ] && [ "$B_OPT" -le "${#backups[@]}" ]; then
    local selected_backup="${backups[$((B_OPT-1))]}"
    local fname
    fname=$(basename "$selected_backup")
    echo ""
    echo -e "📦 Backup seleccionado: ${YELLOW}$fname${NC}"

    discover_services
    local detected_svc=""
    for s in "${SERVICES[@]}"; do
      if [[ "$fname" == "${s}_"* ]]; then
        detected_svc="$s"
        break
      fi
    done

    local first_entry
    first_entry=$(tar -tf "$selected_backup" 2>/dev/null | head -n 1)
    local default_dest="$BASE_DIR"

    if [ -n "$detected_svc" ]; then
      if [[ "$first_entry" != "$detected_svc"* ]]; then
        default_dest="$BASE_DIR/$detected_svc"
      fi
    fi

    echo -e "Directorio destino sugerido: ${CYAN}$default_dest${NC}"
    read -rp "👉 Pulsa [Enter] para usar destino sugerido o escribe otra ruta: " DEST_DIR
    DEST_DIR="${DEST_DIR:-$default_dest}"

    if [ -z "$DEST_DIR" ]; then
      echo -e "${RED}❌ La ruta de destino no puede estar vacía.${NC}"
      return 1
    fi

    if [ -n "$detected_svc" ]; then
      local current_st
      current_st=$(get_service_status "$detected_svc")
      if [[ "$current_st" == *"RUNNING"* ]]; then
        echo ""
        read -rp "⚠️ El servicio '$detected_svc' está en ejecución. ¿Detenerlo antes de descomprimir para evitar corrupción? (S/n): " STOP_CONF
        if [[ ! "$STOP_CONF" =~ ^[nN]$ ]]; then
          echo -e "⏹️ ${YELLOW}Deteniendo $detected_svc temporalmente...${NC}"
          lifecycle_service "$detected_svc" "stop"
        fi
      fi
    fi

    mkdir -p "$DEST_DIR"
    echo ""
    echo -e "📦 Descomprimiendo ${YELLOW}$fname${NC} en ${CYAN}$DEST_DIR${NC}..."
    if tar -xzf "$selected_backup" -C "$DEST_DIR"; then
      echo -e "✅ ${GREEN}Archivos restaurados con éxito.${NC}"

      if [ -n "$detected_svc" ]; then
        echo ""
        read -rp "🔄 ¿Deseas iniciar/recrear '$detected_svc' con los datos restaurados ahora? (S/n): " RESTART_CONF
        if [[ ! "$RESTART_CONF" =~ ^[nN]$ ]]; then
          echo -e "🚀 ${GREEN}Iniciando $detected_svc...${NC}"
          lifecycle_service "$detected_svc" "recreate"
        fi
      fi
    else
      echo -e "❌ ${RED}Error al descomprimir el archivo de backup.${NC}"
      return 1
    fi
  else
    echo -e "${RED}❌ Opción inválida.${NC}"
  fi
}

# ─────────────────────────────
# Configurar Ruta Base de Usuario (USER_HOME)
# ─────────────────────────────
configure_user_home() {
  local new_path="$1"
  echo ""
  echo -e "${BLUE}==============================="
  echo "⚙️ Configurar Ruta Base de Usuario"
  echo -e "===============================${NC}"
  echo -e "Ruta actual configurada: ${YELLOW}$USER_HOME${NC}"
  echo ""

  if [ -z "$new_path" ]; then
    read -rp "👉 Introduce la nueva ruta base (ej: /home/usuario): " new_path
  fi

  new_path=$(echo "$new_path" | sed 's:/*$::')

  if [ -z "$new_path" ]; then
    echo -e "${RED}❌ La ruta no puede estar vacía.${NC}"
    return 1
  fi

  local old_home="$USER_HOME"
  echo "$new_path" > "$BASE_DIR/.user_home"
  USER_HOME="$new_path"
  BACKUP_DIR="$USER_HOME/docker_backups"
  LOG_FILE="$BACKUP_DIR/update-containers.log"
  mkdir -p "$BACKUP_DIR" 2>/dev/null || true

  echo -e "✅ ${GREEN}Ruta de usuario guardada en $BASE_DIR/.user_home -> $USER_HOME${NC}"

  echo ""
  read -rp "🔄 ¿Deseas actualizar las rutas de volúmenes en todos los config.sh existentes? (S/n): " UPD_OPT
  if [[ ! "$UPD_OPT" =~ ^[nN]$ ]]; then
    local count=0
    for cfg in "$BASE_DIR"/*/config.sh; do
      if [ -f "$cfg" ]; then
        if grep -q "$old_home" "$cfg"; then
          sed -i "s|$old_home|$USER_HOME|g" "$cfg"
          ((count++))
          echo -e "  • Actualizado: ${CYAN}$(basename "$(dirname "$cfg")")/config.sh${NC}"
        fi
      fi
    done
    echo -e "✅ ${GREEN}Se han actualizado $count archivos config.sh con la nueva ruta.${NC}"
  fi
}

# ─────────────────────────────
# Parser de Comandos Docker Run
# ─────────────────────────────
parse_docker_run_command() {
  local raw_cmd="$1"

  # Normalizar saltos de línea con contrabarra y espacios
  raw_cmd=$(echo "$raw_cmd" | sed 's/\\$//g' | tr '\n' ' ' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

  # Eliminar prefijo 'docker run' o 'docker container run'
  if [[ "$raw_cmd" =~ ^docker([[:space:]]+container)?[[:space:]]+run[[:space:]]*(.*) ]]; then
    raw_cmd="${BASH_REMATCH[2]}"
  fi

  PARSED_NAME=""
  PARSED_CONTAINER=""
  PARSED_IMAGE=""
  PARSED_PORTS=()
  PARSED_VOLUMES=()
  PARSED_EXTRA=()
  PARSED_COMMAND=""

  local parsed_cmd_tokens=()
  local is_image_found=false

  # Tokenizar preservando comillas
  local tokens=()
  eval "tokens=($raw_cmd)" 2>/dev/null || read -ra tokens <<< "$raw_cmd"

  local i=0
  local num_tokens=${#tokens[@]}

  while [ $i -lt $num_tokens ]; do
    local token="${tokens[$i]}"

    if [ "$is_image_found" = true ]; then
      parsed_cmd_tokens+=("$token")
      i=$((i + 1))
      continue
    fi

    # Separador explícito de flags y argumentos
    if [ "$token" = "--" ]; then
      i=$((i + 1))
      if [ $i -lt $num_tokens ]; then
        PARSED_IMAGE="${tokens[$i]}"
        is_image_found=true
      fi
      i=$((i + 1))
      continue
    fi

    # Flag con formato --clave=valor o -c=valor
    if [[ "$token" =~ ^(-{1,2}[a-zA-Z0-9_-]+)=(.*)$ ]]; then
      local flag_key="${BASH_REMATCH[1]}"
      local flag_val="${BASH_REMATCH[2]}"

      case "$flag_key" in
        --name)
          PARSED_CONTAINER="$flag_val"
          ;;
        -p|--publish)
          PARSED_PORTS+=("-p $flag_val")
          ;;
        --expose)
          PARSED_PORTS+=("--expose $flag_val")
          ;;
        -v|--volume)
          PARSED_VOLUMES+=("-v $flag_val")
          ;;
        --mount)
          PARSED_VOLUMES+=("--mount $flag_val")
          ;;
        -d|--detach|-it|-ti|-i|-t|--rm)
          # Omitir flags de modo interactivo / efímeros
          ;;
        *)
          PARSED_EXTRA+=("$flag_key=$flag_val")
          ;;
      esac
      i=$((i + 1))
      continue
    fi

    # Flags sin '='
    if [[ "$token" == -* ]]; then
      case "$token" in
        --name)
          i=$((i + 1))
          [ $i -lt $num_tokens ] && PARSED_CONTAINER="${tokens[$i]}"
          ;;
        -p|--publish)
          i=$((i + 1))
          [ $i -lt $num_tokens ] && PARSED_PORTS+=("-p ${tokens[$i]}")
          ;;
        --expose)
          i=$((i + 1))
          [ $i -lt $num_tokens ] && PARSED_PORTS+=("--expose ${tokens[$i]}")
          ;;
        -v|--volume)
          i=$((i + 1))
          [ $i -lt $num_tokens ] && PARSED_VOLUMES+=("-v ${tokens[$i]}")
          ;;
        --mount)
          i=$((i + 1))
          [ $i -lt $num_tokens ] && PARSED_VOLUMES+=("--mount ${tokens[$i]}")
          ;;
        -d|--detach|-it|-ti|-i|-t|--rm)
          # Omitir flags efímeros
          ;;
        -e|--env|--env-file|--network|--net|--restart|--cap-add|--cap-drop|--sysctl|--device|--shm-size|-m|--memory|--cpus|--gpus|--user|-u|--group-add|-h|--hostname|--add-host|-l|--label|--entrypoint|-w|--workdir|--pull|--dns|--log-driver|--log-opt|--security-opt|--platform|--health-cmd|--health-interval|--health-retries|--health-timeout|--health-start-period)
          local opt_name="$token"
          i=$((i + 1))
          if [ $i -lt $num_tokens ]; then
            PARSED_EXTRA+=("$opt_name ${tokens[$i]}")
          fi
          ;;
        *)
          # Flags booleanos (--init, --privileged, --read-only, etc.)
          PARSED_EXTRA+=("$token")
          ;;
      esac
      i=$((i + 1))
      continue
    fi

    # Primer token no-flag: es la imagen Docker
    PARSED_IMAGE="$token"
    is_image_found=true
    i=$((i + 1))
  done

  # Si no hay container name explícito, inferir a partir de la imagen
  if [ -z "$PARSED_CONTAINER" ] && [ -n "$PARSED_IMAGE" ]; then
    local img_base
    img_base=$(echo "$PARSED_IMAGE" | awk -F'/' '{print $NF}' | awk -F':' '{print $1}')
    PARSED_CONTAINER="$img_base"
  fi

  # Normalizar contenedor con guiones bajos
  if [ -n "$PARSED_CONTAINER" ]; then
    PARSED_CONTAINER=$(echo "$PARSED_CONTAINER" | tr '-' '_' | tr ' ' '_' | sed 's/[^a-zA-Z0-9_]//g')
  fi

  # Generar nombre descriptivo legible
  if [ -n "$PARSED_CONTAINER" ]; then
    PARSED_NAME=$(echo "$PARSED_CONTAINER" | sed 's/[-_]/ /g' | awk '{for(j=1;j<=NF;j++){ $j=toupper(substr($j,1,1)) substr($j,2) }}1')
  fi

  if [ ${#parsed_cmd_tokens[@]} -gt 0 ]; then
    PARSED_COMMAND="${parsed_cmd_tokens[*]}"
  fi
}

# Transformar volúmenes a la carpeta del servicio
transform_service_volume() {
  local vol_entry="$1"
  local s_name="$2"

  if [[ "$vol_entry" =~ ^-v[[:space:]]+([^:]+):(.+)$ ]]; then
    local src="${BASH_REMATCH[1]}"
    local dst="${BASH_REMATCH[2]}"

    # Conservar sockets y dispositivos especiales
    if [[ "$src" =~ ^/var/run/docker\.sock$ || "$src" =~ ^/dev/ ]]; then
      echo "-v $src:$dst"
      return
    fi

    echo "-v $USER_HOME/$s_name/config:$dst"
  else
    echo "$vol_entry"
  fi
}

# ─────────────────────────────
# Detección y Sugerencia de Puertos Libres
# ─────────────────────────────
is_port_in_use() {
  local port="$1"
  [ -z "$port" ] && return 1

  # 1. Comprobar sockets TCP escuchando en el sistema (ss o netstat)
  if command -v ss >/dev/null 2>&1; then
    if ss -tuln 2>/dev/null | grep -Eq "(:| )${port}[[:space:]]"; then
      return 0
    fi
  elif command -v netstat >/dev/null 2>&1; then
    if netstat -tuln 2>/dev/null | grep -Eq "(:| )${port}[[:space:]]"; then
      return 0
    fi
  fi

  # 2. Comprobar contenedores Docker en ejecución
  if docker ps --format '{{.Ports}}' 2>/dev/null | grep -Eq "(0\.0\.0\.0|:::|\[::\]):${port}->"; then
    return 0
  fi

  return 1
}

find_next_free_port() {
  local start_port="$1"
  local candidate=$((start_port + 1))
  while is_port_in_use "$candidate"; do
    ((candidate++))
    if [ "$candidate" -gt 65535 ]; then
      candidate=8080
    fi
  done
  echo "$candidate"
}

validate_or_suggest_port() {
  local port_input="$1"
  [ -z "$port_input" ] && { echo ""; return; }

  # Extraer puerto host y puerto contenedor (ej: 8080:80 o 8080)
  local host_p
  host_p=$(echo "$port_input" | awk -F':' '{print $1}')
  local container_p
  container_p=$(echo "$port_input" | awk -F':' '{print $2}')
  [ -z "$container_p" ] && container_p="$host_p"

  if is_port_in_use "$host_p"; then
    local suggested
    suggested=$(find_next_free_port "$host_p")
    echo "" >&2
    echo -e "${YELLOW}⚠️ El puerto host '$host_p' ya está en uso en el sistema o por otro contenedor.${NC}" >&2
    echo -e "${CYAN}💡 Puerto libre sugerido: ${GREEN}$suggested${NC} (quedaría $suggested:$container_p)" >&2
    echo -e " 1) ✅ Usar el puerto sugerido ($suggested:$container_p)" >&2
    echo -e " 2) ✍️ Introducir otro puerto manualmente" >&2
    echo -e " 3) ⚠️ Mantener $host_p:$container_p de todas formas" >&2
    read -rp "👉 Elige una opción [1/2/3, por defecto 1]: " P_OPT

    case "$P_OPT" in
      2)
        read -rp "👉 Nuevo puerto host a usar: " USER_CHOSEN_PORT
        if [ -n "$USER_CHOSEN_PORT" ]; then
          validate_or_suggest_port "$USER_CHOSEN_PORT:$container_p"
        else
          echo "$suggested:$container_p"
        fi
        ;;
      3)
        echo "$host_p:$container_p"
        ;;
      *)
        echo "$suggested:$container_p"
        ;;
    esac
  else
    echo "$host_p:$container_p"
  fi
}

# ─────────────────────────────
# Crear Nuevo Servicio Dinámicamente
# ─────────────────────────────
create_new_service() {
  local pre_cmd="$1"

  echo ""
  echo -e "${BLUE}==============================="
  echo "🆕 Crear Nuevo Servicio Docker"
  echo -e "===============================${NC}"

  local mode_type="wizard"
  local docker_run_input=""

  if [ -n "$pre_cmd" ]; then
    mode_type="docker_run"
    docker_run_input="$pre_cmd"
  else
    echo "Selecciona cómo deseas crear el servicio:"
    echo " 1) 🪄 Pegar comando 'docker run' completo (Generación automática)"
    echo " 2) ✍️ Asistente paso a paso (docker run interactivo)"
    echo " 3) 🐙 docker compose (Stack con docker-compose.yml)"
    read -rp "👉 Opción [1/2/3]: " CREATE_OPT

    case "$CREATE_OPT" in
      1)
        mode_type="docker_run"
        echo ""
        read -rp "📋 Pega el comando 'docker run': " docker_run_input
        ;;
      3)
        mode_type="compose"
        ;;
      *)
        mode_type="wizard"
        ;;
    esac
  fi

  if [ "$mode_type" = "docker_run" ]; then
    if [ -z "$docker_run_input" ]; then
      echo -e "${RED}❌ El comando docker run no puede estar vacío.${NC}"
      return 1
    fi

    parse_docker_run_command "$docker_run_input"

    if [ -z "$PARSED_IMAGE" ]; then
      echo -e "${RED}❌ No se pudo detectar la imagen Docker en el comando proporcionado.${NC}"
      return 1
    fi

    local def_dir="${PARSED_CONTAINER}"
    [ -z "$def_dir" ] && def_dir=$(echo "$PARSED_IMAGE" | awk -F'/' '{print $NF}' | awk -F':' '{print $1}' | tr '-' '_' | tr ' ' '_' | sed 's/[^a-zA-Z0-9_]//g' | tr 'A-Z' 'a-z')

    echo ""
    echo -e "${GREEN}🔍 Datos extraídos del comando docker run:${NC}"
    echo -e "  • ${YELLOW}Imagen:${NC}             $PARSED_IMAGE"
    echo -e "  • ${YELLOW}Nombre sugerido:${NC}    $PARSED_NAME"
    echo -e "  • ${YELLOW}Contenedor:${NC}         $PARSED_CONTAINER"
    if [ ${#PARSED_PORTS[@]} -gt 0 ]; then
      echo -e "  • ${YELLOW}Puertos:${NC}            $(IFS=" "; echo "${PARSED_PORTS[*]}")"
    fi
    if [ ${#PARSED_VOLUMES[@]} -gt 0 ]; then
      echo -e "  • ${YELLOW}Volúmenes:${NC}"
      for v in "${PARSED_VOLUMES[@]}"; do
        local preview_v
        preview_v=$(transform_service_volume "$v" "$def_dir")
        echo -e "      $preview_v"
      done
    fi
    if [ ${#PARSED_EXTRA[@]} -gt 0 ]; then
      echo -e "  • ${YELLOW}Flags extra:${NC}"
      for e in "${PARSED_EXTRA[@]}"; do
        echo -e "      $e"
      done
    fi
    if [ -n "$PARSED_COMMAND" ]; then
      echo -e "  • ${YELLOW}Comando/Args:${NC}       $PARSED_COMMAND"
    fi
    echo ""

    read -rp "👉 Nombre del directorio del servicio [$def_dir]: " SERVICE_DIR_NAME
    [ -z "$SERVICE_DIR_NAME" ] && SERVICE_DIR_NAME="$def_dir"
    SERVICE_DIR_NAME=$(echo "$SERVICE_DIR_NAME" | tr '-' '_' | tr ' ' '_' | sed 's/[^a-zA-Z0-9_]//g' | tr 'A-Z' 'a-z')

    local target_dir="$BASE_DIR/$SERVICE_DIR_NAME"
    if [ -d "$target_dir" ]; then
      echo -e "${RED}❌ Ya existe el directorio '$SERVICE_DIR_NAME'.${NC}"
      return 1
    fi

    # Asegurar que el contenedor use el nombre de servicio normalizado
    PARSED_CONTAINER="$SERVICE_DIR_NAME"

    read -rp "👉 Nombre descriptivo [$PARSED_NAME]: " NEW_NAME
    [ -z "$NEW_NAME" ] && NEW_NAME="$PARSED_NAME"

    read -rp "👉 ¿Activar backup de volúmenes antes de actualizar? (s/N): " BACKUP_OPT
    local do_backup_val="false"
    if [[ "$BACKUP_OPT" =~ ^[sS]$ ]]; then
      do_backup_val="true"
    fi

    # Crear carpeta del servicio y subcarpeta config para mapeo ordenado
    mkdir -p "$target_dir/config"

    # Validar si alguno de los puertos detectados entra en conflicto
    local validated_ports=()
    for p in "${PARSED_PORTS[@]}"; do
      local clean_p="${p#-p }"
      local resolved_p
      resolved_p=$(validate_or_suggest_port "$clean_p")
      [ -n "$resolved_p" ] && validated_ports+=("-p $resolved_p")
    done
    PARSED_PORTS=("${validated_ports[@]}")

    local ports_block="PORTS=\"\""
    if [ ${#PARSED_PORTS[@]} -gt 0 ]; then
      ports_block="PORTS=\""
      for p in "${PARSED_PORTS[@]}"; do
        ports_block+=$'\n'"$p"
      done
      ports_block+=$'\n'"\""
    fi

    # Mapear rutas de host (como PWD o carpetas relativas o named volumes) a la subcarpeta config del servicio
    local adjusted_volumes=()
    for v in "${PARSED_VOLUMES[@]}"; do
      adjusted_volumes+=("$(transform_service_volume "$v" "$SERVICE_DIR_NAME")")
    done

    local volumes_block="VOLUMES=\"\""
    if [ ${#adjusted_volumes[@]} -gt 0 ]; then
      volumes_block="VOLUMES=\""
      for v in "${adjusted_volumes[@]}"; do
        volumes_block+=$'\n'"$v"
      done
      volumes_block+=$'\n'"\""
    fi

    local extra_block="EXTRA_ARGS=\"\""
    if [ ${#PARSED_EXTRA[@]} -gt 0 ]; then
      extra_block="EXTRA_ARGS=\""
      for e in "${PARSED_EXTRA[@]}"; do
        extra_block+=$'\n'"$e"
      done
      extra_block+=$'\n'"\""
    fi

    local cmd_block=""
    if [ -n "$PARSED_COMMAND" ]; then
      cmd_block="COMMAND=\"$PARSED_COMMAND\""
    fi

    cat <<EOF > "$target_dir/config.sh"
#!/bin/bash

NAME="$NEW_NAME"
MODE="run"

CONTAINER_NAME="$PARSED_CONTAINER"
IMAGE="$PARSED_IMAGE"

$ports_block

$volumes_block

$extra_block

${cmd_block:+$cmd_block

}DO_BACKUP=$do_backup_val
EOF

    chmod +x "$target_dir/config.sh"
    echo ""
    echo -e "✅ ${GREEN}Servicio '$NEW_NAME' generado con éxito en '$SERVICE_DIR_NAME/config.sh'${NC}"
    echo -e "📁 ${CYAN}Carpeta de configuración creada:${NC} $SERVICE_DIR_NAME/config"

  elif [ "$mode_type" = "wizard" ]; then
    read -rp "👉 Nombre del directorio del servicio (ej: mi-servicio): " SERVICE_DIR_NAME
    SERVICE_DIR_NAME=$(echo "$SERVICE_DIR_NAME" | tr ' ' '-' | sed 's/[^a-zA-Z0-9_-]//g' | tr 'A-Z' 'a-z')

    if [ -z "$SERVICE_DIR_NAME" ]; then
      echo -e "${RED}❌ El nombre del directorio no puede estar vacío.${NC}"
      return 1
    fi

    local target_dir="$BASE_DIR/$SERVICE_DIR_NAME"
    if [ -d "$target_dir" ]; then
      echo -e "${RED}❌ Ya existe el directorio '$SERVICE_DIR_NAME'.${NC}"
      return 1
    fi

    read -rp "👉 Nombre descriptivo (ej: Servidor Nginx): " NEW_NAME
    [ -z "$NEW_NAME" ] && NEW_NAME="$SERVICE_DIR_NAME"

    read -rp "👉 Nombre del contenedor (CONTAINER_NAME, ej: nginx_app): " NEW_CONTAINER
    read -rp "👉 Imagen de Docker (IMAGE, ej: nginx:latest): " NEW_IMAGE
    read -rp "👉 Puertos mapeados (ej: 8080:80, enter para ninguno): " NEW_PORTS_RAW
    if [ -n "$NEW_PORTS_RAW" ]; then
      NEW_PORTS_RAW=$(validate_or_suggest_port "$NEW_PORTS_RAW")
    fi
    read -rp "👉 Volúmenes mapeados (ej: $USER_HOME/data:/data, enter para ninguno): " NEW_VOLUMES_RAW
    read -rp "👉 Comando / Argumentos tras la imagen (opcional, enter para omitir): " NEW_COMMAND
    read -rp "👉 ¿Activar backup de volúmenes antes de actualizar? (s/N): " BACKUP_OPT

    local do_backup_val="false"
    if [[ "$BACKUP_OPT" =~ ^[sS]$ ]]; then
      do_backup_val="true"
    fi

    local ports_block="PORTS=\"\""
    if [ -n "$NEW_PORTS_RAW" ]; then
      ports_block="PORTS=\"
-p $NEW_PORTS_RAW
\""
    fi

    local volumes_block="VOLUMES=\"\""
    if [ -n "$NEW_VOLUMES_RAW" ]; then
      volumes_block="VOLUMES=\"
-v $NEW_VOLUMES_RAW
\""
    fi

    mkdir -p "$target_dir"

    cat <<EOF > "$target_dir/config.sh"
#!/bin/bash

NAME="$NEW_NAME"
MODE="run"

CONTAINER_NAME="${NEW_CONTAINER:-$SERVICE_DIR_NAME}"
IMAGE="${NEW_IMAGE:-nginx:latest}"

$ports_block

$volumes_block

EXTRA_ARGS=""

${NEW_COMMAND:+COMMAND="$NEW_COMMAND"

}DO_BACKUP=$do_backup_val
EOF

    chmod +x "$target_dir/config.sh"
    echo -e "✅ ${GREEN}Servicio '$NEW_NAME' creado correctamente en '$SERVICE_DIR_NAME/config.sh'${NC}"

  else
    # Modo compose
    read -rp "👉 Nombre del directorio del servicio (ej: mi-stack): " SERVICE_DIR_NAME
    SERVICE_DIR_NAME=$(echo "$SERVICE_DIR_NAME" | tr ' ' '-' | sed 's/[^a-zA-Z0-9_-]//g' | tr 'A-Z' 'a-z')

    if [ -z "$SERVICE_DIR_NAME" ]; then
      echo -e "${RED}❌ El nombre del directorio no puede estar vacío.${NC}"
      return 1
    fi

    local target_dir="$BASE_DIR/$SERVICE_DIR_NAME"
    if [ -d "$target_dir" ]; then
      echo -e "${RED}❌ Ya existe el directorio '$SERVICE_DIR_NAME'.${NC}"
      return 1
    fi

    read -rp "👉 Nombre descriptivo (ej: Mi Stack): " NEW_NAME
    [ -z "$NEW_NAME" ] && NEW_NAME="$SERVICE_DIR_NAME"

    read -rp "👉 Imagen principal a monitorizar (IMAGE, opcional, enter para omitir): " NEW_IMAGE
    read -rp "👉 ¿Deseas generar un archivo docker-compose.yml de plantilla? (S/n): " COMPOSE_TEMPLATE_OPT

    mkdir -p "$target_dir"

    cat <<EOF > "$target_dir/config.sh"
#!/bin/bash

NAME="$NEW_NAME"
MODE="compose"

${NEW_IMAGE:+IMAGE="$NEW_IMAGE"}

DO_BACKUP=false
EOF

    if [[ ! "$COMPOSE_TEMPLATE_OPT" =~ ^[nN]$ ]]; then
      cat <<EOF > "$target_dir/docker-compose.yml"
services:
  app:
    image: ${NEW_IMAGE:-nginx:alpine}
    container_name: ${SERVICE_DIR_NAME}_app
    ports:
      - "8080:80"
    restart: unless-stopped
EOF
      echo -e "📄 Creado ${GREEN}docker-compose.yml${NC} de plantilla en ${GRAY}$target_dir${NC}"
    fi

    chmod +x "$target_dir/config.sh"
    echo -e "✅ ${GREEN}Servicio '$NEW_NAME' creado correctamente en '$SERVICE_DIR_NAME/config.sh'${NC}"
  fi

  echo ""
  read -rp "🚀 ¿Deseas arrancar el servicio ahora mismo? (S/n): " START_NOW
  if [[ ! "$START_NOW" =~ ^[nN]$ ]]; then
    echo ""
    discover_services
    update_service "$SERVICE_DIR_NAME" false
  fi

  return 0
}

# ─────────────────────────────
# Backup de Volúmenes
# ─────────────────────────────
backup_volumes() {
  local service="$1"
  local backup_file=""
  if [ "$DO_BACKUP" = true ]; then
    backup_file=$(perform_service_backup "$service" "silent")
  fi
  echo "$backup_file"
}

# ─────────────────────────────
# Comprobación de Actualización
# ─────────────────────────────
check_image_update() {
  local img="$1"
  [ -z "$img" ] && { echo "ok"; return; }

  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "update"
    return
  fi

  local local_digest
  local_digest=$(docker inspect --format='{{index .RepoDigests 0}}' "$img" 2>/dev/null | cut -d'@' -f2 || echo "none")

  local remote_digest
  if ! remote_digest=$(docker buildx imagetools inspect "$img" --format '{{json .Manifest.Digest}}' 2>/dev/null | tr -d '"'); then
    echo "error"
    return
  fi

  if [[ "$local_digest" != "$remote_digest" ]]; then
    echo "update"
  else
    echo "ok"
  fi
}

check_update() {
  local service="$1"
  load_service_config "$service" || { echo "error"; return; }

  local images_to_check=()

  if [ "$MODE" = "compose" ]; then
    local service_dir="$BASE_DIR/$service"
    if [ -d "$service_dir" ]; then
      local compose_imgs
      compose_imgs=$(cd "$service_dir" 2>/dev/null && docker compose config --images 2>/dev/null || true)
      if [ -n "$compose_imgs" ]; then
        while read -r img; do
          [ -n "$img" ] && images_to_check+=("$img")
        done <<< "$compose_imgs"
      fi
    fi
  fi

  if [ ${#images_to_check[@]} -eq 0 ] && [ -n "$IMAGE" ]; then
    images_to_check+=("$IMAGE")
  fi

  if [ ${#images_to_check[@]} -eq 0 ]; then
    echo "ok"
    return
  fi

  local has_update=false
  local has_error=false

  for img in "${images_to_check[@]}"; do
    local st
    st=$(check_image_update "$img")
    if [ "$st" = "update" ]; then
      has_update=true
    elif [ "$st" = "error" ]; then
      has_error=true
    fi
  done

  if [ "$has_update" = true ]; then
    echo "update"
  elif [ "$has_error" = true ]; then
    echo "error"
  else
    echo "ok"
  fi
}

# ─────────────────────────────
# Comprobación de Actualizaciones en Paralelo
# ─────────────────────────────
check_all_updates_parallel() {
  local tmp_dir
  tmp_dir=$(mktemp -d "/tmp/docker_check_XXXXXX" 2>/dev/null || mktemp -d)
  local max_jobs=6
  local current_jobs=0

  for s in "${SERVICES[@]}"; do
    (
      st=$(check_update "$s")
      echo "$st" > "$tmp_dir/$s"
    ) &
    ((current_jobs++))
    if [ $current_jobs -ge $max_jobs ]; then
      wait -n 2>/dev/null || sleep 0.1
      ((current_jobs--))
    fi
  done
  wait

  UPDATABLE=()
  for s in "${SERVICES[@]}"; do
    load_service_config "$s"
    local status="error"
    [ -f "$tmp_dir/$s" ] && status=$(cat "$tmp_dir/$s")
    case "$status" in
      update)
        echo -e " 🟢 ${GREEN}$NAME ($s)${NC} → ¡Actualización disponible!"
        UPDATABLE+=("$s")
        ;;
      ok)
        echo -e " ⚪ ${GRAY}$NAME ($s)${NC} → Al día"
        ;;
      *)
        echo -e " 🔴 ${RED}$NAME ($s)${NC} → Error al comprobar"
        ;;
    esac
  done
  rm -rf "$tmp_dir"
}

# ─────────────────────────────
# Ejecutar Actualización
# ─────────────────────────────
update_service() {
  local service="$1"
  local no_prune="$2"
  local force="$3"

  load_service_config "$service" || {
    echo -e "${RED}❌ No se pudo cargar la configuración de $service${NC}"
    return 1
  }

  echo -e "${BLUE}==============================="
  echo -e "🔄 Actualizando: $NAME ($service)"
  echo -e "📦 Modo: $MODE"
  echo -e "===============================${NC}"

  local backup_file=""
  local update_error=false

  {
    backup_file=$(backup_volumes "$service")

    case "$MODE" in
      run)
        if [ -z "$IMAGE" ]; then
          echo -e "${RED}❌ IMAGE no está definida para $service${NC}"
          update_error=true
        else
          echo -e "⬇️ ${CYAN}Descargando imagen $IMAGE...${NC}"
          local pull_tmp
          pull_tmp=$(mktemp)
          if docker pull "$IMAGE" 2>&1 | tee "$pull_tmp"; then
            PULL_OUTPUT=$(cat "$pull_tmp")
            rm -f "$pull_tmp"

            if echo "$PULL_OUTPUT" | grep -q "Image is up to date" && [ "$force" != "true" ]; then
              echo -e "✅ ${GREEN}$NAME ya está en su última versión, se omite reinicio.${NC}"
            else
              if [ "$force" = "true" ] && echo "$PULL_OUTPUT" | grep -q "Image is up to date"; then
                echo -e "🔄 ${YELLOW}Recreando contenedor $NAME con la configuración actual...${NC}"
              else
                echo -e "🚀 ${GREEN}Nueva versión descargada con éxito. Actualizando $NAME...${NC}"
              fi

              if [ -n "$CONTAINER_NAME" ]; then
                echo "🛑 Parando contenedor $CONTAINER_NAME..."
                docker stop "$CONTAINER_NAME" >/dev/null 2>&1 || true
                docker rm "$CONTAINER_NAME" >/dev/null 2>&1 || true
              fi

              echo "🚀 Arrancando contenedor..."
              local restart_flag="--restart=unless-stopped"
              if [[ "$EXTRA_ARGS" == *"--restart"* ]]; then
                restart_flag=""
              fi
              docker run -d \
                $PORTS \
                ${CONTAINER_NAME:+--name "$CONTAINER_NAME"} \
                $restart_flag \
                $VOLUMES \
                $EXTRA_ARGS \
                "$IMAGE" \
                $COMMAND
            fi
          else
            rm -f "$pull_tmp"
            echo -e "${RED}❌ Error al descargar la imagen $IMAGE${NC}"
            update_error=true
          fi
        fi
        ;;

      compose)
        local service_dir="$BASE_DIR/$service"
        echo -e "📂 Navegando a $service_dir..."
        (
          cd "$service_dir"
          echo "⬇️ Descargando imágenes del stack compose..."
          docker compose pull
          if [ "$force" = "true" ]; then
            echo "🚀 Recreando y actualizando stack con docker compose..."
            docker compose up -d --force-recreate --remove-orphans
          else
            echo "🚀 Actualizando stack con docker compose (sin tiempo de corte)..."
            docker compose up -d --remove-orphans
          fi
        )
        ;;

      *)
        echo -e "${RED}❌ MODE inválido ($MODE) en $service${NC}"
        update_error=true
        ;;
    esac

    if [ "$no_prune" != "true" ]; then
      echo "🧹 Limpiando imágenes antiguas..."
      docker image prune -f
    fi

    if [ "$update_error" = false ]; then
      echo -e "✅ ${GREEN}$NAME actualizado correctamente${NC}"
      if [ "$DO_BACKUP" = true ] && [ -n "$backup_file" ] && [ -f "$backup_file" ]; then
        echo "🗑 Eliminando backup temporal $backup_file (actualización OK)"
        rm -f "$backup_file"
      fi
    fi

  } || {
    echo -e "${RED}❌ Error actualizando $NAME${NC}"
    update_error=true
    if [ "$DO_BACKUP" = true ] && [ -n "$backup_file" ] && [ -f "$backup_file" ]; then
      echo -e "⚠️ ${YELLOW}Backup retenido en $backup_file por error${NC}"
    fi
  }

  if [ "$update_error" = true ]; then
    echo "$(date '+%Y-%m-%d %H:%M:%S') - ERROR - $NAME ($service)" >> "$LOG_FILE"
    SESSION_RESULTS+=("$NAME ($service): ERROR")
  else
    echo "$(date '+%Y-%m-%d %H:%M:%S') - OK - $NAME ($service)" >> "$LOG_FILE"
    SESSION_RESULTS+=("$NAME ($service): OK")
  fi
  invalidate_docker_state_cache
}

# ─────────────────────────────
# Mostrar Comandos de Arranque
# ─────────────────────────────
show_command() {
  local service="$1"
  load_service_config "$service" || return 1

  echo ""
  echo -e "🐳 ${BLUE}$NAME${NC} (${GRAY}$service${NC}) [Modo: ${YELLOW}$MODE${NC}]"
  echo "--------------------------------------------------"

  if [ "$MODE" = "compose" ]; then
    echo -e "${GREEN}cd \"$BASE_DIR/$service\" && docker compose up -d${NC}"
    return
  fi

  echo "docker run -d \\"
  if [ -n "$PORTS" ]; then
    while read -r line; do
      [ -n "$line" ] && echo "  $line \\"
    done <<< "$PORTS"
  fi

  [ -n "$CONTAINER_NAME" ] && echo "  --name $CONTAINER_NAME \\"
  if [[ "$EXTRA_ARGS" != *"--restart"* ]]; then
    echo "  --restart=unless-stopped \\"
  fi

  if [ -n "$VOLUMES" ]; then
    while read -r line; do
      [ -n "$line" ] && echo "  $line \\"
    done <<< "$VOLUMES"
  fi

  if [ -n "$EXTRA_ARGS" ]; then
    while read -r line; do
      [ -n "$line" ] && echo "  $line \\"
    done <<< "$EXTRA_ARGS"
  fi

  if [ -n "$COMMAND" ]; then
    echo "  $IMAGE \\"
    echo "  $COMMAND"
  else
    echo "  $IMAGE"
  fi
}

# ─────────────────────────────
# Pantalla de Ayuda y Documentación
# ─────────────────────────────
show_help() {
  echo ""
  echo -e "${BLUE}================================================================================"
  echo "📖 GUÍA COMPLETA Y AYUDA - GESTOR DE SERVICIOS DOCKER"
  echo -e "================================================================================${NC}"
  echo -e "Este script automatiza la gestión, actualización, copias de seguridad y"
  echo -e "monitorización de servicios en contenedores individuales (${YELLOW}docker run${NC}) o stacks (${YELLOW}docker compose${NC})."
  echo ""
  echo -e "${CYAN}📌 OPCIONES DEL MENÚ INTERACTIVO:${NC}"
  echo -e "  ${GREEN}1..N${NC}   Actualizar/recrear un servicio específico (pregunta si forzar recreación)."
  echo -e "  ${GREEN}a${NC}      Actualizar TODOS los servicios configurados en el directorio."
  echo -e "  ${GREEN}c${NC}      Comprobar qué servicios tienen actualización remota (mediante SHA256 digest)."
  echo -e "         └─> Subopción ${YELLOW}u${NC}: Actualiza directamente y sin esperas los que tengan versión nueva."
  echo -e "  ${GREEN}p${NC}      Ciclo de vida: Iniciar (start), detener (stop), reiniciar (restart) o recrear (recreate) contenedores."
  echo -e "  ${GREEN}m${NC}      Monitor de recursos: Muestra consumo de CPU, RAM, I/O de red y disco en tiempo real."
  echo -e "  ${GREEN}s${NC}      Mostrar comandos: Imprime el comando exacto de arranque (docker run o compose)."
  echo -e "  ${GREEN}l${NC}      Ver logs: Inspecciona los últimos registros en vivo con seguimiento (tail -f)."
  echo -e "  ${GREEN}b${NC}      Mantenimiento y limpieza: Vacía logs, elimina backups antiguos y ejecuta prune."
  echo -e "  ${GREEN}n${NC}      Crear nuevo servicio: Asistente guiado o conversión automática desde 'docker run'."
  echo -e "  ${GREEN}h${NC}      Configurar ruta base de usuario (USER_HOME para backups y volúmenes)."
  echo -e "  ${GREEN}k${NC}      Crear backup: Genera una copia comprimida .tar.gz (individual o TODOS)."
  echo -e "  ${GREEN}r${NC}      Restaurar backup: Permite recuperar un archivo .tar.gz de respaldo en el host."
  echo -e "  ${GREEN}?${NC}      Mostrar esta pantalla de ayuda y documentación."
  echo -e "  ${GREEN}q${NC}      Salir del gestor Docker."
  echo ""
  echo -e "${CYAN}💻 USO DIRECTO POR LÍNEA DE COMANDOS (CLI):${NC}"
  echo -e "  ${YELLOW}./update.sh -c | --check${NC}                 Comprobar actualizaciones en todos los servicios."
  echo -e "  ${YELLOW}./update.sh -a | --all [-f]${NC}              Actualizar todos los servicios (-f fuerza recreación)."
  echo -e "  ${YELLOW}./update.sh <servicio> [-f]${NC}              Actualizar un servicio concreto por su carpeta."
  echo -e "  ${YELLOW}./update.sh --start <servicio>${NC}           Iniciar un contenedor o stack."
  echo -e "  ${YELLOW}./update.sh --stop <servicio>${NC}            Detener un contenedor o stack."
  echo -e "  ${YELLOW}./update.sh --restart <servicio>${NC}         Reiniciar un contenedor o stack."
  echo -e "  ${YELLOW}./update.sh --recreate <servicio>${NC}        Recrear forzosamente un contenedor o stack."
  echo -e "  ${YELLOW}./update.sh --restart-policy <svc|all> <pol>${NC} Cambiar política de reinicio (unless-stopped|always|on-failure|no)."
  echo -e "  ${YELLOW}./update.sh -m | --stats${NC}                 Monitor de consumo de recursos en vivo."
  echo -e "  ${YELLOW}./update.sh -l | --logs <servicio>${NC}       Ver logs en tiempo real de un servicio."
  echo -e "  ${YELLOW}./update.sh -s | --show${NC}                  Mostrar comandos de arranque de todos los servicios."
  echo -e "  ${YELLOW}./update.sh -b | --clean${NC}                 Menú de limpieza y mantenimiento."
  echo -e "  ${YELLOW}./update.sh -k | --backup [servicio|all]${NC}   Crear copia de seguridad ahora (individual o todos)."
  echo -e "  ${YELLOW}./update.sh -r | --restore${NC}               Asistente de restauración de copias de seguridad."
  echo -e "  ${YELLOW}./update.sh -n [comando_docker_run]${NC}     Crear servicio interactivamente o desde comando."
  echo -e "  ${YELLOW}./update.sh --set-user-home <ruta>${NC}      Guardar nueva ruta de usuario persistente."
  echo -e "  ${YELLOW}./update.sh --help | -?${NC}                  Mostrar esta ayuda."
  echo -e "================================================================================${NC}"
}

# ─────────────────────────────
# Inicio de Ejecución
# ─────────────────────────────
check_prerequisites
clean_old_backups

# Soporte para ayuda y crear nuevo servicio vía argumento CLI
if [ "$1" = "--help" ] || [ "$1" = "-?" ] || [ "$1" = "help" ]; then
  show_help
  exit 0
elif [ "$1" = "--new" ] || [ "$1" = "-n" ] || [ "$1" = "--from-run" ]; then
  create_new_service "$2"
  exit 0
elif [ "$1" = "--logs" ] || [ "$1" = "-l" ]; then
  discover_services
  view_service_logs "$2"
  exit 0
elif [ "$1" = "--backup" ] || [ "$1" = "-k" ]; then
  create_manual_backup_menu "$2"
  exit 0
elif [ "$1" = "--restore" ] || [ "$1" = "-r" ]; then
  restore_backup
  exit 0
elif [ "$1" = "--set-user-home" ]; then
  configure_user_home "$2"
  exit 0
elif [ "$1" = "--stats" ] || [ "$1" = "-m" ]; then
  monitor_resources
  exit 0
elif [ "$1" = "--clean" ] || [ "$1" = "-b" ]; then
  manage_maintenance
  exit 0
elif [ "$1" = "--start" ] || [ "$1" = "--start-all" ]; then
  discover_services
  tgt="${2:-all}"
  [ "$tgt" != "all" ] && tgt=$(resolve_service_input "$tgt" || echo "$tgt")
  lifecycle_service "$tgt" "start"
  exit 0
elif [ "$1" = "--stop" ] || [ "$1" = "--stop-all" ]; then
  discover_services
  tgt="${2:-all}"
  [ "$tgt" != "all" ] && tgt=$(resolve_service_input "$tgt" || echo "$tgt")
  lifecycle_service "$tgt" "stop"
  exit 0
elif [ "$1" = "--restart" ] || [ "$1" = "--restart-all" ]; then
  discover_services
  tgt="${2:-all}"
  [ "$tgt" != "all" ] && tgt=$(resolve_service_input "$tgt" || echo "$tgt")
  lifecycle_service "$tgt" "restart"
  exit 0
elif [ "$1" = "--recreate" ] || [ "$1" = "--recreate-all" ]; then
  discover_services
  tgt="${2:-all}"
  [ "$tgt" != "all" ] && tgt=$(resolve_service_input "$tgt" || echo "$tgt")
  lifecycle_service "$tgt" "recreate"
  exit 0
elif [ "$1" = "--restart-policy" ] || [ "$1" = "--policy" ] || [ "$1" = "-rp" ]; then
  discover_services
  tgt="${2:-all}"
  pol="${3:-unless-stopped}"
  if [ "$tgt" = "unless-stopped" ] || [ "$tgt" = "always" ] || [ "$tgt" = "on-failure" ] || [ "$tgt" = "no" ]; then
    pol="$tgt"
    tgt="all"
  fi
  [ "$tgt" != "all" ] && tgt=$(resolve_service_input "$tgt" || echo "$tgt")
  change_service_restart_policy "$tgt" "$pol"
  exit 0
fi

discover_services

# Soporte para argumentos de CLI cuando hay o no servicios
if [ "$1" = "--check" ] || [ "$1" = "-c" ]; then
  echo -e "${BLUE}📊 Comprobando actualizaciones en paralelo (SHA256)...${NC}"
  check_all_updates_parallel
  exit 0
elif [ "$1" = "--show" ] || [ "$1" = "-s" ]; then
  for s in "${SERVICES[@]}"; do
    show_command "$s"
  done
  exit 0
elif [ "$1" = "--all" ] || [ "$1" = "-a" ] || [ "$1" = "-fa" ] || [ "$1" = "-af" ]; then
  CLI_FORCE=false
  if [ "$1" = "-fa" ] || [ "$1" = "-af" ] || [ "$2" = "-f" ] || [ "$2" = "--force" ]; then
    CLI_FORCE=true
  fi
  for s in "${SERVICES[@]}"; do
    update_service "$s" true "$CLI_FORCE"
  done
  docker image prune -f
  exit 0
elif [ -n "$1" ]; then
  CLI_FORCE=false
  TARGET_ARG="$1"
  if [ "$1" = "-f" ] || [ "$1" = "--force" ]; then
    CLI_FORCE=true
    TARGET_ARG="$2"
  elif [ "$2" = "-f" ] || [ "$2" = "--force" ]; then
    CLI_FORCE=true
  fi

  resolved=$(resolve_service_input "$TARGET_ARG")
  if [ -n "$resolved" ]; then
    update_service "$resolved" false "$CLI_FORCE"
    exit 0
  else
    echo -e "${RED}❌ Servicio no encontrado: '$TARGET_ARG'${NC}"
    exit 1
  fi
fi

# Menú Interactivo Principal (Bucle persistente)
while true; do
  SESSION_RESULTS=()
  discover_services
  refresh_docker_state_cache

  echo ""
  echo -e "${BLUE}=========================================================================================="
  echo "🐳 Gestor de Servicios Docker"
  echo -e "==========================================================================================${NC}"

  if [ ${#SERVICES[@]} -eq 0 ]; then
    echo -e "${YELLOW}⚠️ No se encontraron servicios existentes.${NC}"
  else
    printf " ${GRAY}%-4s %-25s %-18s %-10s %-8s %s${NC}\n" "#" "SERVICIO" "CARPETA" "MODO" "PUERTO" "ESTADO"
    echo -e "${GRAY}------------------------------------------------------------------------------------------${NC}"
    i=1
    for s in "${SERVICES[@]}"; do
      load_service_config "$s"
      st=$(get_service_status "$s")
      p=$(get_service_port "$s")

      disp_name="$NAME"
      [ ${#disp_name} -gt 24 ] && disp_name="${disp_name:0:21}..."
      disp_s="$s"
      [ ${#disp_s} -gt 17 ] && disp_s="${disp_s:0:15}..."

      printf " %2d) ${GREEN}%-24s${NC} ${GRAY}%-18s${NC} ${YELLOW}%-10s${NC} ${CYAN}%-8s${NC} %b\n" \
        "$i" "$disp_name" "$disp_s" "[$MODE]" "$p" "$st"
      ((i++))
    done
    echo -e "${GRAY}------------------------------------------------------------------------------------------${NC}"
  fi

  echo ""
  if [ ${#SERVICES[@]} -gt 0 ]; then
    echo -e "${CYAN}── 🚀 Actualizaciones (Internet) ──${NC}"
    echo -e " ${YELLOW}c${NC}) 🔍 Comprobar actualizaciones disponibles (SHA256)"
    echo -e " ${YELLOW}a${NC}) ⬇️  Actualizar TODOS los servicios (Pull de imágenes y despliegue)"
    echo ""
    echo -e "${CYAN}── ⏯️ Control de Contenedores (Local) ──${NC}"
    echo -e " ${YELLOW}p${NC}) 🕹️ Ciclo de Vida: Iniciar, Detener, Reiniciar o Recrear"
    echo ""
    echo -e "${CYAN}── 📊 Monitorización y Diagnóstico ──${NC}"
    echo -e " ${YELLOW}l${NC}) 📋 Ver logs de un servicio en vivo (tail -f)"
    echo -e " ${YELLOW}m${NC}) 📈 Monitor de recursos en tiempo real (docker stats)"
    echo -e " ${YELLOW}s${NC}) 📜 Mostrar comandos de arranque exactos (run / compose)"
  else
    echo -e "${CYAN}── 📊 Monitorización ──${NC}"
    echo -e " ${YELLOW}m${NC}) 📈 Monitor de recursos en tiempo real (docker stats)"
  fi

  echo ""
  echo -e "${CYAN}── 🛠️ Administración y Mantenimiento ──${NC}"
  echo -e " ${YELLOW}n${NC}) ✨ Crear NUEVO servicio Docker (Asistente guiado)"
  echo -e " ${YELLOW}b${NC}) 🧹 Limpieza y mantenimiento (Logs, Backups, Prune del sistema)"
  echo -e " ${YELLOW}k${NC}) 💾 Crear copia de seguridad ahora (individual o de TODOS)"
  echo -e " ${YELLOW}r${NC}) 💾 Restaurar copia de seguridad (Rollback)"
  echo -e " ${YELLOW}h${NC}) ⚙️ Configurar ruta base de usuario (actual: $USER_HOME)"
  echo ""
  echo -e "${CYAN}── ℹ️ Ayuda y Salida ──${NC}"
  echo -e " ${YELLOW}?${NC}) ❓ Ayuda detallada y comandos CLI"
  echo -e " ${YELLOW}q${NC}) 🚪 Salir"
  echo "-------------------------------"

  read -rp "👉 Elige una opción: " OPTION

  case "$OPTION" in
    q|Q)
      echo ""
      echo -e "${GREEN}👋 Saliendo del gestor Docker. ¡Hasta luego!${NC}"
      exit 0
      ;;
    \?|help|ayuda|HELP|AYUDA)
      show_help
      ;;
    n|N)
      create_new_service
      ;;
    h|H)
      configure_user_home
      ;;
    l|L)
      view_service_logs
      ;;
    k|K)
      create_manual_backup_menu
      ;;
    r|R)
      restore_backup
      ;;
    p|P)
      select_lifecycle_menu
      ;;
    m|M)
      monitor_resources
      ;;
    b|B)
      manage_maintenance
      ;;
    a|A)
      echo ""
      read -rp "🔄 ¿Deseas forzar el reinicio/recreación de TODOS los servicios aunque no haya nueva imagen? (s/N): " FORCE_OPT
      force_val=false
      if [[ "$FORCE_OPT" =~ ^[sS]$ ]]; then
        force_val=true
      fi

      for s in "${SERVICES[@]}"; do
        update_service "$s" true "$force_val"
      done
      echo "🧹 Limpiando imágenes antiguas..."
      docker image prune -f
      ;;
    s|S)
      for s in "${SERVICES[@]}"; do
        show_command "$s"
      done
      ;;
    c|C)
      echo ""
      echo -e "${BLUE}📊 Comprobando estado de actualizaciones en paralelo (SHA256)...${NC}"
      check_all_updates_parallel

      if [ ${#UPDATABLE[@]} -eq 0 ]; then
        echo ""
        echo -e "✅ ${GREEN}Todos los servicios están al día.${NC}"
      else
        echo ""
        echo -e " ${YELLOW}u) Actualizar SOLO los servicios con actualización disponible${NC}"
        echo -e " ${YELLOW}v) Volver al menú principal${NC}"
        echo "-------------------------------"

        read -rp "👉 Elige una opción: " SUBOPTION
        case "$SUBOPTION" in
          u|U)
            echo ""
            echo -e "${CYAN}🚀 Descargando e instalando actualizaciones directamente sin comprobaciones redundantes...${NC}"
            for s in "${UPDATABLE[@]}"; do
              update_service "$s" true true
            done
            echo "🧹 Limpiando imágenes antiguas..."
            docker image prune -f
            ;;
          *)
            echo "Volviendo al menú principal..."
            ;;
        esac
      fi
      ;;
    *)
      resolved=$(resolve_service_input "$OPTION")
      if [ -n "$resolved" ]; then
        selected_svc="$resolved"
        load_service_config "$selected_svc"
        echo ""
        echo -e "🎯 Servicio seleccionado: ${GREEN}$NAME${NC} (${GRAY}$selected_svc${NC})"
        read -rp "🔄 ¿Deseas forzar la recreación/reinicio del contenedor aunque no haya nueva imagen? (s/N): " FORCE_OPT
        force_val=false
        if [[ "$FORCE_OPT" =~ ^[sS]$ ]]; then
          force_val=true
        fi
        update_service "$selected_svc" false "$force_val"
      else
        echo -e "${RED}❌ Opción o servicio no reconocido: '$OPTION'${NC}"
      fi
      ;;
  esac

  if [ ${#SESSION_RESULTS[@]} -gt 0 ]; then
    echo ""
    echo -e "${BLUE}==============================="
    echo "📋 Resumen de la Sesión"
    echo -e "===============================${NC}"
    for res in "${SESSION_RESULTS[@]}"; do
      if [[ "$res" == *": OK"* ]]; then
        echo -e "  ✅ ${GREEN}$res${NC}"
      else
        echo -e "  ❌ ${RED}$res${NC}"
      fi
    done
    echo "-------------------------------"
    echo -e "📁 Historial completo guardado en: ${CYAN}$LOG_FILE${NC}"
  fi

  echo ""
  read -rp "👉 Presiona [Enter] para volver al menú principal..." _
  clear 2>/dev/null || echo ""
done
