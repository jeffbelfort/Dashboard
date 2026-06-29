import Widget from './Widget';
import Gauge from './Gauge';

interface MemData {
  used: number;
  total: number;
  percent: number;
}

function formatBytes(bytes: number): string {
  const gb = bytes / 1024 / 1024 / 1024;
  return gb >= 1 ? `${gb.toFixed(1)}GB` : `${(bytes / 1024 / 1024).toFixed(0)}MB`;
}

export default function MemoryWidget({ data }: { data: MemData | null }) {
  const percent = data?.percent ?? 0;

  return (
    <Widget title="MEMORY" accent="#a78bfa">
      <div className="flex gap-4 items-center">
        <Gauge value={percent} size={90} color="#a78bfa" label="USED" />
        <div className="flex-1 space-y-3">
          <div>
            <div className="text-[10px] text-[#3a5a3a] tracking-widest uppercase">USED</div>
            <div className="text-lg text-[#a78bfa]">{data ? formatBytes(data.used) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#3a5a3a] tracking-widest uppercase">TOTAL</div>
            <div className="text-lg text-[#7a6ab0]">{data ? formatBytes(data.total) : '—'}</div>
          </div>
          <div>
            <div className="text-[10px] text-[#3a5a3a] tracking-widest uppercase">FREE</div>
            <div className="text-lg text-[#3a5a3a]">
              {data ? formatBytes(data.total - data.used) : '—'}
            </div>
          </div>
        </div>
      </div>
    </Widget>
  );
}
