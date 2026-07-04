'use client';

import { useEffect, useState } from 'react';

const C = {
  bg: '#0a0c0a', bgCard: '#0d100d', bgInner: '#0b0f0b',
  border: '#1e2e1e', borderMid: '#2a3a2a',
  green: '#4ade80', greenDim: '#8bc88b', greenMuted: '#3a5a3a', greenFaint: '#141c14',
  amber: '#fbbf24', red: '#ef4444', cyan: '#22d3ee', purple: '#a78bfa',
  text: '#c8d8c0', textMuted: '#5a7a5a',
};

const API = 'http://127.0.0.1:3001';

// ── Types ──────────────────────────────────────────────────────────────────
interface EngineHealth {
  available: boolean;
  recordCount: number;
  fileSizeBytes: number;
  firstTs: number | null;
  lastTs: number | null;
  spanDays: number | null;
  writeRatePerMin: number | null;
  recordSizeBytes: number;
}

interface MetricRow {
  ts: number; cpu_load: number | null; cpu_temp: number | null; mem_percent: number | null;
  gpu_load: number | null; gpu_temp: number | null; gpu_power: number | null;
}

interface RecordPage { records: MetricRow[]; totalCount: number; page: number; pageSize: number; totalPages: number; }
interface FieldLayout { name: string; offset: number; sizeBytes: number; type: string; nullable: boolean; }
interface RecordLayout { recordSizeBytes: number; fields: FieldLayout[]; nullSentinel: number; }
interface BenchmarkResult {
  recordCount: number;
  binarySearch: { comparisons: number; timeMs: number };
  linearScan: { comparisons: number; timeMs: number };
  speedupFactor: number;
}
interface PrunePreview { recordsToDelete: number; recordsToKeep: number; oldestKept: number | null; bytesToFree: number; }

