import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

// hwinfo_reader.py must be copied next to this compiled file at build time
// (tsc does not copy non-.ts files). In dev mode __dirname is
// backend/src/collectors, so '..' -> backend/src, where the .py source lives.
// In the compiled build, __dirname is backend/dist/collectors, so '..' ->
// backend/dist — the .py file must be copied there as part of the build step.
const SCRIPT_PATH = path.join(__dirname, '..', process.platform === 'linux' ? 'linux_sensors.py' : 'hwinfo_reader.py');

// A Bob-proof build ships a portable Python under <exeDir>/python-runtime/.
// The launcher passes its own env (including PORTABLE_EXECUTABLE_DIR) down to
// this backend process when it spawns it, so we can find the same bundle the
// launcher's Node resolution uses. Falls back to system `python` in dev mode
// or if the bundle isn't present.
function findPythonBinary(): string {
  const exeDir = process.env.PORTABLE_EXECUTABLE_DIR;
  if (exeDir && process.platform === 'win32') {
    const bundled = path.join(exeDir, 'python-runtime', 'python.exe');
    if (fs.existsSync(bundled)) return bundled;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

const PYTHON_BIN = findPythonBinary();

export interface HwinfoData {
  available: boolean;
  source?: string;
  cpu: {
    tempAvg: number | null;
    packageTemp: number | null;
    power: number | null;
    coreTemps: { label: string; temp: number }[];
    coreClocks: { label: string; mhz: number }[];
    coreRatios: { label: string; ratio: number }[];
    coreVids: { label: string; volts: number }[];
    coreEffective: { label: string; mhz: number }[];
    vcore: number | null;
    pchTemp: number | null;
  };
  gpu: {
    model?: string | null;
    memUsed?: number | null;
    memTotal?: number | null;
    powerLimit?: number | null;
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
    coreVoltage: number | null;
  };
  fans: { cpuFanRpm: number | null };
}

const EMPTY: HwinfoData = {
  available: false,
  cpu: { tempAvg: null, packageTemp: null, power: null, coreTemps: [], coreClocks: [], coreRatios: [], coreVids: [], coreEffective: [], vcore: null, pchTemp: null },
  gpu: {
 temp: null, memJunctionTemp: null, load: null, memLoad: null, memUsagePct: null, clockMhz: null, memClockMhz: null, power: null, fanRpm: null, fanPct: null, coreVoltage: null },
  fans: { cpuFanRpm: null },
};

let lastData: HwinfoData = EMPTY;
let proc: ChildProcess | null = null;

function startProcess() {
  if (!fs.existsSync(SCRIPT_PATH)) {
    console.warn('Sensor reader not found at', SCRIPT_PATH);
    return;
  }

  proc = spawn(PYTHON_BIN, ['-u', SCRIPT_PATH]);
  console.log('Hardware sensor reader: using Python at', PYTHON_BIN);

  const rl = readline.createInterface({ input: proc.stdout! });
  rl.on('line', (line) => {
    try {
      lastData = JSON.parse(line.trim()) as HwinfoData;
    } catch {}
  });

  proc.stderr?.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.error('Hardware sensor reader:', msg);
  });

  proc.on('close', (code) => {
    console.log(`Hardware sensor reader exited (${code}), restarting in 5s...`);
    proc = null;
    lastData = EMPTY;
    setTimeout(startProcess, 5000);
  });

  proc.on('error', (e) => {
    console.error('Hardware sensor reader error:', e.message);
  });

  console.log('Hardware sensor reader started');
}

// Start the persistent process when this module is loaded
if (process.platform === 'win32' || process.platform === 'linux') startProcess();

// Cleanup on exit
process.on('exit', () => { proc?.kill(); });
process.on('SIGINT', () => { proc?.kill(); });

// Just return the last known data — updated in background by the persistent process
export async function getHwinfoData(): Promise<HwinfoData> {
  return lastData;
}
