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
    const byPid = new Map(procs.list.map(p => [p.pid, p]));
    const isOwnPs = (p: typeof procs.list[number]): boolean => {
      if (process.platform !== 'linux' || p.name.toLowerCase() !== 'ps') return false;
      let parent = p.parentPid;
      const seen = new Set<number>();
      while (parent > 0 && !seen.has(parent)) {
        if (parent === process.pid) return true;
        seen.add(parent);
        parent = byPid.get(parent)?.parentPid ?? 0;
      }
      return false;
    };
    return procs.list
      .filter(p => !isOwnPs(p))
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
