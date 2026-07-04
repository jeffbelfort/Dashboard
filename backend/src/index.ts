import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';
import https from 'https';
import fs from 'fs';
import { configExists, writeConfig, SetupPayload } from './setup';

// ── Config loading ─────────────────────────────────────────────────────────
let config: any;
try {
  config = require('./config').config;
} catch {
  config = require('./config.template').config;
}

const IS_SETUP = !configExists();

// ── Lazy import collectors (only if setup complete) ────────────────────────
let getCpuLoad: any, getMemStats: any, getDockerStats: any, getNetworkStats: any;
let getDiskStats: any, getTopProcesses: any;
let getSpotifyNowPlaying: any, spotifyControl: any;
let getHwinfoData: any;
let getAuthUrl: any, exchangeCode: any;
let insertMetric: any, getHistory: any, getHistoryStats: any, pruneOlderThan: any, getDailyComparison: any;
let getAvailableDays: any, getDayStats: any;
let logEvent: any, getEvents: any, pruneEvents: any;
let getEngineHealth: any, getRawRecords: any, getRecordLayout: any, runBenchmark: any;
let previewPrune: any, getExportPath: any, exportRangeAsRows: any;
let recordIfPeak: any, getTopPeaks: any, getPeaksTable: any, getRunningMaxes: any;

if (!IS_SETUP) {
  ({ getCpuLoad } = require('./collectors/cpu'));
  ({ getMemStats } = require('./collectors/memory'));
  ({ getDockerStats } = require('./collectors/docker'));
  ({ getNetworkStats } = require('./collectors/network'));
  ({ getDiskStats } = require('./collectors/disk'));
  ({ getTopProcesses } = require('./collectors/processes'));
  ({ getHwinfoData } = require('./collectors/hwinfo'));
  ({ getSpotifyNowPlaying, spotifyControl, getAuthUrl, exchangeCode } = require('./collectors/spotify'));
  ({ insertMetric, getHistory, getStats: getHistoryStats, pruneOlderThan, getDailyComparison, getAvailableDays, getDayStats,
     getEngineHealth, getRawRecords, getRecordLayout, runBenchmark, previewPrune, getExportPath, exportRangeAsRows } = require('./db'));
  ({ recordIfPeak, getTopPeaks, getPeaksTable, getRunningMaxes } = require('./peaks'));
  ({ logEvent, getEvents, pruneEvents } = require('./events'));
}

