import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import readline from 'readline';

const SCRIPT_PATH = path.join(__dirname, '..', 'hwinfo_reader.py');

export interface HwinfoData {
  available: boolean;
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
  gpu: { temp: null, memJunctionTemp: null, load: null, memLoad: null, memUsagePct: null, clockMhz: null, memClockMhz: null, power: null, fanRpm: null, fanPct: null, coreVoltage: null },
  fans: { cpuFanRpm: null },
};

let lastData: HwinfoData = EMPTY;
let proc: ChildProcess | null = null;

function startProcess() {
  if (!fs.existsSync(SCRIPT_PATH)) {
    console.warn('hwinfo_reader.py not found at', SCRIPT_PATH);
    return;
  }

  proc = spawn('python', ['-u', SCRIPT_PATH]);

  const rl = readline.createInterface({ input: proc.stdout! });
  rl.on('line', (line) => {
    try {
      lastData = JSON.parse(line.trim()) as HwinfoData;
    } catch {}
  });

  proc.stderr?.on('data', (d) => {
    const msg = d.toString().trim();
    if (msg) console.error('HWiNFO reader:', msg);
  });

  proc.on('close', (code) => {
    console.log(`HWiNFO reader exited (${code}), restarting in 5s...`);
    proc = null;
    setTimeout(startProcess, 5000);
  });

  proc.on('error', (e) => {
    console.error('HWiNFO reader error:', e.message);
  });

  console.log('HWiNFO reader started');
}

// Start the persistent process when this module is loaded
startProcess();

// Cleanup on exit
process.on('exit', () => { proc?.kill(); });
process.on('SIGINT', () => { proc?.kill(); });

// Just return the last known data — updated in background by the persistent process
export async function getHwinfoData(): Promise<HwinfoData> {
  return lastData;
}
