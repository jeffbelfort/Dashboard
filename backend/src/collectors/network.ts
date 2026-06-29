import * as si from 'systeminformation';

export interface NetworkStats {
  iface: string;
  rxSec: number;
  txSec: number;
  rxTotal: number;
  txTotal: number;
}

export async function getNetworkStats(): Promise<NetworkStats[]> {
  try {
    const stats = await si.networkStats();
    return stats
      .filter((s) => s.iface && s.rx_sec >= 0)
      .map((s) => ({
        iface: s.iface,
        rxSec: s.rx_sec,
        txSec: s.tx_sec,
        rxTotal: s.rx_bytes,
        txTotal: s.tx_bytes,
      }));
  } catch (error) {
    console.error('Error fetching network stats:', error);
    return [];
  }
}
