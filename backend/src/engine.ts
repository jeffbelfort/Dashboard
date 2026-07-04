// ── SYS.LITE Engine v2 ───────────────────────────────────────────────────
// A generic, schema-flexible table abstraction built on the same binary
// append-only pattern as the original metrics store, but reusable for any
// record shape. Adds write-ahead safety, secondary indexes, and a simple
// filter query language. Fully additive — the original metrics table in
// db.ts is untouched and keeps working exactly as before.

import fs from 'fs';
import path from 'path';

export interface FieldDef { name: string; size: 4 | 8; signed?: boolean }
export type Row = Record<string, number | null>;

const NULL_SENTINEL = -1;

export interface QueryExplain {
  usedIndex: boolean;
  indexField: string | null;
  recordsScanned: number;
  totalRecords: number;
  timeMs: number;
}

export interface QueryResult { rows: Row[]; explain: QueryExplain; }

interface Clause { field: string; op: '>' | '<' | '>=' | '<=' | '=='; value: number; }

// ── Tiny filter parser: "cpu_temp > 80 AND gpu_load < 50" ──────────────────
// Supports one combinator per query (all AND or all OR) to keep this simple
// and honest about its scope — it is not a SQL parser.
export function parseFilter(expr: string): { clauses: Clause[]; combinator: 'AND' | 'OR' } {
  const combinator: 'AND' | 'OR' = /\bOR\b/i.test(expr) ? 'OR' : 'AND';
  const parts = expr.split(/\bAND\b|\bOR\b/i).map(p => p.trim()).filter(Boolean);
  const clauses: Clause[] = [];
  const opRegex = /(>=|<=|==|>|<)/;
  for (const part of parts) {
    const m = part.match(opRegex);
    if (!m) continue;
    // split() with a capturing group returns [field, operator, value] — three
    // elements, not two. Grab field (first) and value (last) explicitly rather
    // than destructuring the first two, which was silently grabbing the
    // operator string itself as the value.
    const segments = part.split(opRegex).map(s => s.trim());
    const field = segments[0];
    const valueStr = segments[segments.length - 1];
    const op = m[1] as Clause['op'];
    const value = parseFloat(valueStr);
    if (field && !isNaN(value)) clauses.push({ field, op, value });
  }
  return { clauses, combinator };
}

function matchClause(row: Row, c: Clause): boolean {
  const v = row[c.field];
  if (v === null || v === undefined) return false;
  switch (c.op) {
    case '>': return v > c.value;
    case '<': return v < c.value;
    case '>=': return v >= c.value;
    case '<=': return v <= c.value;
    case '==': return v === c.value;
  }
}

function matchesFilter(row: Row, clauses: Clause[], combinator: 'AND' | 'OR'): boolean {
  if (!clauses.length) return true;
  return combinator === 'AND' ? clauses.every(c => matchClause(row, c)) : clauses.some(c => matchClause(row, c));
}

// ── Table ────────────────────────────────────────────────────────────────
export class Table {
  readonly name: string;
  readonly fields: FieldDef[];
  readonly recordSize: number;
  private dataPath: string;
  private metaPath: string;
  private idxDir: string;
  private meta: { recordCount: number; firstTs: number; lastTs: number };
  private offsets: Record<string, number> = {};

  constructor(name: string, fields: FieldDef[], dataDir: string = process.cwd()) {
    if (fields[0]?.name !== 'ts' || fields[0]?.size !== 8) {
      throw new Error(`Table '${name}': first field must be {name:'ts', size:8}`);
    }
    this.name = name;
    this.fields = fields;
    this.idxDir = dataDir;
    this.dataPath = path.join(dataDir, `${name}.tbl`);
    this.metaPath = path.join(dataDir, `${name}.tbl.meta.json`);

    let offset = 0;
    for (const f of fields) { this.offsets[f.name] = offset; offset += f.size; }
    this.recordSize = offset;

    this.meta = this.loadMeta();
    this.recoverFromTornWrite();
  }

  private loadMeta() {
    try { return JSON.parse(fs.readFileSync(this.metaPath, 'utf8')); }
    catch { return { recordCount: 0, firstTs: 0, lastTs: 0 }; }
  }

