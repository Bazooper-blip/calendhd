#!/bin/bash
# Local build script for calenDHD Home Assistant Add-on
# Run this on your development machine to build and test locally

set -e

ADDON_DIR="calendhd"
ARCH="${1:-aarch64}"  # Default to aarch64 for HA Green

echo "=========================================="
echo "calenDHD Add-on Local Build"
echo "Architecture: ${ARCH}"
echo "=========================================="

# Check if we're in the right directory
if [ ! -d "$ADDON_DIR" ]; then
    echo "Error: Run this script from the ha-addon directory"
    exit 1
fi

# Build the frontend first (if source is available)
if [ -d "../src" ]; then
    echo "Building calenDHD frontend..."
    cd ..
    npm install
    npm run build

    # Copy built files to add-on
    mkdir -p ha-addon/calendhd/rootfs/opt/calendhd/public
    cp -r build/* ha-addon/calendhd/rootfs/opt/calendhd/public/
    cd ha-addon
    echo "Frontend built and copied."
else
    echo "Note: Frontend source not found, using pre-built files if available."
fi

# Build the Docker image
echo "Building Docker image for ${ARCH}..."
cd "$ADDON_DIR"

docker build \
    --build-arg BUILD_FROM="ghcr.io/hassio-addons/base:16.3.2" \
    --build-arg PB_VERSION="0.25.0" \
    --platform "linux/${ARCH}" \
    -t "local/calendhd:${ARCH}" \
    .

echo "=========================================="
echo "Build complete!"
echo ""
echo "To test locally:"
echo "  docker run -p 8090:8090 -v calendhd_data:/config local/calendhd:${ARCH}"
echo ""
echo "To deploy to Home Assistant:"
echo "  1. Copy ha-addon folder to your HA /addons/ directory"
echo "  2. Go to Settings → Add-ons → Add-on Store"
echo "  3. Click ⋮ → Check for updates"
echo "  4. Install calenDHD from Local add-ons"
echo "=========================================="
