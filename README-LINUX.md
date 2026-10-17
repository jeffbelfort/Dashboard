# SYS.MONITOR — Linux development port

This overlay is based on the supplied local source, including its JSON-config and release-launcher changes. Extract it into that project root. It does not contain or replace personal configuration, history, tokens, or saved browser layouts.

## First run on Linux Mint

Required: Node (this source's Next.js lockfile requires Node 18.18+), npm, Python 3, lm-sensors, and a working NVIDIA driver for NVIDIA metrics. A currently supported Node LTS is preferable for continued use; the source build requirement is not a support-lifetime recommendation.

```bash
python3 backend/src/linux_sensors.py --once
bash setup-linux.sh install
bash setup-linux.sh start
```

Open http://127.0.0.1:3002. The backend uses 127.0.0.1:3001. Leave this terminal running; Ctrl+C stops both services and the sensor subprocess. Existing backend/config.json is retained. If absent, complete the setup wizard and restart the dashboard after saving. The new launcher does not change your network or DNS settings.

Build again after source changes with `bash setup-linux.sh build`. Do not copy Windows node_modules or .next output to Linux: install/build on Linux. If old dependencies cause trouble, remove only backend/node_modules and frontend/node_modules, then run install again. Installation uses npm ci and the existing lockfiles.

## Sensor support

- CPU package and individual core temperatures from `sensors -j`, selecting CPU chips rather than NIC/ACPI readings.
- Logical CPU frequency samples from Linux cpufreq. These are NOT measured effective clocks. CPU numbering can differ from HWiNFO's labels.
- First NVIDIA GPU: model, temperature, GPU/memory-controller load, used/total VRAM, graphics/memory clocks, power draw/limit and fan percentage via nvidia-smi.
- NVIDIA fan percentage is not fan RPM. CPU package power, motherboard fan RPM, voltages, effective clocks and GPU memory-junction temperature remain unavailable in this first port. We do not request root access or invent values.
- The existing `hwinfo` JSON key remains for widget/history compatibility; Linux does not require HWiNFO. The sensor widget is labelled SENSORS.
- CPU/RAM/process/disk/network collection remains on systeminformation. Mounted Windows volumes should appear by their mount paths; test locally.
- Docker defaults to /var/run/docker.sock on Linux. Override with DOCKER_SOCKET for a rootless socket. Docker is optional. Do not loosen socket permissions to make the widget work; Docker access grants substantial host control.
- Spotify keeps the existing web API integration, now using the project's JSON config loader. Existing API/account requirements still apply.

## Launcher

The terminal launcher is the tested Linux startup path. The existing Electron launcher has Linux process-group cleanup and absolute window paths; its interactive window has NOT been tested here. Linux packaged Electron distribution and automatic login startup are not included yet. Never run Electron as root or add --no-sandbox as a workaround.

## Checks

Run `python3 tests/test_linux_sensors.py` for parser/unit/missing-tool checks. The backend and Next.js production builds were checked during preparation. Missing tools produce unavailable fields, not a crash. Actual CPU/GPU readings, temperatures, Spotify, Docker and browser layout behaviour must be verified on the target PC; the preparation environment does not have that PC's hardware.

Windows selects the existing HWiNFO reader; builds now copy the Python readers into dist automatically. Windows runtime regression testing remains outstanding.

## Scope

This overlay is a development port, not a full security audit or a signed/packaged release. It preserves existing application behaviour outside the changes described above. No autostart service is enabled automatically. Configuration and history stay in the original project; do not upload backend/config.json or tokens to GitHub.
