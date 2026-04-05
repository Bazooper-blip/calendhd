# calenDHD Home Assistant Add-ons

A calm, ADHD-friendly calendar for Home Assistant.

## Add-ons

### calenDHD

A complete calendar PWA with PocketBase backend, designed for neurodivergent users.

Features:
- Day, Week, Month calendar views
- Event templates for quick creation
- Categories with color coding
- Household sharing
- Recurring events
- Push notification reminders
- Offline support
- iCal subscription support (Google Calendar, Outlook, etc.)
- Calm, soft color palette
- Multi-language support (English, Swedish)

## Installation

1. In Home Assistant, go to **Settings** → **Add-ons** → **Add-on Store**
2. Click the **⋮** menu (top right) → **Repositories**
3. Add this repository URL: `https://github.com/USERNAME/calendhd-ha-addon`
4. Click **Add** → **Close**
5. Find "calenDHD" in the add-on store and click **Install**
6. Start the add-on and open the Web UI

> **Note**: Replace `USERNAME` with the actual GitHub username where this repo is hosted.

## First-Time Setup

1. Open the Web UI (or go to `http://homeassistant.local:8090/_/`)
2. Create your admin account
3. The calendar is ready to use at `http://homeassistant.local:8090/`

## Backup

Your calendar data is stored in `/config/calendhd/` and will be included in Home Assistant backups.

## Support

- [GitHub Issues](https://github.com/USERNAME/calendhd-ha-addon/issues)
- [calenDHD Main Repository](https://github.com/USERNAME/calendhd)

## License

MIT
