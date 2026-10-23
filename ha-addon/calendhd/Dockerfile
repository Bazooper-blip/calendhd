# Built from the REPO ROOT, not this directory:
#   docker build -f ha-addon/calendhd/Dockerfile .
# CI (.github/workflows/addon.yml) publishes the result to GHCR and HA pulls it
# via `image:` in config.yaml, so nothing generated is committed to the repo.

# Frontend: platform-independent static output, so build it on the runner's
# native platform regardless of the target arch
FROM --platform=$BUILDPLATFORM node:26-alpine AS frontend
WORKDIR /src
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM ghcr.io/hassio-addons/base:21.0.9

# PocketBase version (CI's integration job reads this line)
ARG PB_VERSION=0.40.5

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
        *) echo "Unsupported architecture: ${ARCH}" && exit 1 ;; \
    esac && \
    curl -fsSL "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -o /tmp/pb.zip && \
    unzip /tmp/pb.zip -d /opt/pocketbase/ && \
    rm /tmp/pb.zip && \
    chmod +x /opt/pocketbase/pocketbase && \
    apk del .pb-fetch

# s6 service scripts and init
COPY ha-addon/calendhd/rootfs /

# Ensure s6-overlay scripts are executable (exec bits can be lost via Windows/Samba/Git on non-Linux)
RUN chmod +x \
    /etc/cont-init.d/calendhd-init.sh \
    /etc/services.d/pocketbase/run \
    /etc/services.d/pocketbase/finish \
    /etc/services.d/push-service/run \
    /etc/services.d/push-service/finish \
    /run.sh

# calenDHD frontend
COPY --from=frontend /src/build/ /opt/calendhd/public/

# PocketBase hooks and migrations
COPY pocketbase/pb_hooks/ /opt/pocketbase/pb_hooks/
COPY pocketbase/pb_migrations/ /opt/pocketbase/pb_migrations/

# Copy and install push-service; npm is only needed for the install,
# so it is removed again in the same layer (node itself stays)
COPY push-service/package.json push-service/package-lock.json push-service/index.js push-service/generate-vapid.js /opt/push-service/
RUN apk add --no-cache --virtual .npm-install npm && \
    cd /opt/push-service && \
    npm ci --omit=dev --no-audit --no-fund && \
    npm cache clean --force && \
    apk del .npm-install

# Labels (io.hass.arch / io.hass.version are added by the CI builder)
LABEL \
    io.hass.name="calenDHD" \
    io.hass.description="A calm, ADHD-friendly calendar PWA" \
    io.hass.type="addon" \
    org.opencontainers.image.title="calenDHD" \
    org.opencontainers.image.description="A calm, ADHD-friendly calendar PWA for Home Assistant" \
    org.opencontainers.image.source="https://github.com/Bazooper-blip/calendhd" \
    org.opencontainers.image.licenses="MIT"

# Set working directory
WORKDIR /opt/pocketbase

# s6-overlay handles service startup via /etc/services.d/pocketbase/run
