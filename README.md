# Baxley Status Updater

Monitors the Baxley Green Tally ETL pipeline and broadcasts health status to
system-tray clients via MQTT.

```
┌─────────────────────────────────────────────────────────────┐
│  ETL Machine (Windows — already running nightly pipeline)   │
│                                                             │
│  ┌─────────────────────┐   port 1883   ┌─────────────────┐ │
│  │  baxley-status-api  │──────────────▶│   Mosquitto     │ │
│  │  (Node.js service)  │               │  (MQTT broker)  │ │
│  │                     │               │                 │ │
│  │  • reads SQLite DB  │               │  port 9001 (WS) │ │
│  │  • checks folders   │               └────────┬────────┘ │
│  │  • REST /api/status │                        │          │
│  └─────────────────────┘               ─ ─ ─ ─ ┘          │
└─────────────────────────────────────────────────────────────┘
                                          │ WebSocket
              ┌───────────────────────────┼────────────────┐
              ▼                           ▼                 ▼
    ┌──────────────────┐       ┌──────────────────┐      (any
    │  baxley-status   │       │  baxley-status   │    future
    │  -client (PC 1)  │       │  -client (PC 2)  │   MQTT app)
    │  [tray icon green]│      │  [tray icon yel] │
    └──────────────────┘       └──────────────────┘
```

The MQTT topic uses opaque UUID segments — intercepted traffic reveals nothing
about which system, company, or data it belongs to.

---

## Repository layout

```
baxley-status-api/       Node.js service (checker + MQTT publisher + REST API)
baxley-status-client/    Electron + React system-tray app
```

---

## 1 — Install Mosquitto (on the ETL machine)

1. Download the Windows installer from the Mosquitto project site (mosquitto.org)
2. Install, then edit `C:\Program Files\mosquitto\mosquitto.conf`:

```conf
# Plain MQTT — used by the API server (local only)
listener 1883 localhost

# WebSocket — used by tray clients over the network
listener 9001
protocol websockets

# Allow connections without a username for internal use.
# Remove this line and add a password file for production hardening.
allow_anonymous true
```

3. Open Windows Firewall for **inbound TCP port 9001** (clients need this).
   Port 1883 stays local-only.

4. Start the service:
```
net start mosquitto
```
Or via Services → Mosquitto Broker → set Startup type to Automatic.

---

## 2 — Set up baxley-status-api

```bash
cd baxley-status-api
npm install

# Copy the example config and fill in your real paths
copy .env.example .env
notepad .env
```

Key settings in `.env`:

| Variable | Description |
|---|---|
| `DB_PATH` | Absolute path to `baxley_green_tally_data.sqlite3` |
| `CSV_NEW_PATH` | `S:\PBIData\SLI\Baxley Data\New` |
| `CSV_FINISHED_PATH` | `S:\PBIData\SLI\Baxley Data\Finished` |
| `EXCEL_BASE_PATH` | `S:\PBIData\SLI\Baxley Data\base` |
| `EXCEL_TOTAL_PATH` | `S:\PBIData\SLI\Baxley Data\total` |
| `EXCEL_FINAL_PATH` | `S:\PBIData\SLI\Baxley Data\Final` |
| `LOG_PATH` | `S:\PBIData\SLI\Baxley Data\logs` |
| `MQTT_BROKER_HOST` | `localhost` (same machine as Mosquitto) |
| `GREEN_THRESHOLD_HOURS` | `26` — hours before DB is considered stale |
| `CHECK_CRON` | `*/10 * * * *` — check every 10 minutes |
| `API_PORT` | `3847` |

Start it:
```bash
npm start
```

On first run you will see a **share code** in the startup banner — copy it for
configuring client machines.

### Run as a Windows service (NSSM)

```
nssm install BaxleyStatusAPI "C:\Program Files\nodejs\node.exe" "C:\path\to\baxley-status-api\src\index.js"
nssm set BaxleyStatusAPI AppDirectory "C:\path\to\baxley-status-api"
nssm set BaxleyStatusAPI AppEnvironmentExtra "NODE_ENV=production"
nssm start BaxleyStatusAPI
```

---

## 3 — Set up baxley-status-client (per machine)

```bash
cd baxley-status-client
npm install
npm start          # dev mode
```

On first launch the tray icon appears grey. Click it, then click the gear icon
(Settings), and paste the **share code** from the API server's startup log.

The share code encodes:
- MQTT broker host (IP/hostname of the ETL machine)
- WebSocket port (9001)
- Project UUID + System UUID (the opaque topic identifiers)

After applying the share code the icon turns green/yellow/red within seconds.

### Build a distributable

```bash
npm run make
```

Produces a `.zip` in `out/` — distribute to each PC, extract, and run the exe.

---

## REST API endpoints

All served by the API server at `http://<etl-machine>:<API_PORT>`.

| Endpoint | Description |
|---|---|
| `GET /ping` | Health check — returns `{"ok":true}` |
| `GET /api/status` | Current check result + MQTT connected flag |
| `GET /api/history?limit=20` | Last N check results |
| `GET /api/info` | Server info including the share code |

---

## Status logic

| Status | Meaning | What the checker found |
|---|---|---|
| Green | DB is current | Latest `ToDate` in GreenTally within `GREEN_THRESHOLD_HOURS` |
| Yellow / load | Load step failed | Excel files exist recently but DB not updated |
| Yellow / process | Process step failed | CSVs arrived recently but no Excel produced |
| Red | Pipeline did not run | No CSV, no Excel, no recent log activity |

---

## Extending to other projects

Other systems can publish their own status to the same Mosquitto broker using a
different pair of UUIDs. Add a new API service (or extend this one) and
configure new clients with a different share code. No changes needed to the
broker or existing clients.

---

## Development notes

- The API server uses `better-sqlite3` (synchronous) for read-only health checks
  on the SQLite file — no async overhead, no connection pool needed.
- MQTT retained messages mean a client that connects hours after the last check
  still immediately receives the current status on subscribe.
- The icon generator in `electron/icons.js` uses only Node.js built-ins (`zlib`)
  — no native image packages required.
