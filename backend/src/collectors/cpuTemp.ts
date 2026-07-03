import * as si from 'systeminformation';

export interface CpuTempData {
  main: number | null;
  cores: number[];
  max: number | null;
}

export async function getCpuTemp(): Promise<CpuTempData> {
  try {
    const data = await si.cpuTemperature();
    return {
      main: data.main ?? null,
      cores: data.cores ?? [],
      max: data.max ?? null,
    };
  } catch {
    return { main: null, cores: [], max: null };
  }
}
