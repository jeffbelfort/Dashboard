import * as si from 'systeminformation';

export async function getCpuLoad(): Promise<{ load: number; cores: number[] }> {
  const data = await si.currentLoad();
  return {
    load: data.currentLoad,
    cores: data.cpus.map((c) => c.load),
  };
}
