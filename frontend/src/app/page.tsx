'use client';

import { useEffect, useState, useCallback, useRef, memo } from 'react';
import { useRouter } from 'next/navigation';
import GridLayout from 'react-grid-layout';
const Grid = GridLayout as any;
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';


// ── Types ──────────────────────────────────────────────────────────────────
interface CpuData { load: number; cores: number[]; }
interface CpuTempData { main: number | null; cores: number[]; max: number | null; }
interface FanData { fan: number; rpm: number; }
interface MemData { used: number; total: number; percent: number; }
interface GpuData { model: string; load: number; memUsed: number; memTotal: number; memPercent: number; temp: number; powerDraw: number | null; powerLimit: number | null; }
interface DiskData { mount: string; type: string; used: number; size: number; percent: number; }
interface ProcessData { name: string; cpu: number; mem: number; pid: number; }
interface ContainerStat { name: string; cpu: number; memory: number; memUsed: number; memLimit: number; status: string; }
interface NetworkIface { iface: string; rxSec: number; txSec: number; rxTotal: number; txTotal: number; }
interface WeatherData { city?: string; temp: number; feelsLike: number; humidity: number; windspeed: number; weatherCode: number; description: string; }
interface SpotifyData { isPlaying: boolean; title: string | null; artist: string | null; album: string | null; albumArt: string | null; progressMs: number; durationMs: number; progressPercent: number; }
interface AlertData { type: string; value: number; threshold: number; message: string; }
interface HwinfoData {
  available: boolean;
  cpu: {
    tempAvg: number | null;
    packageTemp: number | null;
    power: number | null;
    coreTemps: { label: string; temp: number }[];
  };
  gpu: {
    temp: number | null;
    memJunctionTemp: number | null;
    load: number | null;
    memLoad: number | null;
    memUsagePct: number | null;
    clockMhz: number | null;
    memClockMhz: number | null;
    power: number | null;
    fanRpm: number | null;
    fanPct: number | null;
  };
  fans: { cpuFanRpm: number | null };
}

interface Metrics {
  cpu: CpuData; mem: MemData; gpu: GpuData | null; disk: DiskData[];
  processes: ProcessData[]; docker: ContainerStat[]; network: NetworkIface[];
  weather: WeatherData | null; cpuTemp: CpuTempData; fans: FanData[];
  spotify: SpotifyData | null; alerts: AlertData[]; hwinfo: HwinfoData | null; timestamp: number;
}
interface HistoryPoint { t: number; cpu: number; mem: number; gpuLoad: number; gpuTemp: number; cpuTemp: number; }

type WidgetKey = 'clock' | 'weather' | 'cpu' | 'cpuGraph' | 'memory' | 'memGraph' | 'gpu' | 'gpuGraph' | 'disk' | 'processes' | 'network' | 'docker' | 'spotify' | 'temps' | 'alerts' | 'hwinfo';

interface PageConfig {
  id: string;
  name: string;
  layout: any[];
  visible: Record<WidgetKey, boolean>;
}

interface DashSettings {
  pages: PageConfig[];
  currentPage: number;
  autoRotate: boolean;
  rotateInterval: number;
}

// ── Palette ────────────────────────────────────────────────────────────────
const C = {
  bg: '#0a0c0a', bgCard: '#0d100d', bgCardInner: '#0b0f0b',
  border: '#1e2e1e', borderMid: '#2a3a2a',
  green: '#4ade80', greenDim: '#8bc88b', greenMuted: '#3a5a3a', greenFaint: '#141c14',
  amber: '#fbbf24', amberDim: '#c8a850',
  purple: '#a78bfa', purpleDim: '#7a6ab0',
  pink: '#f472b6', blue: '#38bdf8', red: '#ef4444', orange: '#fb923c',
  cyan: '#22d3ee',
  text: '#c8d8c0', textMuted: '#5a7a5a',
};

const WEATHER_ICONS: Record<number, string> = {
  0:'☀️',1:'🌤️',2:'⛅',3:'☁️',45:'🌫️',48:'🌫️',51:'🌦️',53:'🌦️',55:'🌧️',
  61:'🌧️',63:'🌧️',65:'🌧️',71:'🌨️',73:'❄️',75:'❄️',80:'🌦️',81:'🌧️',
  82:'⛈️',95:'⛈️',96:'⛈️',99:'⛈️',
};

const IGNORED_IFACES = ['loopback','lo','docker','veth','br-','virbr'];
const IGNORED_PROCS = ['system idle process', 'idle'];
const STORAGE_KEY = 'sysmonitor-v6';
const HISTORY_LEN = 60;

const ALL_WIDGETS: WidgetKey[] = ['clock','weather','cpu','cpuGraph','memory','memGraph','gpu','gpuGraph','disk','processes','network','docker','spotify','temps','alerts','hwinfo'];

const WIDGET_META: Record<WidgetKey, { label: string; accent: string }> = {
  clock:    { label: 'CLOCK',      accent: C.greenDim },
  weather:  { label: 'WEATHER',    accent: C.amber },
  cpu:      { label: 'CPU',        accent: C.green },
  cpuGraph: { label: 'CPU GRAPH',  accent: C.green },
  memory:   { label: 'MEMORY',     accent: C.purple },
  memGraph: { label: 'MEM GRAPH',  accent: C.purple },
  gpu:      { label: 'GPU',        accent: C.orange },
  gpuGraph: { label: 'GPU GRAPH',  accent: C.orange },
  disk:     { label: 'DISK',       accent: C.blue },
  processes:{ label: 'PROCESSES',  accent: C.amber },
  network:  { label: 'NETWORK',    accent: C.blue },
  docker:   { label: 'DOCKER',     accent: C.pink },
  spotify:  { label: 'SPOTIFY',    accent: C.cyan },
  temps:    { label: 'TEMPS & FANS', accent: C.red },
  alerts:   { label: 'ALERTS',     accent: C.red },
  hwinfo:   { label: 'HWINFO',      accent: C.cyan },
};

const makeDefaultVisible = (on: WidgetKey[]): Record<WidgetKey, boolean> =>
  Object.fromEntries(ALL_WIDGETS.map(k => [k, on.includes(k)])) as Record<WidgetKey, boolean>;

const DEFAULT_PAGE_1: PageConfig = {
  id: 'p1', name: 'PAGE 1',
  layout: [
    { i: 'clock',    x: 0, y: 0, w: 3, h: 4, minW:1, minH:1 },
    { i: 'weather',  x: 3, y: 0, w: 3, h: 5, minW:1, minH:1 },
    { i: 'cpu',      x: 6, y: 0, w: 3, h: 6, minW:1, minH:1 },
    { i: 'memory',   x: 9, y: 0, w: 3, h: 6, minW:1, minH:1 },
    { i: 'gpu',      x: 0, y: 4, w: 3, h: 6, minW:1, minH:1 },
    { i: 'disk',     x: 3, y: 5, w: 3, h: 5, minW:1, minH:1 },
    { i: 'processes',x: 6, y: 6, w: 3, h: 6, minW:1, minH:1 },
    { i: 'docker',   x: 9, y: 6, w: 3, h: 6, minW:1, minH:1 },
  ],
  visible: makeDefaultVisible(['clock','weather','cpu','memory','gpu','disk','processes','docker']),
};

const DEFAULT_PAGE_2: PageConfig = {
  id: 'p2', name: 'PAGE 2',
  layout: [
    { i: 'cpuGraph', x: 0, y: 0, w: 6, h: 6, minW:2, minH:3 },
    { i: 'memGraph', x: 6, y: 0, w: 6, h: 6, minW:2, minH:3 },
    { i: 'gpuGraph', x: 0, y: 6, w: 6, h: 6, minW:2, minH:3 },
    { i: 'network',  x: 6, y: 6, w: 6, h: 6, minW:2, minH:3 },
    { i: 'temps',    x: 0, y: 12, w: 4, h: 6, minW:2, minH:3 },
    { i: 'spotify',  x: 4, y: 12, w: 4, h: 6, minW:2, minH:3 },
    { i: 'alerts',   x: 8, y: 12, w: 4, h: 6, minW:2, minH:3 },
    { i: 'hwinfo',   x: 0, y: 18, w: 6, h: 8, minW:2, minH:3 },
  ],
  visible: makeDefaultVisible(['cpuGraph','memGraph','gpuGraph','network','temps','spotify','alerts','hwinfo']),
};