// ── Helpers ────────────────────────────────────────────────────────────────
function fmtBytes(b: number): string {
  if (b >= 1048576) return `${(b / 1048576).toFixed(2)} MB`;
  if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${b} B`;
}
function fmtDate(ts: number | null): string {
  if (ts == null) return '—';
  return new Date(ts).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit' });
}

// ── Section wrapper ──────────────────────────────────────────────────────
function Section({ title, accent, children }: { title: string; accent: string; children: React.ReactNode }) {
  return (
    <div style={{ background: C.bgCard, border: `1px solid ${C.border}`, marginBottom: '20px' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'8px', padding:'12px 16px', borderBottom:`1px solid ${C.border}` }}>
        <div style={{ width:'2px', height:'14px', background: accent }}/>
        <span style={{ fontSize:'10px', letterSpacing:'0.2em', color: accent, fontFamily:'monospace' }}>{title}</span>
      </div>
      <div style={{ padding:'16px' }}>{children}</div>
    </div>
  );
}

function StatBox({ label, value, color = C.text }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ border:`1px solid ${C.border}`, padding:'10px 12px' }}>
      <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.15em', fontFamily:'monospace', marginBottom:'4px' }}>{label}</div>
      <div style={{ fontSize:'16px', color, fontFamily:'monospace' }}>{value}</div>
    </div>
  );
}

// ── 1. Engine Health ─────────────────────────────────────────────────────
function EngineHealthSection() {
  const [health, setHealth] = useState<EngineHealth | null>(null);

  useEffect(() => {
    const fetchHealth = () => fetch(`${API}/syslite/health`).then(r => r.json()).then(setHealth).catch(() => {});
    fetchHealth();
    const i = setInterval(fetchHealth, 5000);
    return () => clearInterval(i);
  }, []);

  if (!health) return <div style={{ fontSize:'10px', color:C.greenMuted, fontFamily:'monospace' }}>LOADING...</div>;
  if (!health.available) return <div style={{ fontSize:'10px', color:C.textMuted, fontFamily:'monospace' }}>No data recorded yet.</div>;

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:'10px' }}>
      <StatBox label="TOTAL RECORDS" value={health.recordCount.toLocaleString()} color={C.green}/>
      <StatBox label="FILE SIZE" value={fmtBytes(health.fileSizeBytes)} color={C.cyan}/>
      <StatBox label="RECORD SIZE" value={`${health.recordSizeBytes} bytes`}/>
      <StatBox label="SPAN" value={health.spanDays != null ? `${health.spanDays.toFixed(1)} days` : '—'}/>
      <StatBox label="WRITE RATE" value={health.writeRatePerMin != null ? `~${health.writeRatePerMin}/min` : '—'} color={C.amber}/>
      <StatBox label="OLDEST RECORD" value={fmtDate(health.firstTs)}/>
      <StatBox label="NEWEST RECORD" value={fmtDate(health.lastTs)}/>
    </div>
  );
}

// ── 2. Data Browser ──────────────────────────────────────────────────────
function DataBrowserSection() {
  const [data, setData] = useState<RecordPage | null>(null);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/syslite/records?page=${page}&pageSize=25`)
      .then(r => r.json()).then(setData).catch(() => {}).finally(() => setLoading(false));
  }, [page]);

  const cols: { key: keyof MetricRow; label: string; unit: string; color: string }[] = [
    { key: 'cpu_load', label: 'CPU LOAD', unit: '%', color: C.green },
    { key: 'cpu_temp', label: 'CPU TEMP', unit: '°C', color: C.amber },
    { key: 'mem_percent', label: 'MEMORY', unit: '%', color: C.purple },
    { key: 'gpu_load', label: 'GPU LOAD', unit: '%', color: C.cyan },
    { key: 'gpu_temp', label: 'GPU TEMP', unit: '°C', color: C.red },
    { key: 'gpu_power', label: 'GPU POWER', unit: 'W', color: C.amber },
  ];

  return (
    <div>
      {loading && <div style={{ fontSize:'9px', color:C.greenMuted, fontFamily:'monospace', marginBottom:'8px' }}>LOADING...</div>}
      {data && data.records.length > 0 ? (
        <>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'monospace', fontSize:'10px' }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                  <th style={{ textAlign:'left', padding:'6px 8px', color:C.greenMuted, fontSize:'8px', letterSpacing:'0.1em' }}>TIMESTAMP</th>
                  {cols.map(c => (
                    <th key={c.key} style={{ textAlign:'right', padding:'6px 8px', color:C.greenMuted, fontSize:'8px', letterSpacing:'0.1em' }}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.records.map((r, i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.greenFaint}` }}>
                    <td style={{ padding:'5px 8px', color:C.text }}>{fmtDate(r.ts)}</td>
                    {cols.map(c => (
                      <td key={c.key} style={{ padding:'5px 8px', textAlign:'right', color: r[c.key] != null ? c.color : C.textMuted }}>
                        {r[c.key] != null ? `${(r[c.key] as number).toFixed(1)}${c.unit}` : '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:'12px' }}>
            <span style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace' }}>
              Page {data.page + 1} of {data.totalPages} · {data.totalCount.toLocaleString()} total records
            </span>
            <div style={{ display:'flex', gap:'6px' }}>
              <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0}
                style={{ fontSize:'9px', padding:'4px 10px', background:'none', border:`1px solid ${page===0?C.border:C.borderMid}`, color: page===0?C.greenMuted:C.text, cursor: page===0?'default':'pointer', fontFamily:'monospace' }}>← NEWER</button>
              <button onClick={() => setPage(p => p + 1)} disabled={data.page + 1 >= data.totalPages}
                style={{ fontSize:'9px', padding:'4px 10px', background:'none', border:`1px solid ${data.page+1>=data.totalPages?C.border:C.borderMid}`, color: data.page+1>=data.totalPages?C.greenMuted:C.text, cursor: data.page+1>=data.totalPages?'default':'pointer', fontFamily:'monospace' }}>OLDER →</button>
            </div>
          </div>
        </>
      ) : !loading && <div style={{ fontSize:'10px', color:C.textMuted, fontFamily:'monospace' }}>No records yet.</div>}
    </div>
  );
}

// ── 3. How It Works (generated from real layout) ────────────────────────
function HowItWorksSection() {
  const [layout, setLayout] = useState<RecordLayout | null>(null);

  useEffect(() => {
    fetch(`${API}/syslite/layout`).then(r => r.json()).then(setLayout).catch(() => {});
  }, []);

  if (!layout) return <div style={{ fontSize:'10px', color:C.greenMuted, fontFamily:'monospace' }}>LOADING...</div>;

  return (
    <div>
      <div style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace', marginBottom:'14px', lineHeight:1.6 }}>
        SYS.LITE stores each sample as a fixed-width <span style={{ color:C.green }}>{layout.recordSizeBytes}-byte</span> binary
        record, appended directly to a flat file. No parsing overhead, no JSON per record — just a buffer written straight to disk.
        This layout is read live from the actual running engine, so it always matches reality.
      </div>
      <div style={{ display:'flex', height:'40px', border:`1px solid ${C.border}`, marginBottom:'12px' }}>
        {layout.fields.map((f, i) => {
          const pct = (f.sizeBytes / layout.recordSizeBytes) * 100;
          const colors = [C.green, C.amber, C.purple, C.cyan, C.red, C.amber, C.greenMuted];
          return (
            <div key={i} style={{
              width: `${pct}%`, background: `${colors[i % colors.length]}20`,
              borderRight: i < layout.fields.length - 1 ? `1px solid ${C.border}` : 'none',
              display:'flex', alignItems:'center', justifyContent:'center', overflow:'hidden',
            }}>
              <span style={{ fontSize:'7px', color: colors[i % colors.length], fontFamily:'monospace', whiteSpace:'nowrap' }}>
                {f.sizeBytes}B
              </span>
            </div>
          );
        })}
      </div>
      <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'monospace', fontSize:'9px' }}>
        <thead>
          <tr style={{ borderBottom:`1px solid ${C.border}` }}>
            <th style={{ textAlign:'left', padding:'6px', color:C.greenMuted, fontSize:'8px' }}>FIELD</th>
            <th style={{ textAlign:'left', padding:'6px', color:C.greenMuted, fontSize:'8px' }}>OFFSET</th>
            <th style={{ textAlign:'left', padding:'6px', color:C.greenMuted, fontSize:'8px' }}>SIZE</th>
            <th style={{ textAlign:'left', padding:'6px', color:C.greenMuted, fontSize:'8px' }}>TYPE</th>
          </tr>
        </thead>
        <tbody>
          {layout.fields.map((f, i) => (
            <tr key={i} style={{ borderBottom:`1px solid ${C.greenFaint}` }}>
              <td style={{ padding:'6px', color:C.text }}>{f.name}</td>
              <td style={{ padding:'6px', color:C.textMuted }}>byte {f.offset}</td>
              <td style={{ padding:'6px', color:C.textMuted }}>{f.sizeBytes}B</td>
              <td style={{ padding:'6px', color:C.textMuted }}>{f.type}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ fontSize:'8px', color:C.textMuted, fontFamily:'monospace', marginTop:'10px' }}>
        Null sentinel value: {layout.nullSentinel} (used when a sensor reading isn't available)
      </div>
    </div>
  );
}

// ── 4. Performance ───────────────────────────────────────────────────────
function PerformanceSection() {
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [running, setRunning] = useState(false);

  const run = () => {
    setRunning(true);
    fetch(`${API}/syslite/benchmark`).then(r => r.json()).then(setResult).catch(() => {}).finally(() => setRunning(false));
  };

  return (
    <div>
      <div style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace', marginBottom:'12px', lineHeight:1.6 }}>
        Finds a record from the middle of your actual history using binary search (the real method SYS.LITE uses),
        compared against a naive linear scan from the start — on the same live data.
      </div>
      <button onClick={run} disabled={running} style={{ fontSize:'10px', padding:'8px 16px', background:'none', border:`1px solid ${C.green}`, color:C.green, cursor: running?'default':'pointer', fontFamily:'monospace', letterSpacing:'0.1em', marginBottom:'16px' }}>
        {running ? 'RUNNING...' : '▶ RUN BENCHMARK'}
      </button>
      {result && result.recordCount > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px' }}>
          <div style={{ border:`1px solid ${C.green}40`, padding:'12px' }}>
            <div style={{ fontSize:'8px', color:C.green, letterSpacing:'0.15em', fontFamily:'monospace', marginBottom:'8px' }}>BINARY SEARCH</div>
            <div style={{ fontSize:'20px', color:C.green, fontFamily:'monospace' }}>{result.binarySearch.timeMs.toFixed(3)}ms</div>
            <div style={{ fontSize:'8px', color:C.textMuted, fontFamily:'monospace', marginTop:'4px' }}>{result.binarySearch.comparisons} comparisons</div>
          </div>
          <div style={{ border:`1px solid ${C.red}40`, padding:'12px' }}>
            <div style={{ fontSize:'8px', color:C.red, letterSpacing:'0.15em', fontFamily:'monospace', marginBottom:'8px' }}>LINEAR SCAN</div>
            <div style={{ fontSize:'20px', color:C.red, fontFamily:'monospace' }}>{result.linearScan.timeMs.toFixed(3)}ms</div>
            <div style={{ fontSize:'8px', color:C.textMuted, fontFamily:'monospace', marginTop:'4px' }}>{result.linearScan.comparisons} comparisons</div>
          </div>
          <div style={{ gridColumn:'1 / -1', textAlign:'center', padding:'10px', border:`1px solid ${C.amber}40`, background:`${C.amber}08` }}>
            <span style={{ fontSize:'12px', color:C.amber, fontFamily:'monospace' }}>{result.speedupFactor.toFixed(1)}× faster</span>
            <span style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace', marginLeft:'8px' }}>across {result.recordCount.toLocaleString()} records</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ── 5. Maintenance ────────────────────────────────────────────────────────
function MaintenanceSection() {
  const [days, setDays] = useState(7);
  const [preview, setPreview] = useState<PrunePreview | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const fetchPreview = (d: number) => {
    fetch(`${API}/syslite/prune/preview?days=${d}`).then(r => r.json()).then(setPreview).catch(() => {});
  };

  useEffect(() => { fetchPreview(days); }, [days]);

  const executePrune = async () => {
    try {
      const res = await fetch(`${API}/syslite/prune/confirm`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ days, confirm: true }),
      });
      const data = await res.json();
      setResult(data.ok ? 'Prune completed successfully.' : `Failed: ${data.error}`);
      setConfirming(false);
      fetchPreview(days);
    } catch {
      setResult('Failed to reach backend.');
      setConfirming(false);
    }
  };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:'10px', marginBottom:'14px' }}>
        <span style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace' }}>Delete records older than</span>
        <input type="number" value={days} onChange={e => setDays(Math.max(1, Number(e.target.value)))}
          style={{ width:'50px', background:C.bgInner, border:`1px solid ${C.border}`, color:C.text, padding:'4px 6px', fontSize:'10px', fontFamily:'monospace', outline:'none' }}/>
        <span style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace' }}>days</span>
      </div>

      {preview && (
        <div style={{ border:`1px solid ${preview.recordsToDelete > 0 ? C.red+'40' : C.border}`, padding:'12px', marginBottom:'14px' }}>
          {preview.recordsToDelete > 0 ? (
            <>
              <div style={{ fontSize:'10px', color:C.red, fontFamily:'monospace', marginBottom:'6px' }}>
                This will permanently delete {preview.recordsToDelete.toLocaleString()} records ({fmtBytes(preview.bytesToFree)})
              </div>
              <div style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace' }}>
                {preview.recordsToKeep.toLocaleString()} records will remain, oldest kept: {fmtDate(preview.oldestKept)}
              </div>
            </>
          ) : (
            <div style={{ fontSize:'10px', color:C.greenMuted, fontFamily:'monospace' }}>Nothing to prune at this threshold.</div>
          )}
        </div>
      )}

      {preview && preview.recordsToDelete > 0 && !confirming && (
        <button onClick={() => setConfirming(true)} style={{ fontSize:'10px', padding:'8px 16px', background:'none', border:`1px solid ${C.red}`, color:C.red, cursor:'pointer', fontFamily:'monospace', letterSpacing:'0.1em' }}>
          DELETE {preview.recordsToDelete.toLocaleString()} RECORDS
        </button>
      )}

      {confirming && (
        <div style={{ border:`1px solid ${C.red}`, padding:'14px', background:`${C.red}08` }}>
          <div style={{ fontSize:'11px', color:C.red, fontFamily:'monospace', marginBottom:'12px', fontWeight:'bold' }}>
            ARE YOU SURE? This cannot be undone.
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={executePrune} style={{ fontSize:'9px', padding:'6px 14px', background:C.red, border:`1px solid ${C.red}`, color:C.bg, cursor:'pointer', fontFamily:'monospace', letterSpacing:'0.1em' }}>YES, DELETE PERMANENTLY</button>
            <button onClick={() => setConfirming(false)} style={{ fontSize:'9px', padding:'6px 14px', background:'none', border:`1px solid ${C.border}`, color:C.text, cursor:'pointer', fontFamily:'monospace', letterSpacing:'0.1em' }}>CANCEL</button>
          </div>
        </div>
      )}

      {result && <div style={{ fontSize:'9px', color:C.green, fontFamily:'monospace', marginTop:'12px' }}>{result}</div>}
    </div>
  );
}

// ── 6. Export ─────────────────────────────────────────────────────────────
function ExportSection() {
  const [csvRange, setCsvRange] = useState(1440); // minutes, default 24h

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'16px' }}>
      <div>
        <div style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace', marginBottom:'8px' }}>
          Export the raw binary file as-is — useful for backups or feeding into another tool.
        </div>
        <a href={`${API}/syslite/export/raw`} style={{ display:'inline-block', fontSize:'10px', padding:'8px 16px', background:'none', border:`1px solid ${C.cyan}`, color:C.cyan, textDecoration:'none', fontFamily:'monospace', letterSpacing:'0.1em' }}>
          ⬇ DOWNLOAD history.bin
        </a>
      </div>
      <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:'16px' }}>
        <div style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace', marginBottom:'8px' }}>
          Export a time range as CSV — opens in Excel, Google Sheets, or any spreadsheet tool.
        </div>
        <div style={{ display:'flex', gap:'8px', alignItems:'center' }}>
          <select value={csvRange} onChange={e => setCsvRange(Number(e.target.value))}
            style={{ background:C.bgInner, border:`1px solid ${C.border}`, color:C.text, fontSize:'9px', fontFamily:'monospace', padding:'6px 8px', outline:'none' }}>
            <option value={60}>Last 1 hour</option>
            <option value={360}>Last 6 hours</option>
            <option value={1440}>Last 24 hours</option>
            <option value={10080}>Last 7 days</option>
          </select>
          <a href={`${API}/syslite/export/csv?minutes=${csvRange}`} style={{ fontSize:'10px', padding:'8px 16px', background:'none', border:`1px solid ${C.green}`, color:C.green, textDecoration:'none', fontFamily:'monospace', letterSpacing:'0.1em' }}>
            ⬇ DOWNLOAD CSV
          </a>
        </div>
      </div>
    </div>
  );
}

// ── 7. Fun Stat ───────────────────────────────────────────────────────────
function FunStatSection() {
  const [health, setHealth] = useState<EngineHealth | null>(null);

  useEffect(() => {
    fetch(`${API}/syslite/health`).then(r => r.json()).then(setHealth).catch(() => {});
  }, []);

  if (!health || !health.available) return <div style={{ fontSize:'10px', color:C.textMuted, fontFamily:'monospace' }}>Not enough data yet.</div>;

  // Rough illustrative estimate — SQLite has per-row overhead (rowid, page headers, B-tree structure)
  // typically landing around 1.3-1.8x the raw data size for a simple numeric table. Not a real benchmark.
  const sqliteEstimate = health.fileSizeBytes * 1.5;

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'12px', marginBottom:'12px' }}>
        <div style={{ border:`1px solid ${C.green}40`, padding:'14px', textAlign:'center' }}>
          <div style={{ fontSize:'8px', color:C.green, letterSpacing:'0.15em', fontFamily:'monospace', marginBottom:'6px' }}>SYS.LITE (ACTUAL)</div>
          <div style={{ fontSize:'18px', color:C.green, fontFamily:'monospace' }}>{fmtBytes(health.fileSizeBytes)}</div>
        </div>
        <div style={{ border:`1px solid ${C.border}`, padding:'14px', textAlign:'center' }}>
          <div style={{ fontSize:'8px', color:C.textMuted, letterSpacing:'0.15em', fontFamily:'monospace', marginBottom:'6px' }}>SQLITE (ESTIMATED)</div>
          <div style={{ fontSize:'18px', color:C.textMuted, fontFamily:'monospace' }}>~{fmtBytes(sqliteEstimate)}</div>
        </div>
      </div>
      <div style={{ fontSize:'8px', color:C.textMuted, fontFamily:'monospace', lineHeight:1.6 }}>
        Illustrative estimate only, not a real benchmark — SQLite typically carries ~1.3-1.8× overhead per row
        versus raw fixed-width binary due to page headers and B-tree structure. Your actual mileage would depend
        on indexes, page size, and vacuum state.
      </div>
    </div>
  );
}

// ── 8. Peak Events — Hall of Fame (second table, uses secondary index) ────
interface PeakRow { ts: number; metric: number; value: number; metricName: string; }
const METRIC_DISPLAY: Record<string, { label: string; unit: string; color: string }> = {
  cpu_temp: { label: 'CPU TEMP', unit: '°C', color: C.amber },
  gpu_temp: { label: 'GPU TEMP', unit: '°C', color: C.red },
  cpu_load: { label: 'CPU LOAD', unit: '%', color: C.green },
  gpu_load: { label: 'GPU LOAD', unit: '%', color: C.cyan },
};

function PeakEventsSection() {
  const [metric, setMetric] = useState('gpu_temp');
  const [peaks, setPeaks] = useState<PeakRow[]>([]);
  const [current, setCurrent] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API}/syslite/peaks/current`).then(r => r.json()).then(setCurrent).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetch(`${API}/syslite/peaks?metric=${metric}&limit=10`)
      .then(r => r.json()).then(setPeaks).catch(() => {}).finally(() => setLoading(false));
  }, [metric]);

  const meta = METRIC_DISPLAY[metric];

  return (
    <div>
      <div style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace', marginBottom:'14px', lineHeight:1.6 }}>
        A second table, built on the same generic engine — logs only when a metric beats its previous session high.
        Sparse by design, and a real showcase for a secondary index: this list comes from a sorted index on <span style={{color:C.cyan}}>value</span>,
        not a scan of your whole metrics history.
      </div>

      <div style={{ display:'flex', gap:'6px', marginBottom:'14px' }}>
        {Object.entries(METRIC_DISPLAY).map(([key, m]) => (
          <button key={key} onClick={() => setMetric(key)} style={{
            fontSize:'9px', padding:'5px 10px', letterSpacing:'0.08em',
            background: metric===key ? `${m.color}20` : 'none',
            border:`1px solid ${metric===key ? m.color : C.border}`,
            color: metric===key ? m.color : C.textMuted,
            cursor:'pointer', fontFamily:'monospace',
          }}>{m.label}</button>
        ))}
      </div>

      {current[metric] != null && (
        <div style={{ marginBottom:'14px', padding:'10px 12px', border:`1px solid ${meta.color}40`, background:`${meta.color}08` }}>
          <span style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace' }}>Current session high: </span>
          <span style={{ fontSize:'12px', color:meta.color, fontFamily:'monospace' }}>{current[metric].toFixed(1)}{meta.unit}</span>
        </div>
      )}

      {loading ? (
        <div style={{ fontSize:'9px', color:C.greenMuted, fontFamily:'monospace' }}>LOADING...</div>
      ) : peaks.length > 0 ? (
        <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'monospace', fontSize:'10px' }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${C.border}` }}>
              <th style={{ textAlign:'left', padding:'6px 8px', color:C.greenMuted, fontSize:'8px' }}>#</th>
              <th style={{ textAlign:'left', padding:'6px 8px', color:C.greenMuted, fontSize:'8px' }}>WHEN</th>
              <th style={{ textAlign:'right', padding:'6px 8px', color:C.greenMuted, fontSize:'8px' }}>VALUE</th>
            </tr>
          </thead>
          <tbody>
            {peaks.map((p, i) => (
              <tr key={i} style={{ borderBottom:`1px solid ${C.greenFaint}` }}>
                <td style={{ padding:'5px 8px', color:C.textMuted }}>{i + 1}</td>
                <td style={{ padding:'5px 8px', color:C.text }}>{fmtDate(p.ts)}</td>
                <td style={{ padding:'5px 8px', textAlign:'right', color:meta.color }}>{p.value.toFixed(1)}{meta.unit}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div style={{ fontSize:'10px', color:C.textMuted, fontFamily:'monospace' }}>No peak events recorded yet — this fills in as your system runs.</div>
      )}
    </div>
  );
}

// ── 9. Query Console ───────────────────────────────────────────────────────
interface QueryExplain { usedIndex: boolean; indexField: string | null; recordsScanned: number; totalRecords: number; timeMs: number; }

function QueryConsoleSection() {
  const [filter, setFilter] = useState('value > 70');
  const [result, setResult] = useState<{ rows: any[]; explain: QueryExplain } | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');

  const run = async () => {
    setRunning(true);
    setError('');
    try {
      const res = await fetch(`${API}/syslite/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ table: 'peak_events', filter, limit: 50 }),
      });
      const data = await res.json();
      if (data.error) setError(data.error);
      else setResult(data);
    } catch {
      setError('Failed to reach backend.');
    }
    setRunning(false);
  };

  return (
    <div>
      <div style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace', marginBottom:'14px', lineHeight:1.6 }}>
        A small filter language, not real SQL — one field, one operator (&gt; &lt; &gt;= &lt;= ==), combined with AND/OR.
        Runs against the <span style={{color:C.cyan}}>peak_events</span> table. Try <code style={{color:C.green}}>value {'>'} 70</code> or <code style={{color:C.green}}>metric == 2</code> (2 = gpu_temp).
      </div>
      <div style={{ display:'flex', gap:'8px', marginBottom:'14px' }}>
        <input value={filter} onChange={e => setFilter(e.target.value)}
          style={{ flex:1, background:C.bgInner, border:`1px solid ${C.border}`, color:C.text, padding:'8px 10px', fontSize:'11px', fontFamily:'monospace', outline:'none' }}/>
        <button onClick={run} disabled={running} style={{ fontSize:'10px', padding:'8px 16px', background:'none', border:`1px solid ${C.green}`, color:C.green, cursor: running?'default':'pointer', fontFamily:'monospace', letterSpacing:'0.1em' }}>
          {running ? 'RUNNING...' : '▶ RUN'}
        </button>
      </div>

      {error && <div style={{ fontSize:'9px', color:C.red, fontFamily:'monospace', marginBottom:'12px' }}>{error}</div>}

      {result && (
        <>
          <div style={{ display:'flex', gap:'16px', marginBottom:'14px', padding:'10px 12px', border:`1px solid ${result.explain.usedIndex ? C.green+'40' : C.amber+'40'}`, background: result.explain.usedIndex ? `${C.green}08` : `${C.amber}08` }}>
            <span style={{ fontSize:'9px', color: result.explain.usedIndex ? C.green : C.amber, fontFamily:'monospace' }}>
              {result.explain.usedIndex ? `✓ USED INDEX (${result.explain.indexField})` : '⚠ FULL SCAN (no index used)'}
            </span>
            <span style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace' }}>{result.explain.recordsScanned} / {result.explain.totalRecords} records touched</span>
            <span style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace' }}>{result.explain.timeMs.toFixed(3)}ms</span>
          </div>

          {result.rows.length > 0 ? (
            <table style={{ width:'100%', borderCollapse:'collapse', fontFamily:'monospace', fontSize:'10px' }}>
              <thead>
                <tr style={{ borderBottom:`1px solid ${C.border}` }}>
                  <th style={{ textAlign:'left', padding:'6px 8px', color:C.greenMuted, fontSize:'8px' }}>TIMESTAMP</th>
                  <th style={{ textAlign:'left', padding:'6px 8px', color:C.greenMuted, fontSize:'8px' }}>METRIC</th>
                  <th style={{ textAlign:'right', padding:'6px 8px', color:C.greenMuted, fontSize:'8px' }}>VALUE</th>
                </tr>
              </thead>
              <tbody>
                {result.rows.map((r, i) => (
                  <tr key={i} style={{ borderBottom:`1px solid ${C.greenFaint}` }}>
                    <td style={{ padding:'5px 8px', color:C.text }}>{fmtDate(r.ts)}</td>
                    <td style={{ padding:'5px 8px', color:C.textMuted }}>{r.metric}</td>
                    <td style={{ padding:'5px 8px', textAlign:'right', color:C.green }}>{r.value?.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ fontSize:'10px', color:C.textMuted, fontFamily:'monospace' }}>No matching records.</div>
          )}
        </>
      )}
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function SysLitePage() {
  return (
    <>
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: ${C.bg}; }
        ::-webkit-scrollbar { width: 3px; height: 3px; }
        ::-webkit-scrollbar-track { background: ${C.bg}; }
        ::-webkit-scrollbar-thumb { background: ${C.borderMid}; }
      `}</style>
      <div style={{ minHeight:'100vh', background:C.bg, color:C.text, fontFamily:'monospace', padding:'24px' }}>
        <div style={{ maxWidth:'900px', margin:'0 auto' }}>

          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'24px' }}>
            <div>
              <div style={{ fontSize:'18px', color:C.green, letterSpacing:'0.2em', textShadow:`0 0 12px ${C.green}30` }}>SYS.LITE</div>
              <div style={{ fontSize:'9px', color:C.textMuted, letterSpacing:'0.1em', marginTop:'4px' }}>Custom time-series storage engine — internals & admin</div>
            </div>
            <a href="/" style={{ fontSize:'9px', color:C.textMuted, textDecoration:'none', border:`1px solid ${C.border}`, padding:'6px 12px', fontFamily:'monospace', letterSpacing:'0.1em' }}>← BACK TO DASHBOARD</a>
          </div>

          <Section title="ENGINE HEALTH" accent={C.green}><EngineHealthSection/></Section>
          <Section title="DATA BROWSER" accent={C.purple}><DataBrowserSection/></Section>
          <Section title="HOW IT WORKS" accent={C.cyan}><HowItWorksSection/></Section>
          <Section title="PERFORMANCE" accent={C.amber}><PerformanceSection/></Section>
          <Section title="MAINTENANCE" accent={C.red}><MaintenanceSection/></Section>
          <Section title="EXPORT" accent={C.cyan}><ExportSection/></Section>
          <Section title="PEAK EVENTS — HALL OF FAME" accent={C.red}><PeakEventsSection/></Section>
          <Section title="QUERY CONSOLE" accent={C.green}><QueryConsoleSection/></Section>
          <Section title="SYS.LITE VS SQLITE" accent={C.purple}><FunStatSection/></Section>

        </div>
      </div>
    </>
  );
}
