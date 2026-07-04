// ── SYS.LITE ─────────────────────────────────────────────────────────────
// A minimal purpose-built time-series storage engine.
// Not a general database — just fast append-only writes and range-indexed
// reads for exactly the shape of data this dashboard needs.
//
// File format (history.bin): fixed-width binary records, append-only.
// Each record is 48 bytes:
//   [0:8]   timestamp   (double, ms since epoch)
//   [8:12]  cpu_load    (float32, -1 = null)
//   [12:16] cpu_temp    (float32, -1 = null)
//   [16:20] mem_percent (float32, -1 = null)
//   [20:24] gpu_load    (float32, -1 = null)
//   [24:28] gpu_temp    (float32, -1 = null)
//   [28:32] gpu_power   (float32, -1 = null)
//   [32:48] reserved    (padding for future fields, zeroed)

import fs from 'fs';
import path from 'path';

const RECORD_SIZE = 48;
const NULL_SENTINEL = -1;

const DATA_PATH = path.join(process.cwd(), 'history.bin');
const INDEX_PATH = path.join(process.cwd(), 'history.idx.json');

export interface MetricRow {
  ts: number;
  cpu_load: number | null;
  cpu_temp: number | null;
  mem_percent: number | null;
  gpu_load: number | null;
  gpu_temp: number | null;
  gpu_power: number | null;
}

interface IndexMeta {
  recordCount: number;
  firstTs: number;
  lastTs: number;
}

// ── Index (small JSON sidecar, rewritten on every write — cheap since it's tiny) ──
function loadIndex(): IndexMeta {
  try {
    return JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8'));
  } catch {
    return { recordCount: 0, firstTs: 0, lastTs: 0 };
  }
}

function saveIndex(meta: IndexMeta) {
  fs.writeFileSync(INDEX_PATH, JSON.stringify(meta));
}

let indexCache: IndexMeta = loadIndex();
let fileHandle: number | null = null;

function ensureFile(): number {
  if (fileHandle === null) {
    fileHandle = fs.openSync(DATA_PATH, 'a+');
  }
  return fileHandle;
}

// ── Write ──────────────────────────────────────────────────────────────────
export function insertMetric(row: MetricRow) {
  const buf = Buffer.alloc(RECORD_SIZE);
  buf.writeDoubleLE(row.ts, 0);
  buf.writeFloatLE(row.cpu_load ?? NULL_SENTINEL, 8);
  buf.writeFloatLE(row.cpu_temp ?? NULL_SENTINEL, 12);
  buf.writeFloatLE(row.mem_percent ?? NULL_SENTINEL, 16);
  buf.writeFloatLE(row.gpu_load ?? NULL_SENTINEL, 20);
  buf.writeFloatLE(row.gpu_temp ?? NULL_SENTINEL, 24);
  buf.writeFloatLE(row.gpu_power ?? NULL_SENTINEL, 28);
  // bytes 32-48 stay zeroed (reserved)

  try {
    const fd = ensureFile();
    fs.appendFileSync(fd, buf);

    if (indexCache.recordCount === 0) indexCache.firstTs = row.ts;
    indexCache.lastTs = row.ts;
    indexCache.recordCount++;
    saveIndex(indexCache);
  } catch (e) {
    console.error('history write error:', e);
  }
}

// ── Read a single record at a given record index ────────────────────────────
function readRecordAt(fd: number, recordIndex: number): MetricRow | null {
  const buf = Buffer.alloc(RECORD_SIZE);
  const bytesRead = fs.readSync(fd, buf, 0, RECORD_SIZE, recordIndex * RECORD_SIZE);
  if (bytesRead < RECORD_SIZE) return null;

  const readOrNull = (offset: number) => {
    const v = buf.readFloatLE(offset);
    return v === NULL_SENTINEL ? null : v;
  };

  return {
    ts: buf.readDoubleLE(0),
    cpu_load: readOrNull(8),
    cpu_temp: readOrNull(12),
    mem_percent: readOrNull(16),
    gpu_load: readOrNull(20),
    gpu_temp: readOrNull(24),
    gpu_power: readOrNull(28),
  };
}

