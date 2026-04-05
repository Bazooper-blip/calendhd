# calenDHD

A calm, ADHD-friendly calendar PWA designed for neurodivergent minds.

## Features

- **Calm Design**: Soft color palette with no harsh contrasts
- **Multiple Views**: Day, Week, and Month calendar views
- **Event Templates**: Quick event creation from saved templates
- **Categories**: Color-coded organization for events
- **Recurrence**: Daily, weekly, monthly, and yearly repeating events
- **Reminders**: Configurable push notification reminders
- **Calendar Subscriptions**: Subscribe to external iCal/ICS feeds (Google Calendar, Outlook, etc.)
- **Offline Support**: Local-first with IndexedDB
- **PWA**: Install on any device, including iOS
- **Multi-language**: English and Swedish support
- **Timezone Support**: Full timezone-aware date handling

## Tech Stack

- **Frontend**: SvelteKit 2 + Svelte 5 (runes), Tailwind CSS 4
- **Local Storage**: Dexie.js (IndexedDB)
- **Backend**: PocketBase
- **Date Handling**: date-fns + date-fns-tz
- **i18n**: svelte-i18n

## Getting Started

### Prerequisites

- Node.js 20+
- PocketBase 0.36+ (for backend)

### Development

1. Clone the repository:
   ```bash
   git clone https://github.com/Bazooper-blip/calendhd.git
   cd calendhd
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

4. Download and start PocketBase:
   ```bash
   # Download from https://pocketbase.io/docs/
   cd pocketbase
   ./pocketbase serve
   ```

5. Run the development server:
   ```bash
   npm run dev
   ```

6. Open http://localhost:5173

### Building for Production

```bash
npm run build
npm run preview
```

### Home Assistant Add-on

See the [ha-addon](./ha-addon) folder for Home Assistant deployment instructions.

### Docker Deployment

```bash
cd docker
docker-compose up -d
```

## Project Structure

```
calendhd/
├── src/
│   ├── routes/           # SvelteKit pages
│   │   ├── calendar/     # Day/week/month views
│   │   ├── event/        # Event creation/editing
│   │   ├── templates/    # Event templates
│   │   ├── categories/   # Category management
│   │   ├── subscriptions/# External calendar feeds
│   │   └── settings/     # User preferences
│   │
│   ├── lib/
│   │   ├── components/   # Svelte components
│   │   ├── stores/       # Svelte 5 rune stores
│   │   ├── db/           # Dexie IndexedDB
│   │   ├── api/          # PocketBase client
│   │   ├── i18n/         # Internationalization
│   │   ├── utils/        # Utilities
│   │   └── types/        # TypeScript types
│   │
│   └── service-worker.ts # PWA service worker
│
├── pocketbase/
│   ├── pb_hooks/         # Server hooks (reminders, cleanup, notifications)
│   └── pb_migrations/    # Database schema
│
├── push-service/         # Web Push notification service
├── static/               # PWA manifest + icons
├── ha-addon/             # Home Assistant Add-on
└── docker/               # Docker configuration
```

## Accessibility Features

- Reduced animations option
- High contrast mode
- Consistent, predictable layout
- No guilt messaging for overdue items
- Keyboard navigation support
- Screen reader friendly

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT
