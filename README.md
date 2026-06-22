# SYS.MONITOR

A self-hosted real-time system monitoring dashboard with a dark terminal aesthetic. Built with Node.js, WebSockets, and Next.js.

![Dashboard](https://img.shields.io/badge/status-active-4ade80?style=flat-square&labelColor=0a0c0a)

## Features

- Live CPU load with per-core breakdown and history graph
- Memory usage with history graph
- GPU stats — load, VRAM, temperature (NVIDIA/AMD)
- Disk usage per drive
- Top processes by CPU
- Docker container stats — CPU, memory per container
- Network interface stats
- Weather widget with configurable location
- Multi-page layout with auto-rotation
- Fully draggable and resizable widgets
- Layout saves automatically per page

## Requirements

- [Node.js](https://nodejs.org) v18 or higher — just install it and come back
- Docker Desktop (optional — dashboard works fine without it)

## Setup

**1. Download and extract the project**

**2. Right click `setup.ps1` and click "Run with PowerShell"**

This installs everything automatically. If it errors saying scripts are blocked, open PowerShell and run:
```
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```
Then try again.

**3. Set your location** (or you can just use the settings button on the widget app you dont really need to do this part)

Open `backend/src/config.ts` in any text editor and change the city, latitude and longitude to yours. Find your coordinates at [latlong.net](https://latlong.net).

**4. Start the dashboard**

Open two terminal windows (PowerShell or Command Prompt) in the project folder:

Terminal 1:
```
cd backend
npx ts-node-dev --respawn src/index.ts
```

Terminal 2:
```
cd frontend
npm run dev
```

**5. Open your browser and go to http://127.0.0.1:3002**

That's it.

## Usage

- **Move widgets** — drag by the header bar
- **Resize widgets** — drag the corner handle
- **Hide a widget** — hover it and click ✕
- **Add a widget back** — click `+` in the top right
- **Switch pages** — click the page tabs in the header
- **Settings** — click ⚙ top right to manage pages and set auto-rotation speed
- **Change weather location** — click ⚙ inside the weather widget, no restart needed

## Stack

- **Backend** — Node.js, TypeScript, `ws`, `systeminformation`, `dockerode`
- **Frontend** — Next.js, React, `react-grid-layout`, `recharts`
- **Weather** — [Open-Meteo](https://open-meteo.com) (free, no API key needed)