const DEFAULT_SETTINGS: DashSettings = {
  pages: [DEFAULT_PAGE_1, DEFAULT_PAGE_2],
  currentPage: 0,
  autoRotate: false,
  rotateInterval: 15,
};

// ── Helpers ────────────────────────────────────────────────────────────────
const fmtBytes = (b: number) => b >= 1073741824 ? `${(b/1073741824).toFixed(1)} GB` : `${(b/1048576).toFixed(0)} MB`;
const fmtSpeed = (b: number) => b >= 1048576 ? `${(b/1048576).toFixed(1)} MB/s` : b >= 1024 ? `${(b/1024).toFixed(1)} KB/s` : `${Math.round(b)} B/s`;
const fmtTotal = (b: number) => b >= 1073741824 ? `${(b/1073741824).toFixed(2)} GB` : b >= 1048576 ? `${(b/1048576).toFixed(1)} MB` : `${(b/1024).toFixed(0)} KB`;
const fmtMs = (ms: number) => { const s = Math.floor(ms/1000); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; };
const loadColor = (p: number) => p < 60 ? C.green : p < 80 ? C.amber : C.red;
const tempColor = (t: number) => t < 60 ? C.green : t < 80 ? C.amber : C.red;

// ── Chart Tooltip ──────────────────────────────────────────────────────────
const ChartTip = ({ active, payload }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background:C.bgCard, border:`1px solid ${C.border}`, padding:'4px 8px', fontSize:'10px', fontFamily:'monospace' }}>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ color:p.color }}>{p.name}: {typeof p.value === 'number' ? p.value.toFixed(1) : p.value}</div>
      ))}
    </div>
  );
};

// ── Gauge ──────────────────────────────────────────────────────────────────
function Gauge({ value, color=C.green, label, size=80 }: { value:number; color?:string; label?:string; size?:number }) {
  const r = size/2 - 7, circ = 2*Math.PI*r, pct = Math.min(value/100,1);
  const col = color===C.green ? loadColor(value) : color;
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:'3px' }}>
      <div style={{ position:'relative', width:size, height:size }}>
        <svg width={size} height={size} style={{ transform:'rotate(-90deg)' }}>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={C.greenFaint} strokeWidth="5"/>
          <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth="5"
            strokeDasharray={`${pct*circ} ${circ-pct*circ}`}
            style={{ transition:'stroke-dasharray 0.6s ease,stroke 0.4s ease' }}/>
        </svg>
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
          <span style={{ fontSize:'11px', color:col, fontFamily:'monospace' }}>{Math.round(value)}%</span>
        </div>
      </div>
      {label && <span style={{ fontSize:'9px', color:C.greenMuted, letterSpacing:'0.12em', textTransform:'uppercase', fontFamily:'monospace' }}>{label}</span>}
    </div>
  );
}

// ── Bar ────────────────────────────────────────────────────────────────────
function Bar({ value, label, color }: { value:number; label?:string; color?:string }) {
  const pct = Math.min(value,100), col = color ?? loadColor(pct);
  return (
    <div style={{ width:'100%' }}>
      {label && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'2px' }}>
        <span style={{ fontSize:'9px', color:C.greenMuted, fontFamily:'monospace' }}>{label}</span>
        <span style={{ fontSize:'9px', color:col, fontFamily:'monospace' }}>{Math.round(pct)}%</span>
      </div>}
      <div style={{ width:'100%', height:'3px', background:C.greenFaint }}>
        <div style={{ height:'100%', width:`${pct}%`, background:col, transition:'width 0.5s ease' }}/>
      </div>
    </div>
  );
}

// ── Card ───────────────────────────────────────────────────────────────────
function Card({ title, accent=C.green, children, onClose, isDragging, flash }: {
  title:string; accent?:string; children:React.ReactNode; onClose?:()=>void; isDragging?:boolean; flash?:boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background:C.bgCard,
        border:`1px solid ${isDragging ? accent : flash ? C.red : hovered ? C.borderMid : C.border}`,
        height:'100%', display:'flex', flexDirection:'column',
        transition:'border-color 0.15s', boxSizing:'border-box',
        boxShadow: flash ? `0 0 12px ${C.red}30` : isDragging ? `0 0 20px ${accent}15` : 'none',
        overflow:'hidden',
      }}>
      <div className="drag-handle" style={{
        display:'flex', alignItems:'center', justifyContent:'space-between',
        padding:'7px 11px', borderBottom:`1px solid ${C.border}`,
        cursor:'grab', userSelect:'none', flexShrink:0,
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:'7px' }}>
          <div style={{ width:'2px', height:'12px', background: flash ? C.red : accent, flexShrink:0 }}/>
          <span style={{ fontSize:'9px', letterSpacing:'0.2em', textTransform:'uppercase', color: flash ? C.red : accent, fontFamily:'monospace' }}>{title}</span>
          {flash && <span style={{ fontSize:'8px', color:C.red, fontFamily:'monospace', animation:'pulse 1s infinite' }}>⚠</span>}
        </div>
        <button
          onClick={e => { e.stopPropagation(); onClose?.(); }}
          style={{
            background:'none', border:'none', color:C.greenMuted, cursor:'pointer',
            fontSize:'11px', padding:'0 2px', lineHeight:1, fontFamily:'monospace',
            opacity: hovered ? 1 : 0, transition:'opacity 0.15s',
          }}>✕</button>
      </div>
      <div style={{ flex:1, padding:'11px', overflow:'hidden', minHeight:0 }}>{children}</div>
    </div>
  );
}

// ── Widget Contents ─────────────────────────────────────────────────────────

function ClockContent() {
  const [time, setTime] = useState('');
  const [date, setDate] = useState('');
  useEffect(() => {
    const up = () => {
      const n = new Date();
      setTime(n.toLocaleTimeString('en-GB',{hour12:false}));
      setDate(n.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long'}));
    };
    up(); const i = setInterval(up,1000); return ()=>clearInterval(i);
  },[]);
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:'5px' }}>
      <div style={{ fontSize:'clamp(24px,3.5vw,40px)', color:C.green, letterSpacing:'0.15em', fontFamily:'monospace', textShadow:`0 0 12px ${C.green}40`, lineHeight:1 }}>{time}</div>
      <div style={{ fontSize:'9px', color:C.greenMuted, letterSpacing:'0.2em', textTransform:'uppercase', fontFamily:'monospace' }}>{date}</div>
    </div>
  );
}

