import fs from 'fs';
import path from 'path';

// Config is stored as plain JSON, not generated TypeScript. This matters for
// two reasons:
//   1. A packaged release only ships backend/dist (no src/), so writing to
//      <cwd>/src/config.ts would throw ENOENT the moment someone completes
//      setup on a downloaded release.
//   2. Even with a src/ folder present, a compiled backend has no compiler
//      running - a freshly-written .ts file would never become usable .js
//      without a manual rebuild. A plain JSON file can be read directly at
//      runtime in both dev and packaged modes with no compile step.
// As a side effect, this also stops a release build from ever embedding
// personal config (city, Spotify credentials) into the shipped dist/ output,
// since config.json lives outside both src/ and dist/ and is never part of
// what the build script copies into a release.
const CONFIG_PATH = path.join(process.cwd(), 'config.json');

export function configExists(): boolean {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return false;
    const parsed = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    return parsed.setupComplete === true;
  } catch {
    return false;
  }
}

export interface SetupPayload {
  city: string;
  latitude: number;
  longitude: number;
  spotify: {
    enabled: boolean;
    clientId: string;
    clientSecret: string;
  };
  alerts: {
    cpuLoad: number;
    cpuTemp: number;
    memPercent: number;
    gpuLoad: number;
    gpuTemp: number;
    diskPercent: number;
  };
  auth: {
    enabled: boolean;
    password: string;
    totpSecret: string;
    twoFactorEnabled: boolean;
  };
}

export function writeConfig(payload: SetupPayload): void {
  const configObject = {
    city: payload.city,
    latitude: payload.latitude,
    longitude: payload.longitude,
    wsPort: 3001,
    pollInterval: 2000,
    weatherInterval: 10 * 60 * 1000,
    setupComplete: true,

    spotify: {
      enabled: payload.spotify.enabled,
      clientId: payload.spotify.clientId,
      clientSecret: payload.spotify.clientSecret,
      redirectUri: 'http://127.0.0.1:3001/callback',
    },

    alerts: { ...payload.alerts },
    auth: { ...payload.auth },
  };

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(configObject, null, 2), 'utf8');
}

// Centralizes config loading here (instead of index.ts duplicating the path
// logic) so there's exactly one place that knows where config.json lives.
// Falls back to config.template's defaults if config.json doesn't exist yet
// or fails to parse — same fallback behavior as before, just JSON-based.
export function loadConfig(): any {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch {
    return require('./config.template').config;
  }
}
