# Build arguments
ARG BUILD_FROM=ghcr.io/hassio-addons/base:21.0.0
FROM ${BUILD_FROM}

# PocketBase version
ARG PB_VERSION=0.39.7

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install runtime dependencies (nodejs runs the push-service; the base
# image already ships curl, which bashio depends on)
RUN apk add --no-cache \
    ca-certificates \
    nodejs

# Detect architecture and download PocketBase; unzip is only needed here,
# so it is removed again in the same layer
RUN apk add --no-cache --virtual .pb-fetch unzip && \
    ARCH="$(uname -m)" && \
    case "${ARCH}" in \
        x86_64) PB_ARCH="amd64" ;; \
        aarch64) PB_ARCH="arm64" ;; \
        armv7l) PB_ARCH="armv7" ;; \
        *) echo "Unsupported architecture: ${ARCH}" && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -o /tmp/pb.zip && \
    unzip /tmp/pb.zip -d /opt/pocketbase/ && \
    rm /tmp/pb.zip && \
    chmod +x /opt/pocketbase/pocketbase && \
    apk del .pb-fetch

# Copy calenDHD frontend (pre-built) and s6 service scripts
COPY rootfs /

# Ensure s6-overlay scripts are executable (exec bits can be lost via Windows/Samba/Git on non-Linux)
RUN chmod +x \
    /etc/cont-init.d/calendhd-init.sh \
    /etc/services.d/pocketbase/run \
    /etc/services.d/pocketbase/finish \
    /etc/services.d/push-service/run \
    /etc/services.d/push-service/finish \
    /run.sh

# Copy PocketBase hooks and migrations
COPY pb_hooks/ /opt/pocketbase/pb_hooks/
COPY pb_migrations/ /opt/pocketbase/pb_migrations/

# Copy and install push-service; npm is only needed for the install,
# so it is removed again in the same layer (node itself stays)
COPY push-service/ /opt/push-service/
RUN apk add --no-cache --virtual .npm-install npm && \
    cd /opt/push-service && \
    npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force && \
    apk del .npm-install

# Labels
LABEL \
    io.hass.name="calenDHD" \
    io.hass.description="A calm, ADHD-friendly calendar PWA" \
    io.hass.arch="aarch64|amd64|armv7" \
    io.hass.type="addon" \
    io.hass.version="${BUILD_VERSION}"

# Set working directory
WORKDIR /opt/pocketbase

# s6-overlay handles service startup via /etc/services.d/pocketbase/run
