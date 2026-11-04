#!/bin/bash
set -e

echo "=========================================================="
echo "         COMPILADOR GENÉRICO DE WEB APPS A APK            "
echo "=========================================================="

SRC_DIR="/src-web"
OUT_DIR="/output"
BUILD_DIR="/workspace/build"

if [ ! -d "$SRC_DIR" ] || [ ! -f "$SRC_DIR/index.html" ]; then
    echo "[-] ERROR: No se encontró 'index.html' en $SRC_DIR"
    echo "    Asegúrate de montar un directorio web válido con su index.html."
    exit 1
fi

# Detectar o configurar APP_NAME
if [ -z "$APP_NAME" ]; then
    # Intentar extraer del <title> de index.html
    TITLE_DETECTED=$(grep -iPo '(?<=<title>)(.*?)(?=</title>)' "$SRC_DIR/index.html" 2>/dev/null | head -n 1 | sed 's/^[ \t]*//;s/[ \t]*$//' || true)
    if [ -n "$TITLE_DETECTED" ]; then
        APP_NAME="$TITLE_DETECTED"
    else
        APP_NAME="WebApp"
    fi
fi

# Nombre de archivo seguro (sin caracteres conflictivos para el archivo .apk)
APK_BASENAME=$(echo "$APP_NAME" | iconv -t ascii//TRANSLIT 2>/dev/null | tr -cd '[:alnum:]_-' || echo "$APP_NAME" | tr -cd '[:alnum:]_-')
[ -z "$APK_BASENAME" ] && APK_BASENAME="App"

# Detectar o configurar APP_ID (formato com.alebupal.nombre)
if [ -z "$APP_ID" ]; then
    CLEAN_ID=$(echo "$APK_BASENAME" | tr '[:upper:]' '[:lower:]' | tr -cd '[:alnum:]')
    [ -z "$CLEAN_ID" ] && CLEAN_ID="webapp"
    APP_ID="com.alebupal.$CLEAN_ID"
fi

APP_VERSION="${APP_VERSION:-1.0.0}"

echo "[*] Configuración de la aplicación:"
echo "    - Nombre:    $APP_NAME"
echo "    - Package:   $APP_ID"
echo "    - Versión:   $APP_VERSION"
echo "    - Archivo:   ${APK_BASENAME}.apk"

echo "[*] Limpiando espacio de trabajo temporal..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR/www"

echo "[*] Copiando recursos web..."
cp -r "$SRC_DIR"/* "$BUILD_DIR/www/"

cd "$BUILD_DIR"

echo "[*] Generando manifiesto y configuración de Capacitor..."
cat << EOF > package.json
{
  "name": "${APK_BASENAME,,}-app",
  "version": "${APP_VERSION}",
  "private": true,
  "dependencies": {
    "@capacitor/core": "^6.0.0",
    "@capacitor/android": "^6.0.0"
  },
  "devDependencies": {
    "@capacitor/cli": "^6.0.0"
  }
}
EOF

# 1. Optimizar viewport y estilos nativos en index.html
if [ -f "$BUILD_DIR/www/index.html" ]; then
    echo "[*] Optimizando HTML para experiencia nativa Android..."
    # Viewport con safe-area y sin zoom accidental
    sed -i 's/<meta name="viewport"[^>]*>/<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">/g' "$BUILD_DIR/www/index.html"

    # Inyectar estilos nativos (sin rebote elástico, soporte notch/safe-area, sin destello de toque)
    cat << 'STYLES' > /tmp/native_tune.css
<style id="android-native-tune">
  html, body {
    overscroll-behavior-y: none;
    -webkit-tap-highlight-color: transparent;
  }
  body {
    padding-top: env(safe-area-inset-top, 0px);
    padding-bottom: env(safe-area-inset-bottom, 0px);
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }
  button, a, input, select {
    touch-action: manipulation;
  }
</style>
STYLES
    sed -i '/<\/head>/e cat /tmp/native_tune.css' "$BUILD_DIR/www/index.html"
    rm -f /tmp/native_tune.css
fi

cat << EOF > capacitor.config.json
{
  "appId": "${APP_ID}",
  "appName": "${APP_NAME}",
  "webDir": "www",
  "backgroundColor": "#0b0f19",
  "server": {
    "androidScheme": "https"
  },
  "android": {
    "allowMixedContent": true,
    "captureInput": true,
    "webContentsDebuggingEnabled": false
  }
}
EOF

echo "[*] Instalando dependencias de Capacitor..."
npm install --silent

echo "[*] Creando proyecto nativo Android..."
npx cap add android

# Personalización nativa de la barra de estado y navegación en styles.xml
if [ -f "android/app/src/main/res/values/styles.xml" ]; then
    sed -i 's/<\/style>/    <item name="android:statusBarColor">#0b0f19<\/item>\n        <item name="android:navigationBarColor">#0b0f19<\/item>\n        <item name="android:windowLightStatusBar">false<\/item>\n    <\/style>/g' android/app/src/main/res/values/styles.xml 2>/dev/null || true
fi

# Ajustar teclado suave para que no deforme la pantalla
if [ -f "android/app/src/main/AndroidManifest.xml" ]; then
    sed -i 's/android:windowSoftInputMode="[^"]*"/android:windowSoftInputMode="adjustResize"/g' android/app/src/main/AndroidManifest.xml 2>/dev/null || true
fi

# Si el usuario incluyó icon.png o favicon.png, copiarlo a los mipmaps
ICON_SRC=""
if [ -f "$BUILD_DIR/www/icon.png" ]; then
    ICON_SRC="$BUILD_DIR/www/icon.png"
elif [ -f "$BUILD_DIR/www/favicon.png" ]; then
    ICON_SRC="$BUILD_DIR/www/favicon.png"
fi

if [ -n "$ICON_SRC" ]; then
    echo "[*] Icono personalizado detectado, aplicando a recursos de Android..."
    for mipmap_dir in android/app/src/main/res/mipmap-*; do
        if [ -d "$mipmap_dir" ]; then
            # En mipmap-anydpi-v26 van los XMLs adaptativos; omitir para evitar colisión de nombres
            if [[ "$mipmap_dir" == *"anydpi"* ]]; then
                continue
            fi
            cp "$ICON_SRC" "$mipmap_dir/ic_launcher.png" 2>/dev/null || true
            cp "$ICON_SRC" "$mipmap_dir/ic_launcher_round.png" 2>/dev/null || true
            cp "$ICON_SRC" "$mipmap_dir/ic_launcher_foreground.png" 2>/dev/null || true
        fi
    done

    # Ajustar color de fondo del adaptive icon al color oscuro del tema
    if [ -f "android/app/src/main/res/values/colors.xml" ]; then
        sed -i 's/<color name="ic_launcher_background">.*<\/color>/<color name="ic_launcher_background">#0b0f19<\/color>/g' android/app/src/main/res/values/colors.xml 2>/dev/null || true
    fi
fi

echo "[*] Compilando APK con Gradle..."
cd android
chmod +x gradlew
./gradlew assembleDebug --no-daemon

APK_GENERADO="app/build/outputs/apk/debug/app-debug.apk"

if [ -f "$APK_GENERADO" ]; then
    mkdir -p "$OUT_DIR"
    FINAL_NAME="${APK_BASENAME}.apk"
    cp "$APK_GENERADO" "$OUT_DIR/$FINAL_NAME"
    chmod 666 "$OUT_DIR/$FINAL_NAME" 2>/dev/null || true

    TAMANO=$(du -h "$OUT_DIR/$FINAL_NAME" | cut -f1)

    echo ""
    echo "=========================================================="
    echo "         ¡APK GENERADO CON ÉXITO!                         "
    echo "=========================================================="
    echo " Archivo final: $OUT_DIR/$FINAL_NAME"
    echo " Tamaño:        $TAMANO"
    echo " Nombre App:    $APP_NAME"
    echo " ID Paquete:    $APP_ID"
    echo " Modo:          100% Offline (Standalone)"
    echo "=========================================================="
    echo ""
else
    echo "[-] ERROR: La compilación de Gradle finalizó sin generar el archivo APK."
    exit 1
fi
