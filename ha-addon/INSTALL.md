# calenDHD Installation Guide for Home Assistant

This guide walks you through installing calenDHD on your Home Assistant installation.

## Prerequisites

- Home Assistant OS (Green, Yellow, or any HA OS installation)
- Network access to your Home Assistant

## Method 1: Install from GitHub Repository (Recommended)

### Step 1: Add the Repository

1. Open Home Assistant
2. Go to **Settings** → **Add-ons** → **Add-on Store**
3. Click the **⋮** menu (top-right corner)
4. Select **Repositories**
5. Paste the repository URL:
   ```
   https://github.com/Bazooper-blip/calendhd
   ```
6. Click **Add** → **Close**

### Step 2: Install the Add-on

1. Refresh the Add-on Store page
2. Scroll down to find "calenDHD" under the new repository
3. Click on it → **Install**
4. Wait for installation to complete

### Step 3: Start the Add-on

1. Click **Start**
2. The add-on serves on **port 8090** of your HA host. There is no HA sidebar entry — ingress is disabled because the SPA's absolute-path routing conflicts with HA's dynamic ingress prefix.

### Step 4: Create the PocketBase Superuser

1. Open `http://<ha-host>:8090/_/` (e.g. `http://homeassistant.local:8090/_/`)
2. Create the superuser email and password
3. This is the admin password for the **database**, not an account for the calendar app.
4. That's it — the collections are created automatically by the bundled migrations; no manual schema import is needed.

### Step 5: Use the Calendar

1. Open `http://<ha-host>:8090/`
2. The app auto-logs in as a built-in `home@calendhd.local` account — no sign-up flow. Anyone with access to the URL has access to the calendar, so gate it (LAN only, Cloudflare Access, etc.) for non-public deployments.
3. Start adding events!

### Step 6 (recommended): HTTPS / Remote Access

The addon serves plain HTTP. PWA install requires HTTPS, and you'll typically want remote access. Front the addon with one of:
- **Cloudflare Tunnel** — install the cloudflared HA add-on, route `calendhd.example.com` → `http://<ha-host>:8090`. Add Cloudflare Access on the same hostname to whitelist family emails.
- **NGINX SSL Proxy** addon + Let's Encrypt — for self-hosted TLS without Cloudflare.

---

## Method 2: Local Test Build

HA installs a pre-built image from GitHub Container Registry (published by `.github/workflows/addon.yml`), so there is no on-device build step. To test changes before releasing, build the same image locally from the repo root (needs Docker with Buildx):

```bash
ha-addon/build-local.sh            # aarch64 (HA Green); pass amd64 for x86
docker run --rm -p 8090:8090 -v calendhd_data:/config local/calendhd:aarch64
```

The image build runs `npm ci` + `npm run build` itself, so no frontend pre-build or file syncing is needed.

---

## Post-Installation

### Access URLs

| URL | Purpose |
|-----|---------|
| `http://homeassistant.local:8090/` | calenDHD Calendar |
| `http://homeassistant.local:8090/_/` | PocketBase Admin |

### Install as PWA (Phone/Tablet)

1. Open calenDHD on your mobile browser
2. **iOS Safari**: Tap Share → "Add to Home Screen"
3. **Android Chrome**: Tap ⋮ → "Install app"

### Configure SMTP (for Email Reminders)

1. Go to Admin UI: `http://homeassistant.local:8090/_/`
2. Navigate to **Settings** → **Mail settings**
3. Enter your SMTP details

---

## Troubleshooting

### Add-on fails to start

1. Check logs: **Settings** → **Add-ons** → **calenDHD** → **Log**
2. Common issues:
   - Port 8090 in use: Edit config to use different port
   - Out of memory: Restart Home Assistant

### Can't connect to Web UI

1. Verify add-on is running (green indicator)
2. Try IP address directly: `http://192.168.x.x:8090/`
3. Check firewall settings

### Database errors

1. Stop the add-on
2. Delete: `/config/calendhd/pb_data/data.db`
3. Start the add-on (creates fresh database)
4. Note: This deletes all calendar data!

---

## Updating

### From GitHub Repository

1. Go to **Settings** → **Add-ons** → **Add-on Store**
2. Click **⋮** → **Check for updates**
3. If update available, click **Update** on calenDHD

---

## Backup & Restore

### Backup

Your data is automatically included in Home Assistant backups.

Manual backup:
1. Go to `http://homeassistant.local:8090/_/`
2. **Settings** → **Backups** → **Create backup**

### Restore

1. Stop calenDHD add-on
2. Replace `/config/calendhd/pb_data/` with backup
3. Start add-on

---

## Support

- **Issues**: https://github.com/Bazooper-blip/calendhd/issues
- **Discussions**: https://community.home-assistant.io/
