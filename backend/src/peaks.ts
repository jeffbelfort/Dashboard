// ── Peak Events ──────────────────────────────────────────────────────────
// A second, genuinely useful table built on the generic SYS.LITE engine.
// Logs a new record only when CPU/GPU load or temp beats its previous
// session high — naturally sparse, and a real showcase for the secondary
// index ("show me my top 10 hottest GPU moments ever, sorted").

import { Table, Row } from './engine';

// metric encoding: 1=cpu_temp, 2=gpu_temp, 3=cpu_load, 4=gpu_load
export const METRIC_NAMES: Record<number, string> = {
  1: 'cpu_temp', 2: 'gpu_temp', 3: 'cpu_load', 4: 'gpu_load',
};
const METRIC_IDS: Record<string, number> = {
  cpu_temp: 1, gpu_temp: 2, cpu_load: 3, gpu_load: 4,
};

const peakTable = new Table('peak_events', [
  { name: 'ts', size: 8 },
  { name: 'metric', size: 4 },
  { name: 'value', size: 4 },
]);

// In-memory running maxes, seeded from the table on startup so a restart
// doesn't reset "session" highs back to zero immediately.
const runningMax: Record<string, number> = {};

function seedRunningMax() {
  // Table is small/sparse by design — a full scan on boot is cheap and correct,
  // unlike relying on the overall top-1 which could miss a metric entirely.
  const all = peakTable.query('ts >= 0', 100000); // matches everything
  for (const row of all.rows) {
    const name = METRIC_NAMES[row.metric as number];
    const val = row.value as number;
    if (name && (runningMax[name] === undefined || val > runningMax[name])) {
      runningMax[name] = val;
    }
  }
}
seedRunningMax();

export function recordIfPeak(metricName: 'cpu_temp' | 'gpu_temp' | 'cpu_load' | 'gpu_load', value: number | null) {
  if (value == null) return;
  const current = runningMax[metricName];
  if (current === undefined || value > current) {
    runningMax[metricName] = value;
    peakTable.insert({ ts: Date.now(), metric: METRIC_IDS[metricName], value });
  }
}

export function getPeaksTable(): Table { return peakTable; }

export function getTopPeaks(metricName: string, n: number = 10): Row[] {
  // Filter by metric first (full scan — this table is small/sparse by design),
  // then take the top N of that filtered set.
  const all = peakTable.query(`metric == ${METRIC_IDS[metricName] ?? -1}`, 100000);
  return all.rows
    .sort((a, b) => (b.value as number) - (a.value as number))
    .slice(0, n)
    .map(r => ({ ...r, metricName }));
}

export function getRunningMaxes(): Record<string, number | undefined> {
  return { ...runningMax };
}
