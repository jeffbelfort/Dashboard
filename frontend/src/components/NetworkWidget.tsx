import Widget from './Widget';

interface NetworkIface {
  iface: string;
  rxSec: number;
  txSec: number;
  rxTotal: number;
  txTotal: number;
}

function formatSpeed(bytesPerSec: number): string {
  if (bytesPerSec >= 1024 * 1024) return `${(bytesPerSec / 1024 / 1024).toFixed(1)} MB/s`;
  if (bytesPerSec >= 1024) return `${(bytesPerSec / 1024).toFixed(1)} KB/s`;
  return `${Math.round(bytesPerSec)} B/s`;
}

function formatTotal(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

const IGNORED = ['Loopback', 'lo', 'docker', 'veth', 'br-', 'virbr'];

export default function NetworkWidget({ data }: { data: NetworkIface[] | null }) {
  const ifaces = (data ?? []).filter(
    (i) => !IGNORED.some((ig) => i.iface.toLowerCase().startsWith(ig.toLowerCase()))
  );

  return (
    <Widget title="NETWORK" accent="#38bdf8">
      {ifaces.length === 0 ? (
        <div className="text-[#3a5a3a] text-xs tracking-widest text-center py-4">NO INTERFACES</div>
      ) : (
        <div className="space-y-3">
          {ifaces.map((iface) => (
            <div key={iface.iface} className="space-y-1">
              <div className="text-[10px] text-[#38bdf8] tracking-widest uppercase">{iface.iface}</div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-[10px] text-[#3a5a3a] tracking-widest">↓ RX</div>
                  <div className="text-sm text-[#4ade80]">{formatSpeed(iface.rxSec)}</div>
                  <div className="text-[10px] text-[#3a5a3a]">{formatTotal(iface.rxTotal)} total</div>
                </div>
                <div>
                  <div className="text-[10px] text-[#3a5a3a] tracking-widest">↑ TX</div>
                  <div className="text-sm text-[#fbbf24]">{formatSpeed(iface.txSec)}</div>
                  <div className="text-[10px] text-[#3a5a3a]">{formatTotal(iface.txTotal)} total</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Widget>
  );
}
