#!/usr/bin/env bash
# Builds the frontend and syncs hooks/migrations/push-service into ha-addon/calendhd/
# so it can be committed and pushed for HA to install via the GitHub repo.
#
# Usage:
#   ./build-for-ha.sh
#
# Then:
#   git add repository.yaml ha-addon/
#   git commit -m "release: calendhd addon X.Y.Z"
#   git push
#
# Don't forget to bump version in ha-addon/calendhd/config.yaml first
# so HA detects an update.

set -euo pipefail

cd "$(dirname "$0")"

ROOT="$PWD"
ADDON="$ROOT/ha-addon/calendhd"

echo "=========================================="
echo "calenDHD Addon Build"
echo "=========================================="

if [ ! -d node_modules ]; then
  echo "Installing dependencies..."
  npm install
fi

echo "Building frontend..."
npm run build

echo "Syncing frontend into addon rootfs..."
rm -rf "$ADDON/rootfs/opt/calendhd/public"
mkdir -p "$ADDON/rootfs/opt/calendhd/public"
cp -r build/. "$ADDON/rootfs/opt/calendhd/public/"

echo "Syncing PocketBase hooks..."
rm -rf "$ADDON/pb_hooks"
mkdir -p "$ADDON/pb_hooks"
cp -r pocketbase/pb_hooks/. "$ADDON/pb_hooks/"

echo "Syncing PocketBase migrations..."
rm -rf "$ADDON/pb_migrations"
mkdir -p "$ADDON/pb_migrations"
cp -r pocketbase/pb_migrations/. "$ADDON/pb_migrations/"

echo "Syncing push-service..."
rm -rf "$ADDON/push-service"
mkdir -p "$ADDON/push-service"
cp push-service/package.json "$ADDON/push-service/"
[ -f push-service/package-lock.json ] && cp push-service/package-lock.json "$ADDON/push-service/"
cp push-service/index.js "$ADDON/push-service/"
[ -f push-service/generate-vapid.js ] && cp push-service/generate-vapid.js "$ADDON/push-service/"

VERSION=$(grep '^version:' "$ADDON/config.yaml" | head -1 | sed 's/.*"\(.*\)".*/\1/')

echo
echo "=========================================="
echo "Build complete (addon version: $VERSION)"
echo "=========================================="
echo
echo "Next steps:"
echo "  1. git status                  # review changes under ha-addon/"
echo "  2. git add repository.yaml ha-addon/"
echo "  3. git commit -m 'release: calendhd addon $VERSION'"
echo "  4. git push"
echo
echo "Then on HA Green: Settings -> Add-ons -> calenDHD -> Update."
