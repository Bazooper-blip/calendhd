# Build arguments
ARG BUILD_FROM=ghcr.io/hassio-addons/base:16.3.2
FROM ${BUILD_FROM}

# PocketBase version
ARG PB_VERSION=0.36.1

# Set shell
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# Install dependencies
RUN apk add --no-cache \
    ca-certificates \
    unzip \
    wget \
    nodejs \
    npm

# Detect architecture and download PocketBase
RUN ARCH="$(uname -m)" && \
    case "${ARCH}" in \
        x86_64) PB_ARCH="amd64" ;; \
        aarch64) PB_ARCH="arm64" ;; \
        armv7l) PB_ARCH="armv7" ;; \
        *) echo "Unsupported architecture: ${ARCH}" && exit 1 ;; \
    esac && \
    wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -O /tmp/pb.zip && \
    unzip /tmp/pb.zip -d /opt/pocketbase/ && \
    rm /tmp/pb.zip && \
    chmod +x /opt/pocketbase/pocketbase

# Copy calenDHD frontend (pre-built)
COPY rootfs /

# Copy PocketBase schema for import
COPY pb_schema_import.json /opt/pocketbase/pb_schema_import.json

# Copy PocketBase hooks and migrations
COPY pb_hooks/ /opt/pocketbase/pb_hooks/
COPY pb_migrations/ /opt/pocketbase/pb_migrations/

# Copy and install push-service
COPY push-service/ /opt/push-service/
RUN cd /opt/push-service && npm ci --production

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