  private saveMeta() { fs.writeFileSync(this.metaPath, JSON.stringify(this.meta)); }

  // ── Write-ahead safety ────────────────────────────────────────────────
  // If the process died mid-write, the file's byte length won't be a clean
  // multiple of recordSize. Detect and truncate the torn partial record
  // rather than silently reading garbage or crashing on the next read.
  private recoverFromTornWrite(): { recovered: boolean; truncatedBytes: number } {
    if (!fs.existsSync(this.dataPath)) return { recovered: false, truncatedBytes: 0 };
    const size = fs.statSync(this.dataPath).size;
    const remainder = size % this.recordSize;
    if (remainder === 0) return { recovered: false, truncatedBytes: 0 };

    const cleanSize = size - remainder;
    const fd = fs.openSync(this.dataPath, 'r+');
    fs.ftruncateSync(fd, cleanSize);
    fs.closeSync(fd);
    console.warn(`SYS.LITE: table '${this.name}' had a torn write, truncated ${remainder} trailing bytes`);

    // Recompute meta from the now-clean file rather than trust stale meta
    this.meta.recordCount = cleanSize / this.recordSize;
    if (this.meta.recordCount > 0) {
      const fd2 = fs.openSync(this.dataPath, 'r');
      const first = this.readAt(fd2, 0);
      const last = this.readAt(fd2, this.meta.recordCount - 1);
      fs.closeSync(fd2);
      this.meta.firstTs = first?.ts as number ?? 0;
      this.meta.lastTs = last?.ts as number ?? 0;
    }
    this.saveMeta();
    return { recovered: true, truncatedBytes: remainder };
  }

  // ── Core I/O ────────────────────────────────────────────────────────────
  insert(row: Row) {
    const buf = Buffer.alloc(this.recordSize);
    for (const f of this.fields) {
      const off = this.offsets[f.name];
      const v = row[f.name] ?? NULL_SENTINEL;
      if (f.size === 8) buf.writeDoubleLE(v, off);
      else buf.writeFloatLE(v, off);
    }
    fs.appendFileSync(this.dataPath, buf);
    if (this.meta.recordCount === 0) this.meta.firstTs = row.ts as number;
    this.meta.lastTs = row.ts as number;
    this.meta.recordCount++;
    this.saveMeta();
  }

  readAt(fd: number, idx: number): Row | null {
    const buf = Buffer.alloc(this.recordSize);
    const bytesRead = fs.readSync(fd, buf, 0, this.recordSize, idx * this.recordSize);
    if (bytesRead < this.recordSize) return null;
    const row: Row = {};
    for (const f of this.fields) {
      const off = this.offsets[f.name];
      const v = f.size === 8 ? buf.readDoubleLE(off) : buf.readFloatLE(off);
      row[f.name] = v === NULL_SENTINEL ? null : v;
    }
    return row;
  }

  count(): number { return this.meta.recordCount; }
  getMeta() { return { ...this.meta, recordSizeBytes: this.recordSize, fileSizeBytes: this.meta.recordCount * this.recordSize }; }

