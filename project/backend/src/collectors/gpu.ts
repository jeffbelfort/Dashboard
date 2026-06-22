import * as si from 'systeminformation';

export interface GpuData {
  model: string;
  load: number;
  memUsed: number;
  memTotal: number;
  memPercent: number;
  temp: number;
}

export async function getGpuStats(): Promise<GpuData | null> {
  try {
    const [controllers, mem] = await Promise.all([
      si.graphics(),
      si.graphics(),
    ]);
    const gpu = controllers.controllers[0];
    if (!gpu) return null;
    const memTotal = gpu.vram ? gpu.vram * 1024 * 1024 : 0;
    const memUsed = gpu.memoryUsed ? gpu.memoryUsed * 1024 * 1024 : 0;
    return {
      model: gpu.model ?? 'Unknown GPU',
      load: gpu.utilizationGpu ?? 0,
      memUsed,
      memTotal,
      memPercent: memTotal > 0 ? (memUsed / memTotal) * 100 : 0,
      temp: gpu.temperatureGpu ?? 0,
    };
  } catch {
    return null;
  }
}
