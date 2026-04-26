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

# Copy frontend files to public directory if not present
if [ ! -f /config/calendhd/pb_public/index.html ]; then
    bashio::log.info "Copying calenDHD frontend files..."
    cp -r /opt/calendhd/public/* /config/calendhd/pb_public/ 2>/dev/null || true
fi

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
