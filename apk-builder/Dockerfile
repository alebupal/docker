FROM eclipse-temurin:17-jdk-jammy

# Evitar prompts interactivos
ENV DEBIAN_FRONTEND=noninteractive

# Variables de entorno para Android SDK y Node.js
ENV ANDROID_SDK_VERSION=11076708
ENV ANDROID_HOME=/opt/android-sdk
ENV ANDROID_SDK_ROOT=/opt/android-sdk
ENV PATH=$PATH:$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$ANDROID_HOME/build-tools/34.0.0

# Instalar dependencias base y Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    wget \
    unzip \
    git \
    ca-certificates \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# Instalar Android SDK Command-line Tools
RUN mkdir -p ${ANDROID_HOME}/cmdline-tools /tmp/sdk \
    && wget -q https://dl.google.com/android/repository/commandlinetools-linux-${ANDROID_SDK_VERSION}_latest.zip -O /tmp/sdk/cmdline-tools.zip \
    && unzip -q /tmp/sdk/cmdline-tools.zip -d ${ANDROID_HOME}/cmdline-tools \
    && mv ${ANDROID_HOME}/cmdline-tools/cmdline-tools ${ANDROID_HOME}/cmdline-tools/latest \
    && rm -rf /tmp/sdk

# Aceptar licencias e instalar componentes esenciales de Android (API 34)
RUN yes | sdkmanager --licenses > /dev/null 2>&1 || true \
    && sdkmanager "platform-tools" "platforms;android-34" "build-tools;34.0.0" > /dev/null

WORKDIR /workspace

COPY entrypoint.sh /usr/local/bin/entrypoint.sh
RUN chmod +x /usr/local/bin/entrypoint.sh

ENTRYPOINT ["/bin/bash", "/usr/local/bin/entrypoint.sh"]
