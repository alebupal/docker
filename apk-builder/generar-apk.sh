#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Colores para salida estética
CYAN='\033[1;36m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${CYAN}=========================================================="
echo -e "${BOLD}       GENERADOR UNIVERSAL DE APKs DESDE WEB HTML         "
echo -e "${CYAN}==========================================================${NC}"

# Comprobar que Docker está instalado
if ! command -v docker &> /dev/null; then
    echo -e "${RED}[-] Error: Docker no está instalado en este sistema.${NC}"
    exit 1
fi

INPUT_DIR="$1"
INPUT_NAME="$2"
INPUT_ID="$3"

# Si no se pasó ruta por argumento, pedirla interactivamente
if [ -z "$INPUT_DIR" ]; then
    DEFAULT_DIR="../suite-web/www/generarPassword"
    echo -e "${YELLOW}Introduce la ruta de la carpeta que contiene tu proyecto web (HTML/CSS/JS):${NC}"
    read -r -p "Ruta [$DEFAULT_DIR]: " INPUT_DIR
    INPUT_DIR="${INPUT_DIR:-$DEFAULT_DIR}"
fi

# Resolver ruta absoluta
if [ -d "$INPUT_DIR" ]; then
    TARGET_DIR="$(readlink -f "$INPUT_DIR")"
else
    # Probar relativa al directorio actual
    if [ -d "$SCRIPT_DIR/$INPUT_DIR" ]; then
        TARGET_DIR="$(readlink -f "$SCRIPT_DIR/$INPUT_DIR")"
    else
        echo -e "\n${RED}[-] ERROR: El directorio especificado no existe: $INPUT_DIR${NC}"
        exit 1
    fi
fi

# Validar que exista index.html
if [ ! -f "$TARGET_DIR/index.html" ]; then
    echo -e "\n${RED}[-] ERROR: No se encontró 'index.html' en: $TARGET_DIR${NC}"
    echo -e "    El directorio debe contener al menos un archivo index.html."
    exit 1
fi

# Si no se indicó nombre por parámetro, intentar auto-detectarlo o preguntar
if [ -z "$INPUT_NAME" ]; then
    DETECTED_TITLE=$(grep -iPo '(?<=<title>)(.*?)(?=</title>)' "$TARGET_DIR/index.html" 2>/dev/null | head -n 1 | sed 's/^[ \t]*//;s/[ \t]*$//' || true)
    DEFAULT_NAME="${DETECTED_TITLE:-$(basename "$TARGET_DIR")}"
    
    # En modo interactivo, confirmar con el usuario
    if [ -t 0 ]; then
        echo -e "\n${YELLOW}Nombre para la aplicación Android:${NC}"
        read -r -p "Nombre [$DEFAULT_NAME]: " USER_NAME
        INPUT_NAME="${USER_NAME:-$DEFAULT_NAME}"
    else
        INPUT_NAME="$DEFAULT_NAME"
    fi
fi

# Si no se indicó ID por parámetro, generar uno por defecto
if [ -z "$INPUT_ID" ]; then
    CLEAN_SLUG=$(echo "$INPUT_NAME" | iconv -t ascii//TRANSLIT 2>/dev/null | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]' || echo "$INPUT_NAME" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')
    [ -z "$CLEAN_SLUG" ] && CLEAN_SLUG="webapp"
    DEFAULT_ID="com.alebupal.$CLEAN_SLUG"

    if [ -t 0 ]; then
        echo -e "\n${YELLOW}Identificador de paquete Android (Package ID):${NC}"
        read -r -p "Package ID [$DEFAULT_ID]: " USER_ID
        INPUT_ID="${USER_ID:-$DEFAULT_ID}"
    else
        INPUT_ID="$DEFAULT_ID"
    fi
fi

mkdir -p "$SCRIPT_DIR/output"

echo ""
echo -e "${CYAN}----------------------------------------------------------${NC}"
echo -e "${BOLD}Resumen de compilación:${NC}"
echo -e " 📁 Origen web:   ${GREEN}$TARGET_DIR${NC}"
echo -e " 📱 Nombre App:   ${GREEN}$INPUT_NAME${NC}"
echo -e " 🏷️  Package ID:   ${GREEN}$INPUT_ID${NC}"
echo -e " 📦 Destino APK:  ${GREEN}$SCRIPT_DIR/output/${NC}"
echo -e "${CYAN}----------------------------------------------------------${NC}"
echo ""

# Asegurar permisos de ejecución del script de entrada
chmod +x "$SCRIPT_DIR/entrypoint.sh" 2>/dev/null || true

# 1. Asegurar imagen Docker
if ! docker image inspect apk-builder:latest >/dev/null 2>&1; then
    echo -e "${YELLOW}[*] Construyendo imagen de compilación Docker (primera vez)...${NC}"
    docker compose build
fi

# 2. Ejecutar compilación pasando las variables
echo -e "${YELLOW}[*] Lanzando contenedor para empaquetar y compilar...${NC}"
WEB_DIR="$TARGET_DIR" \
APP_NAME="$INPUT_NAME" \
APP_ID="$INPUT_ID" \
OUTPUT_DIR="$SCRIPT_DIR/output" \
docker compose run --rm apk-builder

echo -e "\n${GREEN}[✓] Proceso finalizado. Revisa la carpeta '$SCRIPT_DIR/output/' para obtener tu APK.${NC}\n"