// ── Binary search for the first record >= targetTs ──────────────────────────
function findStartIndex(fd: number, targetTs: number, recordCount: number): number {
  let lo = 0, hi = recordCount - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    const rec = readRecordAt(fd, mid);
    if (!rec || rec.ts < targetTs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

// ── Downsample: average N consecutive records into 1 ────────────────────────
function downsample(rows: MetricRow[], maxPoints: number): MetricRow[] {
  if (rows.length <= maxPoints) return rows;

  const bucketSize = Math.ceil(rows.length / maxPoints);
  const result: MetricRow[] = [];

  for (let i = 0; i < rows.length; i += bucketSize) {
    const bucket = rows.slice(i, i + bucketSize);
    const avg = (key: keyof Omit<MetricRow, 'ts'>) => {
      const vals = bucket.map(r => r[key]).filter((v): v is number => v !== null);
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    result.push({
      ts: bucket[Math.floor(bucket.length / 2)].ts, // midpoint timestamp
      cpu_load: avg('cpu_load'),
      cpu_temp: avg('cpu_temp'),
      mem_percent: avg('mem_percent'),
      gpu_load: avg('gpu_load'),
      gpu_temp: avg('gpu_temp'),
      gpu_power: avg('gpu_power'),
    });
  }
  return result;
}

// ── Public read API ──────────────────────────────────────────────────────────
// range: minutes of history to return. maxPoints: downsample target for the frontend.
export function getHistory(minutes: number = 60, maxPoints: number = 300): MetricRow[] {
  try {
    if (!fs.existsSync(DATA_PATH) || indexCache.recordCount === 0) return [];

    const fd = fs.openSync(DATA_PATH, 'r');
    try {
      const cutoff = Date.now() - minutes * 60 * 1000;
      const startIdx = findStartIndex(fd, cutoff, indexCache.recordCount);

      const rows: MetricRow[] = [];
      for (let i = startIdx; i < indexCache.recordCount; i++) {
        const rec = readRecordAt(fd, i);
        if (rec) rows.push(rec);
      }

      return downsample(rows, maxPoints);
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    console.error('history read error:', e);
    return [];
  }
}

// ── Maintenance: prune records older than N days ────────────────────────────
// Rewrites the file without old records. Run occasionally, not on every write.
export function pruneOlderThan(days: number = 7) {
  try {
    if (!fs.existsSync(DATA_PATH) || indexCache.recordCount === 0) return;

    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    const fd = fs.openSync(DATA_PATH, 'r');
    const startIdx = findStartIndex(fd, cutoff, indexCache.recordCount);

    if (startIdx === 0) { fs.closeSync(fd); return; } // nothing to prune

    const keepCount = indexCache.recordCount - startIdx;
    const newBuf = Buffer.alloc(keepCount * RECORD_SIZE);
    fs.readSync(fd, newBuf, 0, keepCount * RECORD_SIZE, startIdx * RECORD_SIZE);
    fs.closeSync(fd);

    // Close cached handle before overwriting
    if (fileHandle !== null) { fs.closeSync(fileHandle); fileHandle = null; }

    fs.writeFileSync(DATA_PATH, newBuf);

    const firstRec = keepCount > 0 ? newBuf.readDoubleLE(0) : 0;
    indexCache = {
      recordCount: keepCount,
      firstTs: firstRec,
      lastTs: indexCache.lastTs,
    };
    saveIndex(indexCache);
    console.log(`history pruned: removed ${startIdx} records older than ${days}d`);
  } catch (e) {
    console.error('history prune error:', e);
  }
}

// ── Load existing history into memory on startup (for immediate graph fill) ──
export function getRecentForBoot(count: number = 60): MetricRow[] {
  try {
    if (!fs.existsSync(DATA_PATH) || indexCache.recordCount === 0) return [];
    const fd = fs.openSync(DATA_PATH, 'r');
    try {
      const start = Math.max(0, indexCache.recordCount - count);
      const rows: MetricRow[] = [];
      for (let i = start; i < indexCache.recordCount; i++) {
        const rec = readRecordAt(fd, i);
        if (rec) rows.push(rec);
      }
      return rows;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return [];
  }
}

export function getStats() {
  return {
    recordCount: indexCache.recordCount,
    firstTs: indexCache.firstTs,
    lastTs: indexCache.lastTs,
    fileSizeBytes: indexCache.recordCount * RECORD_SIZE,
  };
}

// ── Daily comparison: today so far vs trailing 7-day average ────────────────
interface DayAggregate {
  avg: number | null;
  max: number | null;
}

export interface DailyComparison {
  cpu_load: { today: DayAggregate; weekAvg: DayAggregate };
  cpu_temp: { today: DayAggregate; weekAvg: DayAggregate };
  mem_percent: { today: DayAggregate; weekAvg: DayAggregate };
  gpu_load: { today: DayAggregate; weekAvg: DayAggregate };
  gpu_temp: { today: DayAggregate; weekAvg: DayAggregate };
  sampleCount: { today: number; week: number };
}

function aggregate(rows: MetricRow[], key: keyof Omit<MetricRow, 'ts'>): DayAggregate {
  const vals = rows.map(r => r[key]).filter((v): v is number => v !== null);
  if (!vals.length) return { avg: null, max: null };
  return {
    avg: vals.reduce((a, b) => a + b, 0) / vals.length,
    max: Math.max(...vals),
  };
}

export function getDailyComparison(): DailyComparison {
  const now = Date.now();
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart = todayStart.getTime() - 7 * 24 * 60 * 60 * 1000;

  try {
    if (!fs.existsSync(DATA_PATH) || indexCache.recordCount === 0) {
      const empty = { avg: null, max: null };
      return {
        cpu_load: { today: empty, weekAvg: empty }, cpu_temp: { today: empty, weekAvg: empty },
        mem_percent: { today: empty, weekAvg: empty }, gpu_load: { today: empty, weekAvg: empty },
        gpu_temp: { today: empty, weekAvg: empty }, sampleCount: { today: 0, week: 0 },
      };
    }

    const fd = fs.openSync(DATA_PATH, 'r');
    try {
      const weekStartIdx = findStartIndex(fd, weekStart, indexCache.recordCount);
      const todayStartIdx = findStartIndex(fd, todayStart.getTime(), indexCache.recordCount);

      const weekRows: MetricRow[] = [];
      const todayRows: MetricRow[] = [];

      for (let i = weekStartIdx; i < indexCache.recordCount; i++) {
        const rec = readRecordAt(fd, i);
        if (!rec) continue;
        weekRows.push(rec);
        if (i >= todayStartIdx) todayRows.push(rec);
      }
      // "week average" should exclude today for a fair comparison
      const priorWeekRows = weekRows.slice(0, weekRows.length - todayRows.length);

      const keys: (keyof Omit<MetricRow, 'ts'>)[] = ['cpu_load', 'cpu_temp', 'mem_percent', 'gpu_load', 'gpu_temp'];
      const result: any = { sampleCount: { today: todayRows.length, week: priorWeekRows.length } };
      for (const k of keys) {
        result[k] = {
          today: aggregate(todayRows, k),
          weekAvg: aggregate(priorWeekRows.length ? priorWeekRows : weekRows, k),
        };
      }
      return result as DailyComparison;
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    console.error('daily comparison error:', e);
    const empty = { avg: null, max: null };
    return {
      cpu_load: { today: empty, weekAvg: empty }, cpu_temp: { today: empty, weekAvg: empty },
      mem_percent: { today: empty, weekAvg: empty }, gpu_load: { today: empty, weekAvg: empty },
      gpu_temp: { today: empty, weekAvg: empty }, sampleCount: { today: 0, week: 0 },
    };
  }
}

// ── Pick-a-day comparison: any two specific calendar days ───────────────────

function formatDateLocal(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseLocalDateStart(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
}

// Bulk-read a contiguous range of records in ONE syscall instead of one per record
function readRangeBulk(fd: number, startIdx: number, endIdx: number): MetricRow[] {
  const count = endIdx - startIdx;
  if (count <= 0) return [];
  const buf = Buffer.alloc(count * RECORD_SIZE);
  fs.readSync(fd, buf, 0, count * RECORD_SIZE, startIdx * RECORD_SIZE);

  const rows: MetricRow[] = [];
  for (let i = 0; i < count; i++) {
    const off = i * RECORD_SIZE;
    const readOrNull = (o: number) => {
      const v = buf.readFloatLE(off + o);
      return v === NULL_SENTINEL ? null : v;
    };
    rows.push({
      ts: buf.readDoubleLE(off + 0),
      cpu_load: readOrNull(8),
      cpu_temp: readOrNull(12),
      mem_percent: readOrNull(16),
      gpu_load: readOrNull(20),
      gpu_temp: readOrNull(24),
      gpu_power: readOrNull(28),
    });
  }
  return rows;
}

export interface DayStats {
  date: string;
  sampleCount: number;
  cpu_load: DayAggregate;
  cpu_temp: DayAggregate;
  mem_percent: DayAggregate;
  gpu_load: DayAggregate;
  gpu_temp: DayAggregate;
}

const EMPTY_DAY_STATS = (date: string): DayStats => ({
  date, sampleCount: 0,
  cpu_load: { avg: null, max: null }, cpu_temp: { avg: null, max: null },
  mem_percent: { avg: null, max: null }, gpu_load: { avg: null, max: null },
  gpu_temp: { avg: null, max: null },
});

// List which calendar days actually have data — powers the date picker dropdowns
export function getAvailableDays(maxDays: number = 30): { date: string; sampleCount: number }[] {
  try {
    if (!fs.existsSync(DATA_PATH) || indexCache.recordCount === 0) return [];
    const fd = fs.openSync(DATA_PATH, 'r');
    try {
      const results: { date: string; sampleCount: number }[] = [];
      const lastDay = new Date(indexCache.lastTs); lastDay.setHours(0, 0, 0, 0);
      let cursor = lastDay.getTime();

      for (let i = 0; i < maxDays && cursor >= indexCache.firstTs - 86400000; i++) {
        const dateStr = formatDateLocal(cursor);
        const dayStart = cursor;
        const dayEnd = cursor + 86400000;
        const startIdx = findStartIndex(fd, dayStart, indexCache.recordCount);
        const endIdx = findStartIndex(fd, dayEnd, indexCache.recordCount);
        const count = endIdx - startIdx;
        if (count > 0) results.push({ date: dateStr, sampleCount: count });
        cursor -= 86400000;
      }
      return results; // most recent first
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    console.error('getAvailableDays error:', e);
    return [];
  }
}

// Full stats for one specific calendar day (local time)
export function getDayStats(dateStr: string): DayStats {
  try {
    if (!fs.existsSync(DATA_PATH) || indexCache.recordCount === 0) return EMPTY_DAY_STATS(dateStr);
    const fd = fs.openSync(DATA_PATH, 'r');
    try {
      const dayStart = parseLocalDateStart(dateStr);
      const dayEnd = dayStart + 86400000;
      const startIdx = findStartIndex(fd, dayStart, indexCache.recordCount);
      const endIdx = findStartIndex(fd, dayEnd, indexCache.recordCount);
      const rows = readRangeBulk(fd, startIdx, endIdx);

      if (!rows.length) return EMPTY_DAY_STATS(dateStr);

      return {
        date: dateStr,
        sampleCount: rows.length,
        cpu_load: aggregate(rows, 'cpu_load'),
        cpu_temp: aggregate(rows, 'cpu_temp'),
        mem_percent: aggregate(rows, 'mem_percent'),
        gpu_load: aggregate(rows, 'gpu_load'),
        gpu_temp: aggregate(rows, 'gpu_temp'),
      };
    } finally {
      fs.closeSync(fd);
    }
  } catch (e) {
    console.error('getDayStats error:', e);
    return EMPTY_DAY_STATS(dateStr);
  }
}
