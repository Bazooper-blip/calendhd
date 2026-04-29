#!/usr/bin/with-contenv bashio
# ==============================================================================
# calenDHD Add-on initialization
# Runs BEFORE services start — sets up env vars, directories, and files
# ==============================================================================

# Export VAPID configuration for push-service (via s6 container environment)
VAPID_PUBLIC_KEY=$(bashio::config 'vapid_public_key')
VAPID_PRIVATE_KEY=$(bashio::config 'vapid_private_key')
VAPID_EMAIL=$(bashio::config 'vapid_email')

mkdir -p /var/run/s6/container_environment
echo -n "${VAPID_PUBLIC_KEY}" > /var/run/s6/container_environment/VAPID_PUBLIC_KEY
echo -n "${VAPID_PRIVATE_KEY}" > /var/run/s6/container_environment/VAPID_PRIVATE_KEY
echo -n "${VAPID_EMAIL}" > /var/run/s6/container_environment/VAPID_EMAIL
echo -n "http://localhost:3001" > /var/run/s6/container_environment/PUSH_SERVICE_URL

# Create data directories
mkdir -p /config/calendhd/pb_data
mkdir -p /config/calendhd/pb_public

# Generate a per-deployment random password for the singleton account.
# This replaces the hardcoded password from earlier versions; the singleton-init
# hook (005_singleton_init.pb.js) rotates the stored user to match on bootstrap.
if [ ! -f /config/calendhd/.singleton-password ]; then
    bashio::log.info "Generating singleton account password..."
    if command -v openssl >/dev/null 2>&1; then
        openssl rand -hex 32 > /config/calendhd/.singleton-password
    else
        head -c 32 /dev/urandom | od -A n -t x1 | tr -d ' \n' > /config/calendhd/.singleton-password
    fi
    chmod 600 /config/calendhd/.singleton-password
fi
SINGLETON_PASSWORD=$(cat /config/calendhd/.singleton-password)
echo -n "${SINGLETON_PASSWORD}" > /var/run/s6/container_environment/SINGLETON_PASSWORD

# Copy frontend from the image to the config volume on every start so HA
# add-on "Update" actually delivers a new bundle. Previously this was a
# first-run-only copy, which left existing deployments stuck on the original
# frontend. We rsync-style overwrite; if you hot-swap a custom build into
# /config/calendhd/pb_public/ it will be replaced on next addon start.
bashio::log.info "Syncing calenDHD frontend to /config/calendhd/pb_public/..."
rm -rf /config/calendhd/pb_public/*
cp -r /opt/calendhd/public/. /config/calendhd/pb_public/ 2>/dev/null || true

# Copy schema file for manual import if not present
if [ ! -f /config/calendhd/pb_schema_import.json ]; then
    cp /opt/pocketbase/pb_schema_import.json /config/calendhd/ 2>/dev/null || true
fi

# Copy hooks and migrations to config directory (always update from image)
mkdir -p /config/calendhd/pb_hooks
mkdir -p /config/calendhd/pb_migrations
cp -r /opt/pocketbase/pb_hooks/* /config/calendhd/pb_hooks/ 2>/dev/null || true
cp -r /opt/pocketbase/pb_migrations/* /config/calendhd/pb_migrations/ 2>/dev/null || true

# Check if this is first run (no data.db yet)
if [ ! -f /config/calendhd/pb_data/data.db ]; then
    bashio::log.warning "=================================================="
    bashio::log.warning "FIRST RUN SETUP REQUIRED"
    bashio::log.warning "=================================================="
    bashio::log.warning "1. Go to: http://homeassistant.local:8090/_/ (or via HA sidebar)"
    bashio::log.warning "2. Create your admin account"
    bashio::log.warning "3. Go to Settings > Import collections"
    bashio::log.warning "4. Import /config/calendhd/pb_schema_import.json"
    bashio::log.warning "=================================================="
fi

bashio::log.info "calenDHD initialization complete"
