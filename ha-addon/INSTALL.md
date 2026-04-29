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
4. Settings → Import collections → load `/config/calendhd/pb_schema_import.json` → Review → Confirm.

### Step 5: Use the Calendar

1. Open `http://<ha-host>:8090/`
2. The app auto-logs in as a built-in `home@calendhd.local` account — no sign-up flow. Anyone with access to the URL has access to the calendar, so gate it (LAN only, Cloudflare Access, etc.) for non-public deployments.
3. Start adding events!

### Step 6 (recommended): HTTPS / Remote Access

The addon serves plain HTTP. PWA install requires HTTPS, and you'll typically want remote access. Front the addon with one of:
- **Cloudflare Tunnel** — install the cloudflared HA add-on, route `calendhd.example.com` → `http://<ha-host>:8090`. Add Cloudflare Access on the same hostname to whitelist family emails.
- **NGINX SSL Proxy** addon + Let's Encrypt — for self-hosted TLS without Cloudflare.

---

## Method 2: Local Installation (Manual)

Use this method if you want to modify the add-on or test locally.

### Step 1: Access Home Assistant Files

**Option A: Using Samba Share**
1. Install the "Samba share" add-on from the Add-on Store
2. Configure and start it
3. Access `\\homeassistant.local\addons\` from your computer

**Option B: Using SSH**
1. Install the "Terminal & SSH" add-on
2. SSH into Home Assistant: `ssh root@homeassistant.local`

### Step 2: Copy Add-on Files

Copy the entire `calendhd` folder to `/addons/`:

```
/addons/
└── calendhd/
    ├── config.yaml
    ├── Dockerfile
    ├── build.yaml
    ├── CHANGELOG.md
    ├── DOCS.md
    ├── pb_migrations/
    ├── rootfs/
    └── translations/
```

### Step 3: Build the Frontend (Required)

The Dockerfile does **not** build the frontend during the image build — its Docker context is limited to `ha-addon/calendhd/`, so it can't reach the SvelteKit source. You must produce a build on your dev machine and stage it inside the addon directory before installing:

```bash
# On your development machine, in the repo root
./build-for-ha.sh
```

That script runs `npm install`/`npm run build`, then syncs the build output, hooks, migrations, and push-service into `ha-addon/calendhd/`. If you skip this step, the addon will start but the calendar UI won't load (only the placeholder `index.html`).

### Step 4: Install the Add-on

1. Go to **Settings** → **Add-ons** → **Add-on Store**
2. Click **⋮** → **Check for updates**
3. Look for "calenDHD" under "Local add-ons"
4. Install and start

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

### Manual Update

1. Download new version
2. Replace files in `/addons/calendhd/`
3. Restart the add-on

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
