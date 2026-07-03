import * as si from 'systeminformation';

export interface FanData {
  fan: number;
  rpm: number;
}

export async function getFanSpeeds(): Promise<FanData[]> {
  try {
    const data = await si.fan();
    return data.map((f, i) => ({ fan: i + 1, rpm: f.rpm ?? 0 }));
  } catch {
    return [];
  }
}
