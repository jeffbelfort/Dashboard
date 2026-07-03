# SYS.MONITOR

A self-hosted real-time system monitoring dashboard with a dark terminal aesthetic. Built with Node.js, WebSockets, Next.js, and direct HWiNFO hardware integration.

![status](https://img.shields.io/badge/status-active-brightgreen)

## Features

- **Live CPU monitoring** — overall load, per-core breakdown, per-core temperatures (P-cores + E-cores)
- **GPU stats** — load, temperature, power draw, VRAM usage, clock speeds (via HWiNFO shared memory)
- **Memory usage** with history graph
- **Disk usage** per drive
- **Top processes** by CPU and memory, sortable
- **Docker container stats** — CPU, memory per container
- **Network interface stats** — real-time upload/download speeds
- **Spotify integration** — now-playing widget with playback controls
- **Weather widget** with configurable location
- **Threshold-based alerts** — CPU/GPU load, temps, disk usage
- **Multi-page layout** with auto-rotation
- **Fully draggable and resizable widgets** — layout saves automatically per page
- **Guided setup wizard** — no manual config editing required

## Why HWiNFO?

Windows' built-in sensor APIs (WMI) are unreliable for GPU power draw, fan speeds, and often CPU temperature. SYS.MONITOR reads directly from **HWiNFO's shared memory** via a lightweight Python reader, giving accurate sensor data without CSV logging or extra background services eating disk I/O.

## Getting Started

### Requirements
- [Node.js](https://nodejs.org) 18+
- [Python](https://python.org) 3.9+ (for HWiNFO sensor reading)
- [HWiNFO64](https://www.hwinfo.com/download/) with **Shared Memory Support** enabled (Settings → General/User Interface)

### Setup

1. Clone the repo
2. Run `setup.ps1` from the project root and choose **[1] First time setup**
   - Installs backend and frontend dependencies
   - Builds the production frontend
3. Run `setup.ps1` again and choose **[2] Start dashboard**
   - Starts backend and frontend, opens your browser automatically
4. On first launch you'll land on the **setup wizard** — configure your location, Spotify (optional), and alert thresholds through the UI
5. Dashboard loads at `http://127.0.0.1:3002`

### HWiNFO Setup
1. Open HWiNFO64 → Settings (gear icon)
2. Go to **General/User Interface**
3. Enable **Shared Memory Support**
4. Restart HWiNFO
   
> Note: the free version of HWiNFO limits Shared Memory Support to 12-hour sessions — restart HWiNFO periodically, or use a licensed copy to remove the limit.

### Spotify Setup (optional)
1. Create an app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard)
2. Set the redirect URI to `http://127.0.0.1:3001/callback`
3. Enter your Client ID and Secret during the setup wizard
4. After setup, visit `http://127.0.0.1:3001/spotify/auth` to connect your account

## Project Structure

```
project/
├── backend/
│   ├── src/
│   │   ├── collectors/       # Individual metric collectors (CPU, GPU, disk, etc.)
│   │   ├── hwinfo_reader.py  # Persistent HWiNFO shared memory reader
│   │   ├── config.ts         # Your config (gitignored)
│   │   ├── config.template.ts
│   │   ├── setup.ts          # Setup wizard backend logic
│   │   ├── db.ts             # Metric history storage
│   │   └── index.ts          # WebSocket server + metrics loop
│   └── package.json
├── frontend/
│   ├── src/
│   │   └── app/
│   │       ├── page.tsx      # Main dashboard
│   │       └── setup/        # Setup wizard UI
│   └── package.json
└── setup.ps1                 # Install / build / launch script
```

## Architecture Notes

- **Single shared metrics loop** — one collection cycle serves all connected clients, not one per browser tab
- **Per-collector throttling** — expensive Windows WMI calls (CPU load, network, disk, process list) are rate-limited independently to keep system overhead minimal; the loop pauses entirely when no dashboard is open
- **In-memory history** — no database setup required; metrics persist for the current session

## Configuration

All configuration is done through the setup wizard on first run. Your config, including any credentials, is saved to `backend/src/config.ts`, which is gitignored and never leaves your machine.

To re-run setup, delete `backend/src/config.ts` and restart the backend.

## License

Personal project — use, fork, and modify freely.