// ── HTTP server ────────────────────────────────────────────────────────────
const httpServer = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${config.wsPort}`);

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  if (url.pathname === '/api/setup/status') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ setupRequired: IS_SETUP }));
    return;
  }

  if (url.pathname === '/api/setup/save' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const payload: SetupPayload = JSON.parse(body);
        writeConfig(payload);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: 'Config saved. Please restart the backend.' }));
        setTimeout(() => process.exit(0), 1000);
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  if (url.pathname === '/api/geocode') {
    const city = url.searchParams.get('city') ?? '';
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=5&language=en&format=json`;
    https.get(geoUrl, (geoRes) => {
      let data = '';
      geoRes.on('data', c => data += c);
      geoRes.on('end', () => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    }).on('error', () => { res.writeHead(500); res.end('{}'); });
    return;
  }

  if (url.pathname === '/callback') {
    const code = url.searchParams.get('code');
    if (code && exchangeCode) {
      const ok = await exchangeCode(code);
      if (ok) logEvent?.('spotify_connected', 'Spotify account connected');
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<html><body style="background:#0a0c0a;color:#4ade80;font-family:monospace;padding:40px">
        <h2>${ok ? '&#10003; Spotify connected' : '&#10007; Auth failed'}</h2>
        <p>${ok ? 'Close this tab and return to SYS.MONITOR.' : 'Try again.'}</p>
      </body></html>`);
    } else { res.writeHead(400); res.end('Missing code'); }
    return;
  }

  if (url.pathname === '/history' && getHistory) {
    const RANGE_MINUTES: Record<string, number> = {
      '1h': 60, '6h': 360, '24h': 1440, '7d': 10080,
    };
    const rangeParam = url.searchParams.get('range');
    const mins = rangeParam
      ? (RANGE_MINUTES[rangeParam] ?? 60)
      : parseInt(url.searchParams.get('minutes') ?? '60');
    const points = parseInt(url.searchParams.get('points') ?? '300');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getHistory(mins, points)));
    return;
  }

  if (url.pathname === '/history/stats' && getHistoryStats) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getHistoryStats()));
    return;
  }

  if (url.pathname === '/history/compare' && getDailyComparison) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getDailyComparison()));
    return;
  }

  if (url.pathname === '/history/days' && getAvailableDays) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getAvailableDays()));
    return;
  }

  if (url.pathname === '/history/day' && getDayStats) {
    const date = url.searchParams.get('date') ?? '';
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getDayStats(date)));
    return;
  }

  // ── SYS.LITE Engine endpoints ──────────────────────────────────────────
  if (url.pathname === '/syslite/health' && getEngineHealth) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getEngineHealth()));
    return;
  }

  if (url.pathname === '/syslite/records' && getRawRecords) {
    const page = parseInt(url.searchParams.get('page') ?? '0');
    const pageSize = parseInt(url.searchParams.get('pageSize') ?? '50');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getRawRecords(page, pageSize)));
    return;
  }

  if (url.pathname === '/syslite/layout' && getRecordLayout) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getRecordLayout()));
    return;
  }

  if (url.pathname === '/syslite/benchmark' && runBenchmark) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(runBenchmark()));
    return;
  }

  if (url.pathname === '/syslite/prune/preview' && previewPrune) {
    const days = parseInt(url.searchParams.get('days') ?? '7');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(previewPrune(days)));
    return;
  }

  if (url.pathname === '/syslite/prune/confirm' && req.method === 'POST' && pruneOlderThan) {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { days, confirm } = JSON.parse(body || '{}');
        if (confirm !== true) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ ok: false, error: 'Confirmation required' }));
          return;
        }
        pruneOlderThan(days ?? 7);
        logEvent?.('setup_completed', `Manual prune executed (older than ${days ?? 7}d)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: String(e) }));
      }
    });
    return;
  }

  if (url.pathname === '/syslite/export/raw' && getExportPath) {
    const filePath = getExportPath();
    if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('No data file yet'); return; }
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': 'attachment; filename="history.bin"',
    });
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  if (url.pathname === '/syslite/export/csv' && exportRangeAsRows) {
    const minutes = parseInt(url.searchParams.get('minutes') ?? '1440');
    const rows = exportRangeAsRows(minutes);
    const header = 'timestamp,cpu_load,cpu_temp,mem_percent,gpu_load,gpu_temp,gpu_power\n';
    const csv = header + rows.map((r: any) =>
      `${new Date(r.ts).toISOString()},${r.cpu_load ?? ''},${r.cpu_temp ?? ''},${r.mem_percent ?? ''},${r.gpu_load ?? ''},${r.gpu_temp ?? ''},${r.gpu_power ?? ''}`
    ).join('\n');
    res.writeHead(200, {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="sysmonitor-export-${minutes}min.csv"`,
    });
    res.end(csv);
    return;
  }

  // ── Peak Events (second table, demonstrates multi-table support) ───────
  if (url.pathname === '/syslite/peaks' && getTopPeaks) {
    const metric = url.searchParams.get('metric') ?? 'gpu_temp';
    const limit = parseInt(url.searchParams.get('limit') ?? '10');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getTopPeaks(metric, limit)));
    return;
  }

  if (url.pathname === '/syslite/peaks/current' && getRunningMaxes) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getRunningMaxes()));
    return;
  }

  // ── Generic query console — works against either table ──────────────────
  if (url.pathname === '/syslite/query' && req.method === 'POST') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      try {
        const { table, filter, limit } = JSON.parse(body || '{}');
        let result;
        if (table === 'peak_events' && getPeaksTable) {
          result = getPeaksTable().query(filter ?? '', limit ?? 100);
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Unknown table. Available: peak_events' }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (e) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: String(e) }));
      }
    });
    return;
  }

  if (url.pathname === '/syslite/tables' && getPeaksTable) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify([
      { name: 'metrics', description: 'Live system metrics (CPU/GPU/memory), 48-byte fixed records', builtin: true },
      { name: 'peak_events', description: 'Session-high events for CPU/GPU load and temp', meta: getPeaksTable().getMeta() },
    ]));
    return;
  }

  if (url.pathname === '/events' && getEvents) {
    const limit = parseInt(url.searchParams.get('limit') ?? '50');
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(getEvents(limit)));
    return;
  }

  if (url.pathname === '/spotify/auth' && getAuthUrl) {
    res.writeHead(302, { Location: getAuthUrl() });
    res.end();
    return;
  }

  res.writeHead(404); res.end('Not found');
});

const wss = new WebSocketServer({ server: httpServer });

httpServer.listen(config.wsPort, '127.0.0.1', () => {
  console.log(`SYS.MONITOR backend on http://127.0.0.1:${config.wsPort}`);
  if (IS_SETUP) {
    console.log('! Setup required - open http://127.0.0.1:3002/setup');
  } else {
    console.log('Config loaded - dashboard ready');
    if (config.spotify?.enabled) console.log(`Spotify auth: http://127.0.0.1:${config.wsPort}/spotify/auth`);
  }

  if (!IS_SETUP) {
    pruneEvents?.();
    logEvent?.('backend_start', 'Backend started');
    // Auto-prune removed — data is now kept indefinitely by default.
    // Manual pruning is still available via the /syslite Maintenance page.
  }
});

if (IS_SETUP) {
  wss.on('connection', (ws) => {
    ws.send(JSON.stringify({ setupRequired: true }));
  });
  // stay alive to serve setup endpoints
} else {

// ── Weather & location ─────────────────────────────────────────────────────
let location = { city: config.city, lat: config.latitude, lon: config.longitude };
let cachedWeather: object | null = null;
let lastWeatherFetch = 0;

const WMO_CODES: Record<number, string> = {
  0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',
  45:'Fog',48:'Icy fog',51:'Light drizzle',53:'Drizzle',55:'Heavy drizzle',
  61:'Light rain',63:'Rain',65:'Heavy rain',71:'Light snow',73:'Snow',
  75:'Heavy snow',80:'Light showers',81:'Showers',82:'Heavy showers',
  95:'Thunderstorm',96:'Thunderstorm w/ hail',99:'Thunderstorm w/ heavy hail',
};

function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch(e) { reject(e); } });
    }).on('error', reject);
  });
}

