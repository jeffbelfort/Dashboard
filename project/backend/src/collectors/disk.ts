import * as si from 'systeminformation';

export interface DiskData {
  mount: string;
  type: string;
  used: number;
  size: number;
  percent: number;
}

export async function getDiskStats(): Promise<DiskData[]> {
  try {
    const fsList = await si.fsSize();
    return fsList
      .filter(fs => fs.size > 0 && !fs.mount.startsWith('/proc') && !fs.mount.startsWith('/sys') && !fs.mount.startsWith('/dev/loop'))
      .map(fs => ({
        mount: fs.mount,
        type: fs.type,
        used: fs.used,
        size: fs.size,
        percent: (fs.used / fs.size) * 100,
      }));
  } catch {
    return [];
  }
}
