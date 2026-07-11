# calenDHD × TRMNL

A view-only e-ink dashboard for [calenDHD](../README.md) on [TRMNL](https://usetrmnl.com) devices — including the 10.3″ **TRMNL X**. The device only *renders*; PocketBase remains the single source of truth. Nothing is writable from the display.

```
┌────────────────────────────┬──────────────────────┐
│ NOW · 34 min left          │ Tomorrow · Jul 12    │
│ 🦷 Dentist                 │ 09:00 Routine step   │
│ 09:00 – 09:45              │ 18:00 Dinner @ Gma   │
│                            │ Sunday · Jul 13      │
│ ✓ 2 of 6 done today        │ 10:00 Football       │
│ ○ 07:00 Morning walk       │ Monday · Jul 14      │
│ ✓ 08:00 Breakfast          │ —                    │
│ ● Midsummer (all day)      │                      │
├────────────────────────────┴──────────────────────┤
│ ⏻ calenDHD                    Saturday, Jul 11    │
└───────────────────────────────────────────────────┘
```

## How it works

1. `pocketbase/pb_hooks/070_trmnl_feed.pb.js` adds a read-only endpoint to your calenDHD server:
   `GET /api/calendhd/trmnl?days=5` — today + upcoming days as merge-variable-friendly JSON.
2. A TRMNL **private plugin** (this directory) polls that URL on a 15-minute interval and renders the Liquid templates in `src/` server-side, then pushes the bitmap to your device.

All four TRMNL layouts are provided: full, half-horizontal, half-vertical, quadrant. The TRMNL design framework scales them for both the original 800×480 device and the TRMNL X (1872×1404).

## Requirements

- calenDHD ≥ the version that ships hook `070_trmnl_feed.pb.js` (HA addon 1.7.0+).
- A TRMNL device + account (private plugins are available on all plans; the developer add-on is not required to *use* your own plugin via the UI).

### Operating modes — read this if your server and TRMNL share a LAN

Being on the same LAN as the device does **not** by itself keep traffic local. With the standard TRMNL service the device never talks to your server: TRMNL's **cloud** polls your feed URL over the internet and renders the screen, and the device downloads the finished image from the cloud. Pick one of:

1. **TRMNL Cloud (default, simplest).** Your calenDHD instance must be reachable from TRMNL's servers — expose it (or ideally just the `/api/calendhd/trmnl` path) via Cloudflare Tunnel / reverse proxy, and set a feed token (see *Security*). Same-LAN placement is irrelevant in this mode.
2. **Fully local (BYOS).** TRMNL's firmware supports self-hosted servers: run a [BYOS server](https://docs.usetrmnl.com/go/diy/byos) on your LAN and point the device at it (firmware 1.4.6+ has a "Custom Server" option at setup — no reflash). The BYOS server polls the feed at its LAN address — e.g. `http://homeassistant.local:8090/api/calendhd/trmnl` for the HA addon — so nothing is exposed to the internet and no feed token is needed. Recommended server: [larapaper](https://github.com/usetrmnl/larapaper) (Docker, auto-joins LAN devices, supports TRMNL X) — it consumes **trmnlp-compatible recipes**, which is exactly this directory's format, so `src/settings.yml` + the Liquid templates work as a custom recipe. The official [Terminus](https://github.com/usetrmnl/terminus) also works but generates screens via its own HTML templating rather than Liquid recipes, so you'd reuse the feed JSON, not these templates.

## Setup A — TRMNL web UI (no tooling)

1. In TRMNL: **Plugins → Private Plugin → Add New**.
2. Name it `calenDHD`, choose strategy **Polling**.
3. Polling URL: `https://YOUR-CALENDHD-HOST/api/calendhd/trmnl?days=5`
4. If you set a feed token on the server (recommended for public deployments), add a polling header:
   `authorization=Bearer YOUR_TOKEN`
5. Save, then click **Edit Markup** and paste the contents of:
   - `src/full.liquid` into the *full* tab
   - `src/half_horizontal.liquid`, `src/half_vertical.liquid`, `src/quadrant.liquid` into their tabs
6. Save, add the plugin to a playlist, refresh your device.

## Setup B — trmnlp CLI (live preview + push)

[`trmnlp`](https://github.com/usetrmnl/trmnlp) is TRMNL's local dev server for private plugins.

```bash
gem install trmnl_preview        # or use the Docker image
cd trmnl-plugin

# live-preview against your real instance:
CALENDHD_URL=http://192.168.1.50:8090 trmnlp serve
# → http://127.0.0.1:4567 shows all four layouts with live data

# publish to your TRMNL account:
trmnlp login
trmnlp push
```

`CALENDHD_TRMNL_TOKEN` is also read from the environment if your feed requires a token (see `.trmnlp.yml`).

## The feed endpoint

`GET /api/calendhd/trmnl?days=5[&token=...]`

| Param | Default | Notes |
|-------|---------|-------|
| `days` | 5 | Window size including today, clamped to 1–14 |
| `token` | — | Alternative to the `Authorization: Bearer` header |

Response (abridged):

```json
{
  "today": "2026-07-11",
  "today_label": "Saturday, Jul 11",
  "now_label": "09:41",
  "time_format": "24h",
  "locale": "en",
  "day_progress": 23,
  "tasks_total_today": 6,
  "tasks_done_today": 2,
  "current_event": { "title": "Dentist", "icon": "🦷", "time_range": "09:00 – 09:45", "minutes_left": 4, "left_label": "4 min", "...": "..." },
  "next_event":    { "title": "Groceries", "in_label": "49 min", "day_label": "Today", "...": "..." },
  "days": [
    {
      "date": "2026-07-11", "label": "Today", "weekday": "Saturday",
      "date_label": "Jul 11", "is_today": true,
      "all_day": [ { "title": "Midsummer", "...": "..." } ],
      "events": [
        {
          "title": "Dentist", "icon": "🦷",
          "time": "09:00", "end_time": "09:45", "time_range": "09:00 – 09:45",
          "is_all_day": false, "is_task": false, "done": false,
          "category": "Health", "color": "#7C9885",
          "is_external": false, "source": "", "routine": "",
          "energy": "low", "first_step": "", "location": ""
        }
      ],
      "event_count": 5, "more_count": 0
    }
  ]
}
```

Semantics deliberately mirror the app: events are bucketed by the local day of their stored start time, `current_event`/`next_event` follow the `/now` screen's rules (timed events only), `day_progress` is the waking-hours (06–22) percentage, and time strings honor the household's 12 h/24 h and English/Swedish settings. Wall-clock times are computed in the **server's timezone** — the same assumption the routine generator and iCal sync already make. On the HA addon this is automatic (the Supervisor passes Home Assistant's configured timezone into the container as `TZ`); on Docker, set `TZ` on the `pocketbase` service if your host isn't already on the household timezone.

Events are capped at 10 per day (`more_count` reports the overflow) to keep the polled payload small.

## Security

The feed is read-only, but it does expose your calendar. Options, matching calenDHD's perimeter-trust model:

- **Perimeter-protected instance (default):** if the whole instance is already LAN-only or behind auth, the feed inherits that. No token needed — but remember TRMNL Cloud can't poll a LAN-only host, so LAN-only means BYOS (mode 2 above).
- **Public or selectively exposed instance:** set the `TRMNL_FEED_TOKEN` environment variable for PocketBase and configure the same token in the plugin. Requests without `Authorization: Bearer <token>` (or `?token=`) get a 401.
  - **HA addon:** set the *TRMNL feed token* option in the addon configuration.
  - **Docker:** set `TRMNL_FEED_TOKEN` in the `pocketbase` service environment.
  - If you front calenDHD with Cloudflare Access or similar, add a bypass rule for exactly `/api/calendhd/trmnl` and rely on the token there. **Do not** bypass any other path — `/api/calendhd/bootstrap` hands out the app credentials by design.

## Known limitations

- Local events with a `recurrence_rule` appear only on their stored start date — identical to the web app today (external iCal recurrences *are* expanded, at sync time).
- Multi-day timed events are listed on their start day only (same as the app's day bucketing).
- The dashboard refreshes on TRMNL's polling schedule (15 min minimum), so "NOW · x min left" is approximate by nature of e-ink dashboards.
