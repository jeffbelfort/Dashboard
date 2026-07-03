import https from 'https';
import http from 'http';
import { config } from '../config';

export interface SpotifyTrack {
  isPlaying: boolean;
  title: string | null;
  artist: string | null;
  album: string | null;
  albumArt: string | null;
  progressMs: number;
  durationMs: number;
  progressPercent: number;
}

let accessToken: string | null = null;
let refreshToken: string | null = null;
let tokenExpiry = 0;

function postJson(url: string, body: string, headers: Record<string, string>): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(body), ...headers },
    };
    const req = https.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch { resolve({}); } });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

function getJson(url: string, token: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const opts = {
      hostname: u.hostname,
      path: u.pathname + u.search,
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    };
    https.get(opts as any, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode === 204 || !data) { resolve(null); return; }
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    }).on('error', reject);
  });
}

async function refreshAccessToken(): Promise<boolean> {
  if (!refreshToken) return false;
  try {
    const creds = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
    const body = `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`;
    const data = await postJson('https://accounts.spotify.com/api/token', body, { Authorization: `Basic ${creds}` });
    if (data.access_token) {
      accessToken = data.access_token;
      tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
      if (data.refresh_token) refreshToken = data.refresh_token;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

export async function ensureToken(): Promise<boolean> {
  if (accessToken && Date.now() < tokenExpiry) return true;
  return refreshAccessToken();
}

export function setTokens(access: string, refresh: string, expiresIn: number) {
  accessToken = access;
  refreshToken = refresh;
  tokenExpiry = Date.now() + (expiresIn - 60) * 1000;
}

export async function getSpotifyNowPlaying(): Promise<SpotifyTrack | null> {
  if (!config.spotify.enabled) return null;
  try {
    if (!(await ensureToken())) return null;
    const data = await getJson('https://api.spotify.com/v1/me/player/currently-playing', accessToken!);
    if (!data || !data.item) {
      return { isPlaying: false, title: null, artist: null, album: null, albumArt: null, progressMs: 0, durationMs: 0, progressPercent: 0 };
    }
    const item = data.item;
    return {
      isPlaying: data.is_playing,
      title: item.name,
      artist: item.artists?.map((a: any) => a.name).join(', ') ?? null,
      album: item.album?.name ?? null,
      albumArt: item.album?.images?.[1]?.url ?? item.album?.images?.[0]?.url ?? null,
      progressMs: data.progress_ms ?? 0,
      durationMs: item.duration_ms ?? 0,
      progressPercent: item.duration_ms ? (data.progress_ms / item.duration_ms) * 100 : 0,
    };
  } catch {
    return null;
  }
}

export async function spotifyControl(action: 'play' | 'pause' | 'next' | 'previous'): Promise<boolean> {
  if (!config.spotify.enabled || !(await ensureToken())) return false;
  return new Promise((resolve) => {
    const endpoints: Record<string, { method: string; path: string }> = {
      play:     { method: 'PUT',  path: '/v1/me/player/play' },
      pause:    { method: 'PUT',  path: '/v1/me/player/pause' },
      next:     { method: 'POST', path: '/v1/me/player/next' },
      previous: { method: 'POST', path: '/v1/me/player/previous' },
    };
    const ep = endpoints[action];
    const req = https.request({ hostname: 'api.spotify.com', path: ep.path, method: ep.method, headers: { Authorization: `Bearer ${accessToken}`, 'Content-Length': 0 } }, (res) => {
      resolve(res.statusCode === 204 || res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

// OAuth callback server — runs on port 3001 path /callback
export function startOAuthFlow(server: http.Server | null, onTokens: (access: string, refresh: string, expiry: number) => void) {
  // This is handled in index.ts via HTTP upgrade / path routing
}

export function getAuthUrl(): string {
  const scopes = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.spotify.clientId,
    scope: scopes,
    redirect_uri: config.spotify.redirectUri,
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

export async function exchangeCode(code: string): Promise<boolean> {
  try {
    const creds = Buffer.from(`${config.spotify.clientId}:${config.spotify.clientSecret}`).toString('base64');
    const body = `grant_type=authorization_code&code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(config.spotify.redirectUri)}`;
    const data = await postJson('https://accounts.spotify.com/api/token', body, { Authorization: `Basic ${creds}` });
    if (data.access_token && data.refresh_token) {
      setTokens(data.access_token, data.refresh_token, data.expires_in);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