  private binarySearchByTs(fd: number, targetTs: number): number {
    let lo = 0, hi = this.meta.recordCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const rec = this.readAt(fd, mid);
      if (!rec || (rec.ts as number) < targetTs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  // ── Secondary index ──────────────────────────────────────────────────
  // Sorted array of {value, recordIndex} for one field, persisted as JSON.
  // Fine at this project's scale (hundreds to low thousands of rows for a
  // sparse table like peak events); a huge table would want a real on-disk
  // B-tree, which is out of scope here.
  private indexPath(field: string) { return path.join(this.idxDir, `${this.name}.${field}.secidx.json`); }

  buildIndex(field: string): { entries: number } {
    if (this.meta.recordCount === 0) { fs.writeFileSync(this.indexPath(field), '[]'); return { entries: 0 }; }
    const fd = fs.openSync(this.dataPath, 'r');
    const entries: { value: number; idx: number }[] = [];
    for (let i = 0; i < this.meta.recordCount; i++) {
      const rec = this.readAt(fd, i);
      if (rec && rec[field] != null) entries.push({ value: rec[field] as number, idx: i });
    }
    fs.closeSync(fd);
    entries.sort((a, b) => a.value - b.value);
    fs.writeFileSync(this.indexPath(field), JSON.stringify(entries));
    return { entries: entries.length };
  }

  hasIndex(field: string): boolean { return fs.existsSync(this.indexPath(field)); }

  // Top-N by a field, using the secondary index (sorted, so this is just a slice)
  queryTopN(field: string, n: number, direction: 'desc' | 'asc' = 'desc'): QueryResult {
    const t0 = process.hrtime.bigint();
    if (this.meta.recordCount === 0) {
      return { rows: [], explain: { usedIndex: true, indexField: field, recordsScanned: 0, totalRecords: 0, timeMs: 0 } };
    }
    if (!this.hasIndex(field)) this.buildIndex(field);
    const entries: { value: number; idx: number }[] = JSON.parse(fs.readFileSync(this.indexPath(field), 'utf8'));
    const slice = direction === 'desc' ? entries.slice(-n).reverse() : entries.slice(0, n);
    const fd = fs.openSync(this.dataPath, 'r');
    const rows = slice.map(e => this.readAt(fd, e.idx)).filter((r): r is Row => r !== null);
    fs.closeSync(fd);
    const t1 = process.hrtime.bigint();
    return {
      rows,
      explain: { usedIndex: true, indexField: field, recordsScanned: slice.length, totalRecords: this.meta.recordCount, timeMs: Number(t1 - t0) / 1e6 },
    };
  }

  // ── Filter query ─────────────────────────────────────────────────────
  // Uses the secondary index automatically ONLY when the filter is a single
  // clause on an indexed field (the honest, limited case where a sorted
  // index genuinely helps without building a real query planner).
  query(filterExpr: string, limit: number = 100): QueryResult {
    const t0 = process.hrtime.bigint();
    const { clauses, combinator } = parseFilter(filterExpr);

    if (this.meta.recordCount === 0) {
      return { rows: [], explain: { usedIndex: false, indexField: null, recordsScanned: 0, totalRecords: 0, timeMs: 0 } };
    }

    if (clauses.length === 1 && this.hasIndex(clauses[0].field)) {
      const c = clauses[0];
      const entries: { value: number; idx: number }[] = JSON.parse(fs.readFileSync(this.indexPath(c.field), 'utf8'));
      const matches = entries.filter(e => {
        switch (c.op) {
          case '>': return e.value > c.value;
          case '<': return e.value < c.value;
          case '>=': return e.value >= c.value;
          case '<=': return e.value <= c.value;
          case '==': return e.value === c.value;
        }
      }).slice(0, limit);
      const fd = fs.openSync(this.dataPath, 'r');
      const rows = matches.map(e => this.readAt(fd, e.idx)).filter((r): r is Row => r !== null);
      fs.closeSync(fd);
      const t1 = process.hrtime.bigint();
      return {
        rows,
        explain: { usedIndex: true, indexField: c.field, recordsScanned: matches.length, totalRecords: this.meta.recordCount, timeMs: Number(t1 - t0) / 1e6 },
      };
    }

    // Full scan
    const fd = fs.openSync(this.dataPath, 'r');
    const rows: Row[] = [];
    let scanned = 0;
    for (let i = 0; i < this.meta.recordCount && rows.length < limit; i++) {
      const rec = this.readAt(fd, i);
      scanned++;
      if (rec && matchesFilter(rec, clauses, combinator)) rows.push(rec);
    }
    fs.closeSync(fd);
    const t1 = process.hrtime.bigint();
    return {
      rows,
      explain: { usedIndex: false, indexField: null, recordsScanned: scanned, totalRecords: this.meta.recordCount, timeMs: Number(t1 - t0) / 1e6 },
    };
  }

  getRange(startTs: number, endTs: number): Row[] {
    if (this.meta.recordCount === 0) return [];
    const fd = fs.openSync(this.dataPath, 'r');
    try {
      const startIdx = this.binarySearchByTs(fd, startTs);
      const endIdx = this.binarySearchByTs(fd, endTs);
      const rows: Row[] = [];
      for (let i = startIdx; i < endIdx; i++) {
        const rec = this.readAt(fd, i);
        if (rec) rows.push(rec);
      }
      return rows;
    } finally { fs.closeSync(fd); }
  }
}
