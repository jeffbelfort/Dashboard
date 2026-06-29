import * as si from 'systeminformation';

export interface ProcessData {
  name: string;
  cpu: number;
  mem: number;
  pid: number;
}

const IGNORED = ['system idle process', 'idle', 'system'];

export async function getTopProcesses(): Promise<ProcessData[]> {
  try {
    const procs = await si.processes();
    return procs.list
      .filter(p => !IGNORED.includes(p.name.toLowerCase()))
      .sort((a, b) => b.cpu - a.cpu)
      .slice(0, 10)
      .map(p => ({
        name: p.name,
        cpu: p.cpu,
        mem: p.mem,
        pid: p.pid,
      }));
  } catch {
    return [];
  }
}
