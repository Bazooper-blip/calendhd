# calenDHD Documentation

A calm, ADHD-friendly calendar Progressive Web App (PWA) for Home Assistant.

## Features

### Calendar Views
- **Day View**: Detailed hourly view of a single day
- **Week View**: 7-day overview with time blocks
- **Month View**: Traditional monthly calendar grid

### Events
- Create events with title, description, date/time
- Set event duration or mark as all-day
- Assign categories for color coding
- Add recurring patterns (daily, weekly, monthly, yearly)
- Set reminders (notifications)

### Templates
- Save event presets for quick creation
- Define default duration, category, and reminders
- Perfect for recurring activities like medications, appointments

### Categories
- Organize events by type
- Custom colors for visual organization

### Households
- Share calendars with family and friends
- Control visibility with private events

### External Calendars
- Subscribe to iCal/ICS feeds
- Import from Google Calendar, Outlook, Apple Calendar, Proton Calendar
- Automatic refresh at configurable intervals
- Supports recurring events

### Accessibility
- Calm, soft color palette (no harsh contrasts)
- Reduce animations option
- High contrast mode
- No guilt messaging for overdue items
- Multi-language support (English, Swedish)

## Configuration

### First Run Setup (Required)

On first run, you need to set up the database:

1. Start the add-on
2. Go to Admin UI: `http://homeassistant.local:8090/_/`
3. Create your admin email and password
4. Go to **Settings** → **Import collections**
5. Click **Load from JSON file** and select `/config/calendhd/pb_schema_import.json`
   - Or access via Samba: `\\homeassistant\config\calendhd\pb_schema_import.json`
6. Click **Review** → **Confirm and import**
7. Access the calendar at `http://homeassistant.local:8090/`

### Copy Frontend Files (Required)

The add-on provides PocketBase but you need to copy the calenDHD frontend separately:

1. Build the frontend on your dev machine: `npm run build`
2. Copy the `build/` folder contents to `\\homeassistant\config\calendhd\pb_public\`
3. Restart the add-on

### Apple Sign-in (Optional)

To enable Apple Sign-in:

1. Create an App ID in Apple Developer Console
2. Create a Services ID for web authentication
3. Generate a private key
4. In PocketBase Admin → Settings → Auth providers → Apple:
   - Enable Apple provider
   - Enter Client ID (Services ID)
   - Enter Team ID
   - Enter Key ID
   - Paste the private key

### Push Notifications (Optional)

calenDHD supports Web Push notifications for event reminders via VAPID. To enable:

1. Generate VAPID keys on any machine with Node.js installed:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Copy the public and private keys
3. In Home Assistant, go to **Settings** > **Add-ons** > **calenDHD** > **Configuration**
4. Paste the keys into:
   - **VAPID Public Key**: the public key from step 2
   - **VAPID Private Key**: the private key from step 2
   - **VAPID Email**: your contact email (e.g. `mailto:you@example.com`)
5. Restart the add-on
6. In calenDHD, go to **Settings** and enable push notifications — your browser will ask for permission

### SMTP Configuration (Optional)

For email reminders and password reset:

1. In PocketBase Admin → Settings → Mail settings
2. Configure your SMTP server:
   - Host: `smtp.gmail.com` (or your provider)
   - Port: `587`
   - Username: Your email
   - Password: App password (not your regular password)

## Data Storage

All data is stored in `/config/calendhd/`:

```
/config/calendhd/
├── pb_data/              # PocketBase database and storage
│   ├── data.db           # SQLite database
│   └── storage/          # Uploaded files
├── pb_public/            # Frontend files (copy your build here)
└── pb_schema_import.json # Schema file for initial import
```

## Backup

### Automatic Backups

Your calenDHD data is included in Home Assistant's automatic backups since it's stored in `/config/`.

### Manual Backup

1. Go to PocketBase Admin → Settings → Backups
2. Click "Create backup"
3. Download the ZIP file

### Restore

1. Stop the add-on
2. Replace `/config/calendhd/pb_data/` with your backup
3. Start the add-on

## Network Access

### Local Access
- Calendar: `http://homeassistant.local:8090/`
- Admin: `http://homeassistant.local:8090/_/`

### Remote Access (via Home Assistant)

If you have Home Assistant remote access configured (Nabu Casa or reverse proxy), calenDHD is accessible through the sidebar.

### Install as PWA

On your phone or tablet:
1. Open calenDHD in your browser
2. Tap "Add to Home Screen" (Safari) or "Install" (Chrome)
3. The app works offline!

## Troubleshooting

### Add-on won't start

Check the logs in Home Assistant → Add-ons → calenDHD → Log tab.

Common issues:
- Port 8090 already in use: Change the port in add-on configuration
- Corrupted database: Restore from backup or delete `/config/calendhd/pb_data/data.db`

### Can't access Web UI

1. Ensure the add-on is running (green status)
2. Try accessing directly: `http://<your-ha-ip>:8090/`
3. Check if port 8090 is open in your firewall

### Events not syncing

1. Check your internet connection
2. Look for error messages in the browser console (F12)
3. Try clearing browser cache and reloading

## Support

- [GitHub Issues](https://github.com/Bazooper-blip/calendhd/issues)
- [Home Assistant Community](https://community.home-assistant.io/)
