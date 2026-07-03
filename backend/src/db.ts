// In-memory metric history — no native dependencies required.
// History is lost on backend restart but otherwise fully functional.

export interface MetricRow {
  ts: number;
  cpu_load: number | null;
  cpu_temp: number | null;
  mem_percent: number | null;
  gpu_load: number | null;
  gpu_temp: number | null;
  gpu_power: number | null;
}

const MAX_ROWS = 24 * 60 * 30; // ~24h at 2s intervals
let store: MetricRow[] = [];

export function insertMetric(row: MetricRow) {
  store.push(row);
  if (store.length > MAX_ROWS) store = store.slice(-MAX_ROWS);
}

export function getHistory(minutes: number = 60): MetricRow[] {
  const cutoff = Date.now() - minutes * 60 * 1000;
  return store.filter(r => r.ts > cutoff);
}
