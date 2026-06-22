import { WebSocketServer, WebSocket } from 'ws';
import { getCpuLoad } from './collectors/cpu';
import { getMemStats } from './collectors/memory';
import { getDockerStats } from './collectors/docker';
import { getNetworkStats } from './collectors/network';
import { getGpuStats } from './collectors/gpu';
import { getDiskStats } from './collectors/disk';
import { getTopProcesses } from './collectors/processes';
import { config } from './config';
import https from 'https';

const wss = new WebSocketServer({ port: config.wsPort, host: '127.0.0.1' });
console.log(`WebSocket server started on ws://127.0.0.1:${config.wsPort}`);

// Location — starts from config.ts, can be overridden by client
let location = {
  city: config.city,
  lat: config.latitude,
  lon: config.longitude,
};

let cachedWeather: object | null = null;
let lastWeatherFetch = 0;
const WEATHER_INTERVAL = 10 * 60 * 1000;

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
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

async function fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${location.lat}&longitude=${location.lon}&current=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code&wind_speed_unit=mph`;
  const data = await fetchJson(url);
  const c = data.current;
  return {
    city: location.city,
    temp: c.temperature_2m,
    feelsLike: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    windspeed: c.wind_speed_10m,
    weatherCode: c.weather_code,
    description: WMO_CODES[c.weather_code] ?? 'Unknown',
  };
}

async function collectMetrics() {
  const now = Date.now();
  const [cpu, mem, docker, network, gpu, disk, processes] = await Promise.all([
    getCpuLoad(), getMemStats(), getDockerStats(), getNetworkStats(),
    getGpuStats(), getDiskStats(), getTopProcesses(),
  ]);
  if (now - lastWeatherFetch > WEATHER_INTERVAL) {
    try { cachedWeather = await fetchWeather(); lastWeatherFetch = now; } catch {}
  }
  return { cpu, mem, docker, network, gpu, disk, processes, weather: cachedWeather, timestamp: now };
}

wss.on('connection', (ws: WebSocket) => {
  console.log('Client connected');

  ws.on('message', async (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'setLocation') {
        location = { city: msg.city, lat: msg.lat, lon: msg.lon };
        console.log(`Location updated: ${msg.city} (${msg.lat}, ${msg.lon})`);
        // Force immediate weather refresh
        lastWeatherFetch = 0;
        cachedWeather = null;
        try { cachedWeather = await fetchWeather(); lastWeatherFetch = Date.now(); } catch {}
      }
    } catch {}
  });

  const send = async () => {
    try {
      const data = await collectMetrics();
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(data));
    } catch (e) { console.error('Error collecting metrics:', e); }
  };

  send();
  const interval = setInterval(send, 2000);
  ws.on('close', () => { console.log('Client disconnected'); clearInterval(interval); });
});