function WeatherContent({ data, onSendMessage }: { data:WeatherData|null; onSendMessage:(msg:object)=>void }) {
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('sysmonitor-location');
      if (saved) { const l = JSON.parse(saved); setCity(l.city); setLat(String(l.lat)); setLon(String(l.lon)); }
    } catch {}
  }, []);

  const save = () => {
    const parsed = { city: city.trim(), lat: parseFloat(lat), lon: parseFloat(lon) };
    if (!parsed.city || isNaN(parsed.lat) || isNaN(parsed.lon)) return;
    localStorage.setItem('sysmonitor-location', JSON.stringify(parsed));
    onSendMessage({ type: 'setLocation', ...parsed });
    setEditing(false);
  };

  const displayCity = (data as any)?.city ?? city ?? 'Unknown';

  if (editing) {
    return (
      <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
        <div style={{ fontSize:'9px', color:C.amber, letterSpacing:'0.15em', fontFamily:'monospace' }}>LOCATION SETTINGS</div>
        {[['CITY', city, setCity, 'Sheffield'],['LAT', lat, setLat, '53.3811'],['LON', lon, setLon, '-1.4701']].map(([label, val, setter, ph])=>(
          <div key={label as string}>
            <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.1em', marginBottom:'3px', fontFamily:'monospace' }}>{label as string}</div>
            <input
              value={val as string}
              onChange={e => (setter as (v:string)=>void)(e.target.value)}
              placeholder={ph as string}
              style={{ width:'100%', background:C.bgCardInner, border:`1px solid ${C.border}`, color:C.text, padding:'4px 6px', fontSize:'10px', fontFamily:'monospace', outline:'none' }}
            />
          </div>
        ))}
        <div style={{ display:'flex', gap:'6px', marginTop:'2px' }}>
          <button onClick={save} style={{ flex:1, fontSize:'9px', padding:'4px', border:`1px solid ${C.green}`, color:C.green, background:'none', cursor:'pointer', fontFamily:'monospace', letterSpacing:'0.12em' }}>SAVE</button>
          <button onClick={()=>setEditing(false)} style={{ flex:1, fontSize:'9px', padding:'4px', border:`1px solid ${C.border}`, color:C.greenMuted, background:'none', cursor:'pointer', fontFamily:'monospace', letterSpacing:'0.12em' }}>CANCEL</button>
        </div>
        <div style={{ fontSize:'8px', color:C.textMuted, fontFamily:'monospace' }}>Find lat/lon at latlong.net</div>
      </div>
    );
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between' }}>
        <div>
          {!data
            ? <div style={{ color:C.greenMuted, fontSize:'10px', fontFamily:'monospace' }}>FETCHING...</div>
            : <>
                <div style={{ fontSize:'clamp(20px,3vw,30px)', color:C.amber, textShadow:`0 0 8px ${C.amber}30`, fontFamily:'monospace', lineHeight:1 }}>{Math.round(data.temp)}°C</div>
                <div style={{ fontSize:'9px', color:C.greenMuted, letterSpacing:'0.12em', textTransform:'uppercase', marginTop:'3px', fontFamily:'monospace' }}>{data.description}</div>
                <div style={{ fontSize:'8px', color:C.textMuted, letterSpacing:'0.1em', marginTop:'2px', fontFamily:'monospace' }}>{displayCity}</div>
              </>
          }
        </div>
        <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:'4px' }}>
          {data && <div style={{ fontSize:'24px' }}>{WEATHER_ICONS[data.weatherCode]??'🌡️'}</div>}
          <button onClick={()=>setEditing(true)} style={{ fontSize:'9px', color:C.textMuted, background:'none', border:`1px solid ${C.border}`, padding:'2px 6px', cursor:'pointer', fontFamily:'monospace', letterSpacing:'0.1em' }}>⚙</button>
        </div>
      </div>
      {data && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'4px', paddingTop:'7px', borderTop:`1px solid ${C.border}` }}>
          {([['FEELS',`${Math.round(data.feelsLike)}°`],['HUMID',`${data.humidity}%`],['WIND',`${Math.round(data.windspeed)}mph`]] as [string,string][]).map(([k,v])=>(
            <div key={k} style={{ textAlign:'center' }}>
              <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.1em', fontFamily:'monospace' }}>{k}</div>
              <div style={{ fontSize:'12px', color:C.amberDim, marginTop:'2px', fontFamily:'monospace' }}>{v}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CpuContent({ data }: { data:CpuData|null }) {
  const load = data?.load??0, cores = data?.cores??[];
  return (
    <div style={{ display:'flex', gap:'10px', alignItems:'flex-start', height:'100%' }}>
      <Gauge value={load} label="LOAD" size={68}/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'4px' }}>
        {cores.slice(0,8).map((c,i)=><Bar key={i} value={c} label={`C${i}`}/>)}
        {cores.length>8 && <span style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace' }}>+{cores.length-8} MORE</span>}
      </div>
    </div>
  );
}

function CpuGraphContent({ history }: { history:HistoryPoint[] }) {
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', gap:'4px' }}>
      <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.12em', fontFamily:'monospace', flexShrink:0 }}>CPU LOAD % — LAST 60 SAMPLES</div>
      <div style={{ flex:1, minHeight:0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{top:4,right:4,left:-20,bottom:0}}>
            <defs>
              <linearGradient id="cg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.green} stopOpacity={0.25}/>
                <stop offset="95%" stopColor={C.green} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 6" stroke={C.greenFaint} vertical={false}/>
            <XAxis dataKey="t" hide/>
            <YAxis domain={[0,100]} tick={{fontSize:8,fill:C.greenMuted,fontFamily:'monospace'}} tickLine={false} axisLine={false}/>
            <Tooltip content={<ChartTip/>}/>
            <Area type="monotone" dataKey="cpu" stroke={C.green} fill="url(#cg)" strokeWidth={1.5} dot={false} name="CPU%" isAnimationActive={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function MemContent({ data }: { data:MemData|null }) {
  const pct = data?.percent??0;
  return (
    <div style={{ display:'flex', gap:'10px', alignItems:'center', height:'100%' }}>
      <Gauge value={pct} color={C.purple} label="USED" size={68}/>
      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'8px' }}>
        {([['USED',data?fmtBytes(data.used):'—',C.purple],['TOTAL',data?fmtBytes(data.total):'—',C.purpleDim],['FREE',data?fmtBytes((data.total||0)-(data.used||0)):'—',C.greenMuted]] as [string,string,string][]).map(([k,v,col])=>(
          <div key={k}>
            <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.1em', textTransform:'uppercase', fontFamily:'monospace' }}>{k}</div>
            <div style={{ fontSize:'13px', color:col, fontFamily:'monospace' }}>{v}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MemGraphContent({ history }: { history:HistoryPoint[] }) {
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', gap:'4px' }}>
      <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.12em', fontFamily:'monospace', flexShrink:0 }}>MEMORY USAGE % — LAST 60 SAMPLES</div>
      <div style={{ flex:1, minHeight:0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={history} margin={{top:4,right:4,left:-20,bottom:0}}>
            <defs>
              <linearGradient id="mg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={C.purple} stopOpacity={0.25}/>
                <stop offset="95%" stopColor={C.purple} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="2 6" stroke={C.greenFaint} vertical={false}/>
            <XAxis dataKey="t" hide/>
            <YAxis domain={[0,100]} tick={{fontSize:8,fill:C.greenMuted,fontFamily:'monospace'}} tickLine={false} axisLine={false}/>
            <Tooltip content={<ChartTip/>}/>
            <Area type="monotone" dataKey="mem" stroke={C.purple} fill="url(#mg)" strokeWidth={1.5} dot={false} name="MEM%" isAnimationActive={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function GpuContent({ data }: { data:GpuData|null }) {
  if (!data) return <div style={{ textAlign:'center', color:C.greenMuted, fontSize:'10px', fontFamily:'monospace', paddingTop:'8px' }}>NO GPU DATA</div>;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
      <div style={{ fontSize:'9px', color:C.orange, letterSpacing:'0.06em', fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{data.model}</div>
      <div style={{ display:'flex', gap:'10px', alignItems:'center' }}>
        <Gauge value={data.load} color={C.orange} label="LOAD" size={68}/>
        <div style={{ flex:1, display:'flex', flexDirection:'column', gap:'6px' }}>
          <div>
            <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.1em', fontFamily:'monospace' }}>VRAM USAGE</div>
            <div style={{ fontSize:'11px', color:C.orange, fontFamily:'monospace' }}>{data.memPercent.toFixed(1)}%</div>
            <Bar value={data.memPercent} color={C.orange}/>
          </div>
          <div style={{ display:'flex', gap:'12px' }}>
            <div>
              <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.1em', fontFamily:'monospace' }}>TEMP</div>
              <div style={{ fontSize:'16px', color:tempColor(data.temp), fontFamily:'monospace', lineHeight:1 }}>{data.temp.toFixed(1)}°C</div>
            </div>
            {data.powerDraw != null && (
              <div>
                <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.1em', fontFamily:'monospace' }}>POWER</div>
                <div style={{ fontSize:'14px', color:C.amber, fontFamily:'monospace', lineHeight:1 }}>
                  {data.powerDraw.toFixed(1)}W{data.powerLimit ? `/${data.powerLimit.toFixed(0)}W` : ''}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function GpuGraphContent({ history }: { history:HistoryPoint[] }) {
  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', gap:'4px' }}>
      <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.12em', fontFamily:'monospace', flexShrink:0 }}>GPU LOAD & TEMP — LAST 60 SAMPLES</div>
      <div style={{ flex:1, minHeight:0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={history} margin={{top:4,right:4,left:-20,bottom:0}}>
            <CartesianGrid strokeDasharray="2 6" stroke={C.greenFaint} vertical={false}/>
            <XAxis dataKey="t" hide/>
            <YAxis tick={{fontSize:8,fill:C.greenMuted,fontFamily:'monospace'}} tickLine={false} axisLine={false}/>
            <Tooltip content={<ChartTip/>}/>
            <Line type="monotone" dataKey="gpuLoad" stroke={C.orange} strokeWidth={1.5} dot={false} name="Load%" isAnimationActive={false}/>
            <Line type="monotone" dataKey="gpuTemp" stroke={C.red} strokeWidth={1.5} dot={false} name="Temp°C" isAnimationActive={false}/>
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function DiskContent({ data }: { data:DiskData[] }) {
  if (!data.length) return <div style={{ textAlign:'center', color:C.greenMuted, fontSize:'10px', fontFamily:'monospace' }}>NO DISKS</div>;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
      {data.map(d=>(
        <div key={d.mount}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'3px' }}>
            <span style={{ fontSize:'9px', color:C.blue, fontFamily:'monospace', letterSpacing:'0.1em' }}>{d.mount}</span>
            <span style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace' }}>{fmtBytes(d.used)} / {fmtBytes(d.size)}</span>
          </div>
          <Bar value={d.percent} color={C.blue}/>
        </div>
      ))}
    </div>
  );
}

function ProcessContent({ data }: { data:ProcessData[] }) {
  const [sortBy, setSortBy] = useState<'cpu'|'mem'>('cpu');
  const filtered = data
    .filter(p=>!IGNORED_PROCS.includes(p.name.toLowerCase()))
    .sort((a,b) => sortBy === 'cpu' ? b.cpu - a.cpu : b.mem - a.mem);
  if (!filtered.length) return <div style={{ textAlign:'center', color:C.greenMuted, fontSize:'10px', fontFamily:'monospace' }}>NO DATA</div>;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'0px', height:'100%', overflow:'hidden' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 50px 50px 42px', gap:'4px', marginBottom:'4px', paddingBottom:'4px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <span style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.1em', fontFamily:'monospace' }}>PROCESS</span>
        {(['CPU','MEM'] as const).map(h=>(
          <span key={h} onClick={()=>setSortBy(h.toLowerCase() as 'cpu'|'mem')} style={{ fontSize:'8px', color:sortBy===h.toLowerCase()?C.amber:C.greenMuted, letterSpacing:'0.1em', fontFamily:'monospace', cursor:'pointer', textDecoration:sortBy===h.toLowerCase()?'underline':'none' }}>{h}▼</span>
        ))}
        <span style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.1em', fontFamily:'monospace' }}>PID</span>
      </div>
      {filtered.slice(0,10).map((p,i)=>(
        <div key={p.pid} style={{ display:'grid', gridTemplateColumns:'1fr 50px 50px 42px', gap:'4px', padding:'2px 0', borderBottom:`1px solid ${C.greenFaint}` }}>
          <span style={{ fontSize:'9px', color:i===0?C.amber:C.text, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
          <span style={{ fontSize:'9px', color:loadColor(p.cpu), fontFamily:'monospace' }}>{p.cpu.toFixed(1)}%</span>
          <span style={{ fontSize:'9px', color:C.purple, fontFamily:'monospace' }}>{p.mem.toFixed(1)}%</span>
          <span style={{ fontSize:'9px', color:C.greenMuted, fontFamily:'monospace' }}>{p.pid}</span>
        </div>
      ))}
    </div>
  );
}

function NetworkContent({ data }: { data:NetworkIface[]|null }) {
  const ifaces = (data??[]).filter(i=>!IGNORED_IFACES.some(ig=>i.iface.toLowerCase().startsWith(ig)));
  if (!ifaces.length) return <div style={{ textAlign:'center', color:C.greenMuted, fontSize:'10px', fontFamily:'monospace' }}>NO INTERFACES</div>;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
      {ifaces.map(iface=>(
        <div key={iface.iface}>
          <div style={{ fontSize:'8px', color:C.blue, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:'5px', fontFamily:'monospace' }}>{iface.iface}</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'6px' }}>
            {([['↓ RX',fmtSpeed(iface.rxSec),C.green,fmtTotal(iface.rxTotal)],['↑ TX',fmtSpeed(iface.txSec),C.amber,fmtTotal(iface.txTotal)]] as [string,string,string,string][]).map(([dir,speed,col,total])=>(
              <div key={dir}>
                <div style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace' }}>{dir}</div>
                <div style={{ fontSize:'12px', color:col, fontFamily:'monospace' }}>{speed}</div>
                <div style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace' }}>{total} total</div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function DockerContent({ data }: { data:ContainerStat[]|null }) {
  const containers = data??[];
  if (!containers.length) return <div style={{ textAlign:'center', color:C.greenMuted, fontSize:'10px', fontFamily:'monospace' }}>{data===null?'CONNECTING...':'NO CONTAINERS'}</div>;
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:'7px' }}>
      {containers.map(c=>(
        <div key={c.name} style={{ border:`1px solid ${C.border}`, padding:'9px', display:'flex', flexDirection:'column', gap:'4px' }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontSize:'9px', color:C.text, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</span>
            <span style={{ fontSize:'7px', color:C.green, flexShrink:0, marginLeft:'4px', fontFamily:'monospace' }}>● UP</span>
          </div>
          <Bar value={c.cpu} label="CPU"/>
          <Bar value={c.memory} label="MEM"/>
          <div style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace' }}>{fmtBytes(c.memUsed)} / {fmtBytes(c.memLimit)}</div>
        </div>
      ))}
    </div>
  );
}

// ── NEW: Spotify Widget ─────────────────────────────────────────────────────
function SpotifyContent({ data, onSendMessage }: { data: SpotifyData | null; onSendMessage: (msg: object) => void }) {
  const ctrl = (action: string) => onSendMessage({ type: 'spotifyControl', action });

  if (!data) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'10px' }}>
      <div style={{ fontSize:'10px', color:C.greenMuted, fontFamily:'monospace', textAlign:'center' }}>SPOTIFY NOT CONNECTED</div>
      <a href="http://127.0.0.1:3001/spotify/auth" target="_blank" rel="noreferrer"
        style={{ fontSize:'9px', color:C.cyan, border:`1px solid ${C.cyan}`, padding:'4px 10px', textDecoration:'none', fontFamily:'monospace', letterSpacing:'0.1em' }}>
        CONNECT SPOTIFY
      </a>
    </div>
  );

  if (!data.isPlaying && !data.title) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%' }}>
      <div style={{ fontSize:'10px', color:C.greenMuted, fontFamily:'monospace' }}>NOTHING PLAYING</div>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', gap:'8px' }}>
      <div style={{ display:'flex', gap:'10px', alignItems:'flex-start' }}>
        {data.albumArt && (
          <img src={data.albumArt} alt="album" style={{ width:'52px', height:'52px', flexShrink:0, border:`1px solid ${C.border}` }}/>
        )}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:'10px', color:C.text, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{data.title}</div>
          <div style={{ fontSize:'9px', color:C.cyan, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:'2px' }}>{data.artist}</div>
          <div style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginTop:'1px' }}>{data.album}</div>
        </div>
      </div>

      {/* Progress bar */}
      <div>
        <div style={{ width:'100%', height:'3px', background:C.greenFaint, marginBottom:'4px' }}>
          <div style={{ height:'100%', width:`${data.progressPercent}%`, background:C.cyan, transition:'width 1s linear' }}/>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between' }}>
          <span style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace' }}>{fmtMs(data.progressMs)}</span>
          <span style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace' }}>{fmtMs(data.durationMs)}</span>
        </div>
      </div>

      {/* Controls */}
      <div style={{ display:'flex', gap:'6px', justifyContent:'center' }}>
        {([['⏮', 'previous'], [data.isPlaying ? '⏸' : '▶', data.isPlaying ? 'pause' : 'play'], ['⏭', 'next']] as [string,string][]).map(([icon, action])=>(
          <button key={action} onClick={()=>ctrl(action)} style={{
            background:'none', border:`1px solid ${C.border}`, color:C.cyan,
            padding:'4px 10px', cursor:'pointer', fontFamily:'monospace', fontSize:'12px',
            transition:'border-color 0.15s',
          }}>{icon}</button>
        ))}
      </div>

      <div style={{ display:'flex', alignItems:'center', gap:'5px', justifyContent:'center' }}>
        <div style={{ width:'5px', height:'5px', borderRadius:'50%', background: data.isPlaying ? C.cyan : C.greenMuted }}/>
        <span style={{ fontSize:'8px', color: data.isPlaying ? C.cyan : C.greenMuted, fontFamily:'monospace', letterSpacing:'0.15em' }}>{data.isPlaying ? 'PLAYING' : 'PAUSED'}</span>
      </div>
    </div>
  );
}

// ── NEW: Temps & Fans Widget ────────────────────────────────────────────────
function TempsContent({ cpuTemp, fans, gpu }: { cpuTemp: CpuTempData; fans: FanData[]; gpu: GpuData | null }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px' }}>
      {/* CPU temps */}
      <div>
        <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.15em', marginBottom:'6px', fontFamily:'monospace' }}>CPU TEMPERATURE</div>
        {cpuTemp.main != null
          ? <>
              <div style={{ fontSize:'22px', color:tempColor(cpuTemp.main), fontFamily:'monospace', lineHeight:1 }}>{cpuTemp.main.toFixed(0)}°C</div>
              <div style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace', marginTop:'2px' }}>
                {cpuTemp.max != null && `max ${cpuTemp.max.toFixed(0)}°C`}
                {cpuTemp.cores.length > 0 && ` · ${cpuTemp.cores.length} cores`}
              </div>
              {cpuTemp.cores.length > 0 && (
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(40px,1fr))', gap:'3px', marginTop:'5px' }}>
                  {cpuTemp.cores.slice(0,16).map((t,i)=>(
                    <div key={i} style={{ textAlign:'center', border:`1px solid ${C.border}`, padding:'2px' }}>
                      <div style={{ fontSize:'7px', color:C.greenMuted, fontFamily:'monospace' }}>C{i}</div>
                      <div style={{ fontSize:'8px', color:tempColor(t), fontFamily:'monospace' }}>{t.toFixed(0)}°</div>
                    </div>
                  ))}
                </div>
              )}
            </>
          : <div style={{ fontSize:'9px', color:C.greenMuted, fontFamily:'monospace' }}>N/A — may need admin rights</div>
        }
      </div>

      {/* GPU temp */}
      {gpu && (
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:'8px' }}>
          <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.15em', marginBottom:'4px', fontFamily:'monospace' }}>GPU TEMPERATURE</div>
          <div style={{ fontSize:'18px', color:tempColor(gpu.temp), fontFamily:'monospace', lineHeight:1 }}>{gpu.temp.toFixed(1)}°C</div>
        </div>
      )}

      {/* Fans */}
      {fans.length > 0 && (
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:'8px' }}>
          <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.15em', marginBottom:'6px', fontFamily:'monospace' }}>FANS</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
            {fans.map(f=>(
              <div key={f.fan} style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <span style={{ fontSize:'9px', color:C.greenMuted, fontFamily:'monospace' }}>FAN {f.fan}</span>
                <span style={{ fontSize:'10px', color:f.rpm > 0 ? C.cyan : C.greenMuted, fontFamily:'monospace' }}>{f.rpm > 0 ? `${f.rpm} RPM` : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {fans.length === 0 && cpuTemp.main == null && (
        <div style={{ fontSize:'8px', color:C.textMuted, fontFamily:'monospace' }}>Fan data not available on this system.</div>
      )}
    </div>
  );
}

// ── NEW: Alerts Widget ──────────────────────────────────────────────────────
function AlertsContent({ alerts }: { alerts: AlertData[] }) {
  if (!alerts.length) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'6px' }}>
      <div style={{ fontSize:'18px' }}>✓</div>
      <div style={{ fontSize:'9px', color:C.green, fontFamily:'monospace', letterSpacing:'0.15em' }}>ALL CLEAR</div>
      <div style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace' }}>No thresholds exceeded</div>
    </div>
  );

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
      <div style={{ fontSize:'9px', color:C.red, letterSpacing:'0.15em', fontFamily:'monospace', marginBottom:'2px' }}>⚠ {alerts.length} ALERT{alerts.length>1?'S':''}</div>
      {alerts.map((a, i) => (
        <div key={i} style={{ border:`1px solid ${C.red}40`, padding:'7px 9px', background:`${C.red}08` }}>
          <div style={{ fontSize:'9px', color:C.red, fontFamily:'monospace' }}>{a.message}</div>
        </div>
      ))}
    </div>
  );
}


function HwinfoContent({ data }: { data: HwinfoData | null }) {
  if (!data || !data.available) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:'8px' }}>
      <div style={{ fontSize:'10px', color:C.greenMuted, fontFamily:'monospace', textAlign:'center' }}>HWINFO NOT CONNECTED</div>
      <div style={{ fontSize:'8px', color:C.textMuted, fontFamily:'monospace', textAlign:'center' }}>Enable Shared Memory Support in HWiNFO settings</div>
    </div>
  );
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:'10px', height:'100%', overflow:'auto' }}>
      {/* CPU */}
      <div>
        <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.15em', marginBottom:'6px', fontFamily:'monospace' }}>CPU</div>
        <div style={{ display:'flex', gap:'16px', marginBottom:'6px' }}>
          {data.cpu.packageTemp != null && (
            <div>
              <div style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace' }}>PACKAGE</div>
              <div style={{ fontSize:'18px', color:tempColor(data.cpu.packageTemp), fontFamily:'monospace', lineHeight:1 }}>{data.cpu.packageTemp.toFixed(0)}°C</div>
            </div>
          )}
          {data.cpu.power != null && (
            <div>
              <div style={{ fontSize:'8px', color:C.greenMuted, fontFamily:'monospace' }}>POWER</div>
              <div style={{ fontSize:'18px', color:C.amber, fontFamily:'monospace', lineHeight:1 }}>{data.cpu.power.toFixed(0)}W</div>
            </div>
          )}
        </div>
        {data.cpu.coreTemps.length > 0 && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(44px,1fr))', gap:'3px' }}>
            {data.cpu.coreTemps.map((c,i) => (
              <div key={i} style={{ textAlign:'center', border:`1px solid ${C.border}`, padding:'2px 0' }}>
                <div style={{ fontSize:'7px', color:C.greenMuted, fontFamily:'monospace' }}>{c.label.replace('-core ','')}</div>
                <div style={{ fontSize:'9px', color:tempColor(c.temp), fontFamily:'monospace' }}>{c.temp.toFixed(0)}°</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* GPU */}
      <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:'8px' }}>
        <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.15em', marginBottom:'6px', fontFamily:'monospace' }}>GPU</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'6px' }}>
          {([
            ['TEMP', data.gpu.temp != null ? `${data.gpu.temp.toFixed(0)}°C` : '—', data.gpu.temp != null ? tempColor(data.gpu.temp) : C.greenMuted],
            ['MEM JUNC', data.gpu.memJunctionTemp != null ? `${data.gpu.memJunctionTemp.toFixed(0)}°C` : '—', data.gpu.memJunctionTemp != null ? tempColor(data.gpu.memJunctionTemp) : C.greenMuted],
            ['POWER', data.gpu.power != null ? `${data.gpu.power.toFixed(0)}W` : '—', C.amber],
            ['LOAD', data.gpu.load != null ? `${data.gpu.load.toFixed(0)}%` : '—', C.orange],
            ['CLOCK', data.gpu.clockMhz != null ? `${data.gpu.clockMhz.toFixed(0)}` : '—', C.cyan],
            ['MEM CLK', data.gpu.memClockMhz != null ? `${data.gpu.memClockMhz.toFixed(0)}` : '—', C.cyan],
            ['MEM USE', data.gpu.memUsagePct != null ? `${data.gpu.memUsagePct.toFixed(0)}%` : '—', C.purple],
            ['FAN RPM', data.gpu.fanRpm != null ? `${data.gpu.fanRpm.toFixed(0)}` : '—', C.blue],
          ] as [string,string,string][]).map(([k,v,col]) => (
            <div key={k}>
              <div style={{ fontSize:'7px', color:C.greenMuted, fontFamily:'monospace' }}>{k}</div>
              <div style={{ fontSize:'10px', color:col, fontFamily:'monospace' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>
      {/* Fans */}
      {data.fans.cpuFanRpm != null && (
        <div style={{ borderTop:`1px solid ${C.border}`, paddingTop:'8px' }}>
          <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.15em', marginBottom:'4px', fontFamily:'monospace' }}>FANS</div>
          <div style={{ fontSize:'10px', color:C.cyan, fontFamily:'monospace' }}>CPU: {data.fans.cpuFanRpm.toFixed(0)} RPM</div>
        </div>
      )}
    </div>
  );
}

// ── Settings Drawer ────────────────────────────────────────────────────────
function SettingsDrawer({ settings, onUpdate, onClose, currentPageIdx }: {
  settings: DashSettings;
  onUpdate: (s: DashSettings) => void;
  onClose: () => void;
  currentPageIdx: number;
}) {
  const [preview, setPreview] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);
  const previewRef = useRef<ReturnType<typeof setInterval>|null>(null);

  const startPreview = () => {
    setPreview(true); setPreviewPage(0); let i = 0;
    previewRef.current = setInterval(() => { i = (i+1) % settings.pages.length; setPreviewPage(i); }, settings.rotateInterval * 1000);
  };
  const stopPreview = () => { setPreview(false); if (previewRef.current) clearInterval(previewRef.current); };
  useEffect(() => () => { if (previewRef.current) clearInterval(previewRef.current); }, []);

  const addPage = () => {
    const newPage: PageConfig = { id: `p${Date.now()}`, name: `PAGE ${settings.pages.length + 1}`, layout: [], visible: makeDefaultVisible([]) };
    onUpdate({ ...settings, pages: [...settings.pages, newPage] });
  };
  const removePage = (idx: number) => {
    if (settings.pages.length <= 1) return;
    const pages = settings.pages.filter((_,i) => i !== idx);
    onUpdate({ ...settings, pages, currentPage: Math.min(settings.currentPage, pages.length-1) });
  };
  const renamePage = (idx: number, name: string) => {
    const pages = settings.pages.map((p,i) => i===idx ? {...p, name} : p);
    onUpdate({ ...settings, pages });
  };

  return (
    <div style={{ position:'fixed', top:0, right:0, bottom:0, width:'320px', background:C.bgCard, borderLeft:`1px solid ${C.borderMid}`, zIndex:1000, display:'flex', flexDirection:'column', boxShadow:`-8px 0 32px #00000060` }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 16px', borderBottom:`1px solid ${C.border}`, flexShrink:0 }}>
        <span style={{ fontSize:'10px', letterSpacing:'0.25em', color:C.greenDim, fontFamily:'monospace' }}>SETTINGS</span>
        <button onClick={onClose} style={{ background:'none', border:'none', color:C.greenMuted, cursor:'pointer', fontSize:'14px', fontFamily:'monospace' }}>✕</button>
      </div>
      <div style={{ flex:1, overflow:'auto', padding:'16px', display:'flex', flexDirection:'column', gap:'20px' }}>
        <section>
          <div style={{ fontSize:'9px', color:C.greenMuted, letterSpacing:'0.2em', marginBottom:'10px', fontFamily:'monospace' }}>AUTO ROTATE</div>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px' }}>
            <span style={{ fontSize:'10px', color:C.text, fontFamily:'monospace' }}>Enable rotation</span>
            <button onClick={() => onUpdate({...settings, autoRotate:!settings.autoRotate})} style={{ width:'36px', height:'18px', border:`1px solid ${settings.autoRotate?C.green:C.border}`, background: settings.autoRotate ? `${C.green}20` : 'none', cursor:'pointer', position:'relative', transition:'all 0.2s' }}>
              <div style={{ position:'absolute', top:'2px', width:'12px', height:'12px', background: settings.autoRotate ? C.green : C.greenMuted, left: settings.autoRotate ? '20px' : '2px', transition:'all 0.2s' }}/>
            </button>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <span style={{ fontSize:'9px', color:C.greenMuted, fontFamily:'monospace', whiteSpace:'nowrap' }}>INTERVAL</span>
            <input type="range" min={5} max={120} step={5} value={settings.rotateInterval} onChange={e => onUpdate({...settings, rotateInterval:Number(e.target.value)})} style={{ flex:1, accentColor:C.green }}/>
            <span style={{ fontSize:'10px', color:C.green, fontFamily:'monospace', minWidth:'32px', textAlign:'right' }}>{settings.rotateInterval}s</span>
          </div>
          <div style={{ display:'flex', gap:'8px', marginTop:'10px' }}>
            <button onClick={preview ? stopPreview : startPreview} style={{ fontSize:'9px', padding:'4px 10px', letterSpacing:'0.12em', border:`1px solid ${preview?C.amber:C.border}`, color:preview?C.amber:C.greenMuted, background:'none', cursor:'pointer', fontFamily:'monospace', flex:1 }}>
              {preview ? `PREVIEWING — PAGE ${previewPage+1}` : 'PREVIEW ROTATION'}
            </button>
          </div>
        </section>
        <div style={{ borderTop:`1px solid ${C.border}` }}/>
        <section>
          <div style={{ fontSize:'9px', color:C.greenMuted, letterSpacing:'0.2em', marginBottom:'10px', fontFamily:'monospace' }}>PAGES</div>
          <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
            {settings.pages.map((page, idx) => (
              <div key={page.id} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'8px 10px', border:`1px solid ${idx===currentPageIdx?C.green:C.border}`, background: idx===currentPageIdx ? `${C.green}08` : 'none' }}>
                <div style={{ width:'6px', height:'6px', borderRadius:'50%', background:idx===currentPageIdx?C.green:C.greenMuted, flexShrink:0 }}/>
                <input value={page.name} onChange={e => renamePage(idx, e.target.value)} style={{ flex:1, background:'none', border:'none', color:C.text, fontSize:'10px', fontFamily:'monospace', outline:'none' }}/>
                {settings.pages.length > 1 && (
                  <button onClick={() => removePage(idx)} style={{ background:'none', border:'none', color:C.greenMuted, cursor:'pointer', fontSize:'10px', fontFamily:'monospace', padding:0 }}>✕</button>
                )}
              </div>
            ))}
            <button onClick={addPage} style={{ fontSize:'9px', padding:'6px', letterSpacing:'0.12em', border:`1px dashed ${C.border}`, color:C.greenMuted, background:'none', cursor:'pointer', fontFamily:'monospace', textAlign:'center' }}>+ ADD PAGE</button>
          </div>
        </section>
        <div style={{ borderTop:`1px solid ${C.border}` }}/>
        <section>
          <div style={{ fontSize:'9px', color:C.greenMuted, letterSpacing:'0.2em', marginBottom:'8px', fontFamily:'monospace' }}>TIPS</div>
          <div style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace', lineHeight:1.6 }}>
            Drag widgets by their header.<br/>
            Resize from the corner handle.<br/>
            Click ✕ on a widget to hide it.<br/>
            Use + to add widgets back.<br/>
            Layout saves automatically.<br/>
            Spotify: enable in config.ts then visit /spotify/auth.
          </div>
        </section>
      </div>
    </div>
  );
}

// ── Add Widget Panel ───────────────────────────────────────────────────────
function AddWidgetPanel({ visible, onAdd, onClose }: { visible: Record<WidgetKey, boolean>; onAdd: (k: WidgetKey) => void; onClose: () => void; }) {
  const hidden = ALL_WIDGETS.filter(k => !visible[k]);
  return (
    <div style={{ position:'absolute', top:'100%', right:0, marginTop:'4px', background:C.bgCard, border:`1px solid ${C.borderMid}`, padding:'10px', zIndex:100, minWidth:'200px', boxShadow:`0 8px 24px #00000060` }}>
      <div style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.18em', marginBottom:'8px', fontFamily:'monospace' }}>ADD WIDGET</div>
      {hidden.length === 0
        ? <div style={{ fontSize:'9px', color:C.textMuted, fontFamily:'monospace' }}>All widgets visible</div>
        : <div style={{ display:'flex', flexDirection:'column', gap:'4px' }}>
            {hidden.map(k => (
              <button key={k} onClick={() => { onAdd(k); onClose(); }} style={{ display:'flex', alignItems:'center', gap:'8px', padding:'6px 8px', background:'none', border:`1px solid ${C.border}`, cursor:'pointer', color:WIDGET_META[k].accent, fontFamily:'monospace', fontSize:'9px', letterSpacing:'0.12em', textAlign:'left' }}>
                <div style={{ width:'2px', height:'10px', background:WIDGET_META[k].accent, flexShrink:0 }}/>
                {WIDGET_META[k].label}
              </button>
            ))}
          </div>
      }
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────

// Memoized widget components
const ClockContentM = memo(ClockContent);
const WeatherContentM = memo(WeatherContent);
const CpuContentM = memo(CpuContent);
const CpuGraphContentM = memo(CpuGraphContent);
const MemContentM = memo(MemContent);
const MemGraphContentM = memo(MemGraphContent);
const GpuContentM = memo(GpuContent);
const GpuGraphContentM = memo(GpuGraphContent);
const DiskContentM = memo(DiskContent);
const ProcessContentM = memo(ProcessContent);
const NetworkContentM = memo(NetworkContent);
const DockerContentM = memo(DockerContent);
const SpotifyContentM = memo(SpotifyContent);
const TempsContentM = memo(TempsContent);
const AlertsContentM = memo(AlertsContent);
const HwinfoContentM = memo(HwinfoContent);
const SettingsDrawerM = memo(SettingsDrawer);
const AddWidgetPanelM = memo(AddWidgetPanel);
export default function Dashboard() {
  const [metrics, setMetrics] = useState<Metrics|null>(null);
  const [connected, setConnected] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState<DashSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) return JSON.parse(saved);
    } catch {}
    return DEFAULT_SETTINGS;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);
  const [dragging, setDragging] = useState<string|null>(null);
  const [width, setWidth] = useState(1200);
  const containerRef = useRef<HTMLDivElement>(null);
  const historyRef = useRef<HistoryPoint[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const rotateRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const addWidgetRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<WebSocket|null>(null);

  const sendMessage = useCallback((msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send(JSON.stringify(msg));
  }, []);

  const currentPage = settings.pages[settings.currentPage] ?? settings.pages[0];

  const saveSettings = useCallback((s: DashSettings) => {
    setSettings(s);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch {}
  }, []);

  useEffect(() => {
    const measure = () => { if (containerRef.current) setWidth(containerRef.current.offsetWidth); };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  useEffect(() => {
    let ws: WebSocket, timer: ReturnType<typeof setTimeout>;
    const connect = () => {
      ws = new WebSocket('ws://127.0.0.1:3001');
      wsRef.current = ws;
      ws.onopen = () => {
        setConnected(true);
        try {
          const saved = localStorage.getItem('sysmonitor-location');
          if (saved) ws.send(JSON.stringify({ type: 'setLocation', ...JSON.parse(saved) }));
        } catch {}
      };
      ws.onmessage = (e) => {
        try {
          const data: Metrics = JSON.parse(e.data);
          setMetrics(data);
          const pt: HistoryPoint = { t:Date.now(), cpu:data.cpu.load, mem:data.mem.percent, gpuLoad:data.hwinfo?.gpu?.load??0, gpuTemp:data.hwinfo?.gpu?.temp??0, cpuTemp:data.hwinfo?.cpu?.packageTemp??data.cpuTemp?.main??0 };
          historyRef.current = [...historyRef.current, pt].slice(-HISTORY_LEN);
          setHistory([...historyRef.current]);
        } catch {}
      };
      ws.onclose = () => { setConnected(false); timer = setTimeout(connect, 3000); };
      ws.onerror = () => ws.close();
    };
    connect();
    return () => { clearTimeout(timer); ws?.close(); };
  }, []);

  useEffect(() => {
    if (rotateRef.current) clearInterval(rotateRef.current);
    if (settings.autoRotate && settings.pages.length > 1) {
      rotateRef.current = setInterval(() => {
        setSettings(prev => {
          const next = { ...prev, currentPage: (prev.currentPage+1) % prev.pages.length };
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
          return next;
        });
      }, settings.rotateInterval * 1000);
    }
    return () => { if (rotateRef.current) clearInterval(rotateRef.current); };
  }, [settings.autoRotate, settings.rotateInterval, settings.pages.length]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showAddWidget && addWidgetRef.current && !addWidgetRef.current.contains(e.target as Node)) setShowAddWidget(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showAddWidget]);

  useEffect(() => { setMounted(true); }, []);

  const router = useRouter();
  useEffect(() => {
    try { if (sessionStorage.getItem('sysmonitor-setup-ok') === '1') return; } catch {}
    fetch('http://127.0.0.1:3001/api/setup/status')
      .then(r => r.json())
      .then(d => {
        if (d.setupRequired) { router.push('/setup'); return; }
        try { sessionStorage.setItem('sysmonitor-setup-ok', '1'); } catch {}
      })
      .catch(() => {});
  }, []); // eslint-disable-line react-hooks/exhaustive-deps


  const updateCurrentPage = useCallback((updates: Partial<PageConfig>) => {
    saveSettings({ ...settings, pages: settings.pages.map((p,i) => i===settings.currentPage ? {...p,...updates} : p) });
  }, [settings, saveSettings]);

  const onLayoutChange = useCallback((layout: any[]) => { updateCurrentPage({ layout }); }, [updateCurrentPage]);
  const hideWidget = useCallback((k: WidgetKey) => { updateCurrentPage({ visible: { ...currentPage.visible, [k]: false } }); }, [currentPage, updateCurrentPage]);
  const addWidget = useCallback((k: WidgetKey) => {
    const existing = currentPage.layout.find(l => l.i === k);
    const newLayout = existing ? currentPage.layout : [...currentPage.layout, { i:k, x:0, y:Infinity, w:4, h:6, minW:1, minH:1 }];
    updateCurrentPage({ visible: { ...currentPage.visible, [k]: true }, layout: newLayout });
  }, [currentPage, updateCurrentPage]);

  const hasAlerts = (metrics?.alerts?.length ?? 0) > 0;

  const getWidgetContent = (k: WidgetKey) => {
    switch(k) {
      case 'clock':    return <ClockContentM/>;
      case 'weather':  return <WeatherContentM data={metrics?.weather??null} onSendMessage={sendMessage}/>;
      case 'cpu':      return <CpuContentM data={metrics?.cpu??null}/>;
      case 'cpuGraph': return <CpuGraphContentM history={history}/>;
      case 'memory':   return <MemContentM data={metrics?.mem??null}/>;
      case 'memGraph': return <MemGraphContentM history={history}/>;
      case 'gpu':      return <GpuContentM data={metrics?.hwinfo?.available ? {model:'RTX 5070',load:metrics.hwinfo.gpu.load??0,memUsed:0,memTotal:0,memPercent:metrics.hwinfo.gpu.memUsagePct??0,temp:metrics.hwinfo.gpu.temp??0,powerDraw:metrics.hwinfo.gpu.power??null,powerLimit:250} : null}/>;
      case 'gpuGraph': return <GpuGraphContentM history={history}/>;
      case 'disk':     return <DiskContentM data={metrics?.disk??[]}/>;
      case 'processes':return <ProcessContentM data={metrics?.processes??[]}/>;
      case 'network':  return <NetworkContentM data={metrics?.network??null}/>;
      case 'docker':   return <DockerContentM data={metrics?.docker??null}/>;
      case 'spotify':  return <SpotifyContentM data={metrics?.spotify??null} onSendMessage={sendMessage}/>;
      case 'temps':    return <TempsContentM cpuTemp={metrics?.cpuTemp ?? {main:null,cores:[],max:null}} fans={metrics?.fans??[]} gpu={metrics?.hwinfo?.available ? {model:'RTX 5070',load:metrics.hwinfo.gpu.load??0,memUsed:0,memTotal:0,memPercent:metrics.hwinfo.gpu.memUsagePct??0,temp:metrics.hwinfo.gpu.temp??0,powerDraw:metrics.hwinfo.gpu.power??null,powerLimit:250} : null}/>;
      case 'alerts':   return <AlertsContentM alerts={metrics?.alerts??[]}/>
      case 'hwinfo':   return <HwinfoContentM data={metrics?.hwinfo??null}/>;
    }
  };

  const getWidgetTitle = (k: WidgetKey) => {
    if (k === 'docker') return `DOCKER // ${metrics?.docker?.length??0}`;
    if (k === 'alerts') return `ALERTS ${hasAlerts ? `// ${metrics!.alerts.length}` : '// OK'}`;
    return WIDGET_META[k].label;
  };

  const activeLayout = currentPage.layout.filter(l => currentPage.visible[l.i as WidgetKey]);

  return (
    <>
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        .react-grid-item.react-grid-placeholder{background:${C.green}12!important;border:1px dashed ${C.green}40!important;border-radius:0!important;}
        .react-resizable-handle{opacity:0;transition:opacity 0.2s;}
        .react-grid-item:hover .react-resizable-handle{opacity:1;}
        .react-resizable-handle::after{border-color:${C.greenMuted}!important;}
        .drag-handle{cursor:grab;} .drag-handle:active{cursor:grabbing;}
        *{box-sizing:border-box;}
        ::-webkit-scrollbar{width:3px;height:3px;}
        ::-webkit-scrollbar-track{background:${C.bg};}
        ::-webkit-scrollbar-thumb{background:${C.borderMid};}
        body{margin:0;background:${C.bg};}
        input[type=range]{height:4px;cursor:pointer;}
      `}</style>

      <div style={{ height:'100vh', background:C.bg, color:C.text, fontFamily:'monospace', display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 14px', borderBottom:`1px solid ${C.borderMid}`, flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <div style={{ width:'7px', height:'7px', borderRadius:'50%', background:connected?C.green:C.red, boxShadow:connected?`0 0 5px ${C.green}`:'none', transition:'all 0.3s' }}/>
            <span style={{ fontSize:'10px', color:connected?C.green:C.red, letterSpacing:'0.18em' }}>{connected?'LIVE':'RECONNECTING'}</span>
            {hasAlerts && <span style={{ fontSize:'9px', color:C.red, fontFamily:'monospace', letterSpacing:'0.12em', animation:'pulse 1s infinite' }}>⚠ {metrics!.alerts.length} ALERT{metrics!.alerts.length>1?'S':''}</span>}
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:'0px' }}>
            <span style={{ fontSize:'11px', color:C.greenDim, letterSpacing:'0.3em', marginRight:'16px' }}>SYS.MONITOR</span>
            <div style={{ display:'flex', gap:'2px' }}>
              {settings.pages.map((page, idx) => (
                <button key={page.id} onClick={() => saveSettings({...settings, currentPage:idx})} style={{ fontSize:'9px', padding:'4px 10px', letterSpacing:'0.12em', background: idx===settings.currentPage ? `${C.green}15` : 'none', border:`1px solid ${idx===settings.currentPage?C.green:C.border}`, color: idx===settings.currentPage ? C.green : C.textMuted, cursor:'pointer', fontFamily:'monospace', transition:'all 0.15s' }}>{page.name}</button>
              ))}
            </div>
          </div>

          <div style={{ display:'flex', gap:'6px', alignItems:'center', position:'relative' }} ref={addWidgetRef}>
            {settings.autoRotate && <span style={{ fontSize:'8px', color:C.amber, letterSpacing:'0.12em', fontFamily:'monospace' }}>⟳ {settings.rotateInterval}s</span>}
            <span style={{ fontSize:'8px', color:C.greenMuted, letterSpacing:'0.1em', fontFamily:'monospace' }}>{metrics ? new Date(metrics.timestamp).toLocaleTimeString() : '—'}</span>
            <button onClick={() => setShowAddWidget(v=>!v)} style={{ fontSize:'9px', color:showAddWidget?C.green:C.textMuted, letterSpacing:'0.15em', background:'none', border:`1px solid ${showAddWidget?C.green:C.border}`, padding:'4px 8px', cursor:'pointer', fontFamily:'monospace', transition:'all 0.15s' }}>+</button>
            <button onClick={() => setShowSettings(v=>!v)} style={{ fontSize:'9px', color:showSettings?C.green:C.textMuted, letterSpacing:'0.15em', background:'none', border:`1px solid ${showSettings?C.green:C.border}`, padding:'4px 8px', cursor:'pointer', fontFamily:'monospace', transition:'all 0.15s' }}>⚙</button>
            {showAddWidget && <AddWidgetPanelM visible={currentPage.visible} onAdd={addWidget} onClose={()=>setShowAddWidget(false)}/>}
          </div>
        </div>

        {/* Grid */}
        <div style={{ flex:1, overflow:'auto', padding:'10px' }} ref={containerRef}>
          {mounted && <Grid
            layout={activeLayout}
            cols={12}
            rowHeight={30}
            width={width - 20}
            draggableHandle=".drag-handle"
            onLayoutChange={onLayoutChange as any}
            onDragStart={(_l:any,_o:any,_n:any,_p:any,_e:any,el:HTMLElement)=>setDragging(el.closest('[data-widget]')?.getAttribute('data-widget')??null)}
            onDragStop={()=>setDragging(null)}
            margin={[8,8]}
            containerPadding={[0,0]}
            isResizable={true}
            isDraggable={true}
          >
            {ALL_WIDGETS.filter(k=>currentPage.visible[k]).map(k=>(
              <div key={k} data-widget={k}>
                <Card
                  title={getWidgetTitle(k)}
                  accent={WIDGET_META[k].accent}
                  onClose={()=>hideWidget(k)}
                  isDragging={dragging===k}
                  flash={k==='alerts' && hasAlerts}
                >
                  {getWidgetContent(k)}
                </Card>
              </div>
            ))}
          </Grid>}
        </div>

        {/* Page dots */}
        {settings.pages.length > 1 && (
          <div style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:'6px', padding:'6px', borderTop:`1px solid ${C.border}`, flexShrink:0 }}>
            {settings.pages.map((page,idx)=>(
              <button key={page.id} onClick={()=>saveSettings({...settings,currentPage:idx})} style={{ width: idx===settings.currentPage ? '20px' : '6px', height:'6px', borderRadius:'3px', background: idx===settings.currentPage ? C.green : C.greenMuted, border:'none', cursor:'pointer', padding:0, transition:'all 0.3s' }}/>
            ))}
          </div>
        )}
      </div>

      {showSettings && (
        <SettingsDrawerM settings={settings} onUpdate={saveSettings} onClose={()=>setShowSettings(false)} currentPageIdx={settings.currentPage}/>
      )}
    </>
  );
}
