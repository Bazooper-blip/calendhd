#!/bin/bash
# Local test build of the calenDHD Home Assistant add-on image.
# Same Dockerfile and repo-root context CI uses (.github/workflows/addon.yml),
# so this also builds the frontend inside the image.
#
# Usage: ha-addon/build-local.sh [amd64|aarch64]   (default: aarch64, i.e. HA Green)

set -euo pipefail

ARCH="${1:-aarch64}"
case "$ARCH" in
    amd64) PLATFORM="linux/amd64" ;;
    aarch64) PLATFORM="linux/arm64" ;;
    *) echo "Unsupported architecture: $ARCH (amd64|aarch64)" && exit 1 ;;
esac

cd "$(dirname "$0")/.."

docker buildx build \
    --platform "$PLATFORM" \
    --load \
    -f ha-addon/calendhd/Dockerfile \
    -t "local/calendhd:${ARCH}" \
    .

echo
echo "Built local/calendhd:${ARCH}. To test:"
echo "  docker run --rm -p 8090:8090 -v calendhd_data:/config local/calendhd:${ARCH}"
