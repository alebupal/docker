# 📱 Generador Universal de APKs para Aplicaciones Web (Docker)

Herramienta genérica y aislada basada en Docker para convertir **cualquier proyecto web HTML/CSS/JS** en una aplicación nativa instalable de Android (`.apk`), sin necesidad de instalar Android Studio, Java ni SDKs en tu servidor o PC.

Funciona de forma **100% offline (standalone)** empaquetando todo el código frontend dentro del APK nativo mediante Capacitor y Gradle.

---

## 📁 Estructura del proyecto

```text
docker/apk-builder/
├── Dockerfile           # Imagen con OpenJDK 17, Node.js 20, Android SDK Tools y dependencias
├── docker-compose.yml   # Orquestador con soporte de variables y volumen de caché Gradle
├── entrypoint.sh        # Generador de estructura Capacitor, integración de icono y Gradle
├── generar-apk.sh       # Script principal (interactivo o por línea de comandos)
├── README.md            # Documentación y ejemplos
└── output/              # Directorio donde se guardan los archivos .apk compilados
```

---

## 🚀 Modos de Uso

Entra en la carpeta del proyecto:
```bash
cd apk-builder
```

### 1. Modo Interactivo (Asistente paso a paso)
Simplemente ejecuta:
```bash
./generar-apk.sh
```
El script te preguntará:
1. **Ruta del proyecto web:** Puedes pegar cualquier ruta a tu proyecto HTML/CSS/JS.
2. **Nombre de la App:** Detecta automáticamente el `<title>` de tu `index.html` o puedes escribir el que quieras.
3. **Package ID:** Genera uno válido como `com.alebupal.nombre` o puedes personalizarlo.

---

### 2. Modo Directo por Línea de Comandos
Puedes pasar los parámetros directamente:

```bash
# Sintaxis:
./generar-apk.sh <ruta_al_proyecto_web> [nombre_app] [package_id]

# Ejemplo 1: Compilar un proyecto web indicando solo su ruta
./generar-apk.sh /ruta/a/mi-proyecto-web

# Ejemplo 2: Especificando nombre personalizado
./generar-apk.sh /ruta/a/mi-proyecto-web "Mi App"

# Ejemplo 3: Especificando nombre y Package ID
./generar-apk.sh /ruta/a/mi-otra-web "Mi Nueva App" "com.alebupal.minuevaapp"
```

---

## 🎨 Icono personalizado de la App (Opcional)

Si dentro de la carpeta web que compilas existe un archivo `icon.png` o `favicon.png`, el compilador lo detectará y lo aplicará automáticamente como el icono de launcher de Android para tu aplicación.

---

## 📥 Obtener el APK generado

Todos los APKs se guardan en:
```text
docker/apk-builder/output/<NombreDeLaApp>.apk
```

Para instalarlo en tu móvil:
1. Envía el `.apk` a tu teléfono (vía PairDrop, FileBrowser, Telegram o cable).
2. Toca el archivo en Android y pulsa **Instalar**.
3. ¡Listo! La app se ejecutará de forma independiente, a pantalla completa y sin depender de conexión a internet.
