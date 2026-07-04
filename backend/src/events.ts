// ── Event Log ────────────────────────────────────────────────────────────
// Simple append-only JSON-lines log for notable events: alerts firing/
// clearing, backend restarts, Spotify connects. Separate from the binary
// metrics store since events are sparse and text-shaped, not fixed-width.

import fs from 'fs';
import path from 'path';

const LOG_PATH = path.join(process.cwd(), 'events.jsonl');
const MAX_EVENTS_IN_FILE = 2000; // prune when it grows past this

export type EventType =
  | 'backend_start'
  | 'alert_fired'
  | 'alert_cleared'
  | 'spotify_connected'
  | 'spotify_disconnected'
  | 'setup_completed';

export interface EventEntry {
  ts: number;
  type: EventType;
  message: string;
}

export function logEvent(type: EventType, message: string) {
  const entry: EventEntry = { ts: Date.now(), type, message };
  try {
    fs.appendFileSync(LOG_PATH, JSON.stringify(entry) + '\n');
  } catch (e) {
    console.error('event log write error:', e);
  }
}

export function getEvents(limit: number = 50): EventEntry[] {
  try {
    if (!fs.existsSync(LOG_PATH)) return [];
    const content = fs.readFileSync(LOG_PATH, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    const recent = lines.slice(-limit);
    return recent
      .map(l => { try { return JSON.parse(l) as EventEntry; } catch { return null; } })
      .filter((e): e is EventEntry => e !== null)
      .reverse(); // newest first
  } catch (e) {
    console.error('event log read error:', e);
    return [];
  }
}

// Call occasionally (e.g. on boot) to keep the file from growing forever
export function pruneEvents(keep: number = MAX_EVENTS_IN_FILE) {
  try {
    if (!fs.existsSync(LOG_PATH)) return;
    const content = fs.readFileSync(LOG_PATH, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    if (lines.length <= keep) return;
    const trimmed = lines.slice(-keep);
    fs.writeFileSync(LOG_PATH, trimmed.join('\n') + '\n');
  } catch (e) {
    console.error('event log prune error:', e);
  }
}
