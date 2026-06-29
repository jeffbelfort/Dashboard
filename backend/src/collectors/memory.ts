import * as si from 'systeminformation';

export async function getMemStats(): Promise<{ used: number; total: number; percent: number }> {
  const data = await si.mem();
  return {
    used: data.active,
    total: data.total,
    percent: (data.active / data.total) * 100,
  };
}
