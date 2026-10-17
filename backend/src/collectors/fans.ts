// Note: systeminformation does not have a fan-speed API (si.fan() was never
// a real method here - this file predates the HWiNFO integration, which now
// covers fan RPM via shared memory instead). Left as a stub since nothing
// currently imports getFanSpeeds; kept only in case something needs a
// systeminformation-based fallback later.
export interface FanData {
  fan: number;
  rpm: number;
}

export async function getFanSpeeds(): Promise<FanData[]> {
  return [];
}
