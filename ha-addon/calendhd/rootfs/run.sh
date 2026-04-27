#!/usr/bin/with-contenv bashio
# ==============================================================================
# calenDHD Add-on for Home Assistant
# Runs PocketBase with calenDHD frontend
# ==============================================================================

bashio::log.info "Starting calenDHD (PocketBase)..."
bashio::log.info "Web UI available at: http://homeassistant.local:8090"
bashio::log.info "Admin UI available at: http://homeassistant.local:8090/_/"

# Start PocketBase
exec /opt/pocketbase/pocketbase serve \
    --http=0.0.0.0:8090 \
    --dir=/config/calendhd/pb_data \
    --publicDir=/config/calendhd/pb_public \
    --hooksDir=/config/calendhd/pb_hooks \
    --migrationsDir=/config/calendhd/pb_migrations