async function fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&wind_speed_unit=mph`;
  const data = await fetchJson(url);
  const c = data.current;
  return {
    city: location.city,
    temp: c.temperature_2m, feelsLike: c.apparent_temperature,
    humidity: c.relative_humidity_2m, windspeed: c.wind_speed_10m,
    weatherCode: c.weather_code, description: WMO_CODES[c.weather_code] ?? 'Unknown',
  };
}

// ── Alert checker ──────────────────────────────────────────────────────────
interface Alert { type: string; value: number; threshold: number; message: string; }

function checkAlerts(m: any): Alert[] {
  const alerts: Alert[] = [];
  const t = config.alerts;
  const cpuTemp = m.hwinfo?.cpu?.packageTemp;
  const gpuLoad = m.hwinfo?.gpu?.load;
  const gpuTemp = m.hwinfo?.gpu?.temp;

  if (m.cpu?.load > t.cpuLoad) alerts.push({ type:'cpu_load', value:m.cpu.load, threshold:t.cpuLoad, message:`CPU load ${m.cpu.load.toFixed(0)}% > ${t.cpuLoad}%` });
  if (cpuTemp != null && cpuTemp > t.cpuTemp) alerts.push({ type:'cpu_temp', value:cpuTemp, threshold:t.cpuTemp, message:`CPU temp ${cpuTemp.toFixed(0)}C > ${t.cpuTemp}C` });
  if (m.mem?.percent > t.memPercent) alerts.push({ type:'mem', value:m.mem.percent, threshold:t.memPercent, message:`Memory ${m.mem.percent.toFixed(0)}% > ${t.memPercent}%` });
  if (gpuLoad != null && gpuLoad > t.gpuLoad) alerts.push({ type:'gpu_load', value:gpuLoad, threshold:t.gpuLoad, message:`GPU load ${gpuLoad.toFixed(0)}% > ${t.gpuLoad}%` });
  if (gpuTemp != null && gpuTemp > t.gpuTemp) alerts.push({ type:'gpu_temp', value:gpuTemp, threshold:t.gpuTemp, message:`GPU temp ${gpuTemp.toFixed(0)}C > ${t.gpuTemp}C` });
  for (const disk of m.disk ?? []) {
    if (disk.percent > t.diskPercent) alerts.push({ type:'disk', value:disk.percent, threshold:t.diskPercent, message:`Disk ${disk.mount} ${disk.percent.toFixed(0)}% > ${t.diskPercent}%` });
  }
  return alerts;
}

// ── Throttled collector framework ──────────────────────────────────────────
// Each collector has its own refresh interval. Between refreshes the cached
// value is served with ZERO cost — the underlying WMI/system call never fires.

interface ThrottledCollector<T> {
  name: string;
  intervalMs: number;
  fn: () => Promise<T>;
  value: T;
  lastRun: number;
  running: boolean;      // prevents overlapping slow calls
  failures: number;      // consecutive failures for backoff
}

function makeCollector<T>(name: string, intervalMs: number, fn: () => Promise<T>, initial: T): ThrottledCollector<T> {
  return { name, intervalMs, fn, value: initial, lastRun: 0, running: false, failures: 0 };
}

async function refreshIfStale<T>(c: ThrottledCollector<T>): Promise<T> {
  const now = Date.now();
  // Exponential backoff on repeated failures (e.g. Docker not installed):
  // 1 fail -> wait 2x interval, 2 fails -> 4x, capped at 60s extra
  const backoff = Math.min(c.failures * c.failures * c.intervalMs, 60000);
  if (c.running || now - c.lastRun < c.intervalMs + backoff) return c.value;

  c.running = true;
  c.lastRun = now;
  try {
    c.value = await c.fn();
    c.failures = 0;
  } catch (e) {
    c.failures++;
    if (c.failures === 1 || c.failures % 10 === 0) {
      console.error(`Collector '${c.name}' failed (x${c.failures}):`, (e as Error).message);
    }
  } finally {
    c.running = false;
  }
  return c.value;
}

// ── Collector registry with tuned intervals ────────────────────────────────
// HWiNFO covers CPU temps, GPU everything, fans — via shared memory (cheap).
// systeminformation (WMI, expensive) is throttled hard.

const collectors = {
  // Cheap reads — every broadcast
  hwinfo:  makeCollector('hwinfo',  1000,  () => getHwinfoData(), null as any),
  mem:     makeCollector('memory',  3000,  () => getMemStats(),   { used: 0, total: 0, percent: 0 }),

  // WMI-backed — throttled
  cpu:     makeCollector('cpu',     5000,  () => getCpuLoad(),        { load: 0, cores: [] as number[] }),
  network: makeCollector('network', 5000,  () => getNetworkStats(),   [] as any[]),
  disk:    makeCollector('disk',    30000, () => getDiskStats(),      [] as any[]),
  processes: makeCollector('processes', 15000, () => getTopProcesses(), [] as any[]),
  docker:  makeCollector('docker',  10000, () => getDockerStats(),    [] as any[]),

  // Network API — cheap but rate-limited by politeness
  spotify: makeCollector('spotify', 4000,
    () => config.spotify?.enabled ? getSpotifyNowPlaying() : Promise.resolve(null),
    null as any),
};

// ── Global collection loop (ONE loop, broadcasts to ALL clients) ───────────
let latestPayload: string | null = null;
let dbTick = 0;
let prevAlertTypes = new Set<string>();

async function collectAndBroadcast() {
  const now = Date.now();

  // Refresh whatever is stale; fresh collectors return cached instantly
  const [hwinfo, mem, cpu, network, disk, processes, docker, spotify] = await Promise.all([
    refreshIfStale(collectors.hwinfo),
    refreshIfStale(collectors.mem),
    refreshIfStale(collectors.cpu),
    refreshIfStale(collectors.network),
    refreshIfStale(collectors.disk),
    refreshIfStale(collectors.processes),
    refreshIfStale(collectors.docker),
    refreshIfStale(collectors.spotify),
  ]);

  if (now - lastWeatherFetch > config.weatherInterval) {
    lastWeatherFetch = now;
    fetchWeather().then(w => { cachedWeather = w; }).catch(() => {});
  }

  const metrics: any = {
    cpu, mem, docker, network, disk, processes, spotify, hwinfo,
    gpu: null,                                    // legacy field, GPU now via hwinfo
    cpuTemp: { main: hwinfo?.cpu?.packageTemp ?? null, cores: [], max: null }, // legacy shape
    fans: [],                                     // legacy, fans now via hwinfo
    weather: cachedWeather,
    timestamp: now,
  };
  metrics.alerts = checkAlerts(metrics);

  // Track peak events (new session highs) — feeds the SYS.LITE peak_events table
  if (recordIfPeak) {
    recordIfPeak('cpu_load', cpu.load ?? null);
    recordIfPeak('cpu_temp', hwinfo?.cpu?.packageTemp ?? null);
    recordIfPeak('gpu_load', hwinfo?.gpu?.load ?? null);
    recordIfPeak('gpu_temp', hwinfo?.gpu?.temp ?? null);
  }

  // Log alert state transitions (only on change, not every tick)
  const currentAlertTypes = new Set(metrics.alerts.map((a: Alert) => a.type));
  for (const a of metrics.alerts) {
    if (!prevAlertTypes.has(a.type)) logEvent?.('alert_fired', a.message);
  }
  for (const prevType of prevAlertTypes) {
    if (!currentAlertTypes.has(prevType)) logEvent?.('alert_cleared', `${prevType.replace('_',' ')} back to normal`);
  }
  prevAlertTypes = currentAlertTypes;

  // Persist history every ~6s regardless of broadcast rate
  dbTick++;
  if (dbTick % 2 === 0) {
    insertMetric({
      ts: now,
      cpu_load: cpu.load,
      cpu_temp: hwinfo?.cpu?.packageTemp ?? null,
      mem_percent: mem.percent,
      gpu_load: hwinfo?.gpu?.load ?? null,
      gpu_temp: hwinfo?.gpu?.temp ?? null,
      gpu_power: hwinfo?.gpu?.power ?? null,
    });
  }

  latestPayload = JSON.stringify(metrics);

  for (const client of wss.clients) {
    if (client.readyState === WebSocket.OPEN) client.send(latestPayload);
  }
}

// Only run the loop while someone is actually connected
let loopHandle: ReturnType<typeof setInterval> | null = null;

function ensureLoop() {
  if (loopHandle) return;
  console.log('Metrics loop started');
  collectAndBroadcast();
  loopHandle = setInterval(collectAndBroadcast, config.pollInterval);
}

function stopLoopIfIdle() {
  if (wss.clients.size === 0 && loopHandle) {
    clearInterval(loopHandle);
    loopHandle = null;
    console.log('No clients - metrics loop paused');
  }
}

// ── WebSocket ──────────────────────────────────────────────────────────────
wss.on('connection', (ws: WebSocket) => {
  console.log(`Client connected (${wss.clients.size} total)`);
  ensureLoop();

  // Send last known state immediately so the UI isn't blank
  if (latestPayload) ws.send(latestPayload);

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'setLocation') {
        location = { city: msg.city, lat: msg.lat, lon: msg.lon };
        lastWeatherFetch = 0; cachedWeather = null;
        try { cachedWeather = await fetchWeather(); lastWeatherFetch = Date.now(); } catch {}
      }
      if (msg.type === 'spotifyControl') {
        await spotifyControl(msg.action);
        collectors.spotify.lastRun = 0; // refresh now-playing on next tick
      }
      if (msg.type === 'getHistory') {
        const history = getHistory(msg.minutes ?? 60);
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'history', data: history }));
      }
    } catch {}
  });

  ws.on('close', () => {
    console.log(`Client disconnected (${wss.clients.size} total)`);
    stopLoopIfIdle();
  });
});

} // end of !IS_SETUP block
