# calenDHD Home Assistant Add-ons

A calm, ADHD-friendly calendar for Home Assistant.

## Add-ons

### calenDHD

A complete calendar PWA with PocketBase backend, designed for neurodivergent users.

Each instance is a **single-household calendar** — there's no sign-up, no multi-user auth, no household sharing. The app auto-logs in to a built-in `home@calendhd.local` account, so anyone with access to the URL has access to the calendar. Use Cloudflare Access, a reverse-proxy auth layer, or your LAN to gate it.

Features:
- Day, Week, Month calendar views
- Routines with steps and energy levels
- Event templates for quick creation
- Categories with color coding
- Recurring events (daily, weekly, monthly, yearly)
- Push notification reminders (Web Push / VAPID)
- Offline support (IndexedDB)
- iCal subscription support (Google Calendar, Outlook, etc.)
- Calm, soft color palette
- Multi-language support (English, Swedish)

## Installation

1. In Home Assistant, go to **Settings** → **Add-ons** → **Add-on Store**
2. Click the **⋮** menu (top right) → **Repositories**
3. Add this repository URL: `https://github.com/Bazooper-blip/calendhd`
4. Click **Add** → **Close**
5. Find "calenDHD" in the add-on store and click **Install**
6. Start the add-on. The web UI is on **port 8090** of your HA host (no HA sidebar — ingress is disabled because the SPA's absolute-path routing conflicts with HA's dynamic ingress prefix).

## First-Time Setup

1. Open `http://<ha-host>:8090/_/` (PocketBase admin) and create the **PocketBase superuser** — this is just the admin password for the database, not a user account for the app.
2. Settings → Import collections → load `/config/calendhd/pb_schema_import.json`.
3. Open `http://<ha-host>:8090/` — the calendar loads, auto-logged-in as `home@calendhd.local`. No sign-up step.

## Remote / HTTPS access

The addon serves plain HTTP on port 8090. For PWA install (which requires HTTPS) and remote access, front the addon with one of:
- **Cloudflare Tunnel** — add a tunnel mapping `calendhd.example.com` → `http://<ha-host>:8090`. Pair with **Cloudflare Access** to whitelist family emails.
- **NGINX SSL Proxy** addon + Let's Encrypt for self-hosted TLS.

## Backup

Your calendar data is stored in `/config/calendhd/` and will be included in Home Assistant backups.

## Support

- [GitHub Issues](https://github.com/Bazooper-blip/calendhd/issues)
- [calenDHD Main Repository](https://github.com/Bazooper-blip/calendhd)

## License

MIT
