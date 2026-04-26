# Changelog

## [1.1.0] - 2026-04-26

### Changed

- Upgraded bundled PocketBase to 0.37.3 (new admin UI, SQLite 3.53.0)
- Disabled HA ingress / sidebar panel — the SPA's absolute-path routing escaped the dynamic ingress token prefix; expose the addon on port 8090 via Cloudflare Tunnel or a reverse proxy instead

### Fixed

- s6 service scripts (`run`, `finish`, `cont-init.d/calendhd-init.sh`, `run.sh`) marked executable; init no longer fails with `Permission denied`
- `PUSH_SERVICE_URL is not defined` ReferenceError in reminder cron and notification-test routes (moved env-var lookup inside callbacks; PocketBase JSVM isolates callback scope)
- Frontend assets are no longer silently gitignored when building the addon

### Added

- Repo-root `repository.yaml` so the GitHub repo is recognised as an HA add-on store directly
- `build-for-ha.sh` script for Linux/macOS builds

## [1.0.0] - 2025-01-26

### Added

- Initial release of calenDHD for Home Assistant
- PocketBase backend with SQLite database
- Day, Week, Month calendar views
- Event creation with templates
- Categories with color coding
- Household sharing
- Recurring events (daily, weekly, monthly, yearly)
- Reminder system
- iCal/ICS subscription support with recurring event expansion
- Offline-first PWA support
- ADHD-friendly calm design
- Accessibility options (reduce animations, high contrast)
- Multi-language support (English, Swedish)
- Timezone support
- Apple Sign-in support (requires configuration)
- Email/password authentication
