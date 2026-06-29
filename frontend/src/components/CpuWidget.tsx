import Widget from './Widget';
import Gauge from './Gauge';
import Bar from './Bar';

interface CpuData {
  load: number;
  cores: number[];
}

export default function CpuWidget({ data }: { data: CpuData | null }) {
  const load = data?.load ?? 0;
  const cores = data?.cores ?? [];

  return (
    <Widget title="CPU">
      <div className="flex gap-4 items-start">
        <Gauge value={load} size={90} label="TOTAL" />
        <div className="flex-1 space-y-2">
          {cores.slice(0, 8).map((c, i) => (
            <Bar key={i} value={c} label={`C${i}`} />
          ))}
          {cores.length > 8 && (
            <div className="text-[10px] text-[#3a5a3a] tracking-widest">+{cores.length - 8} MORE CORES</div>
          )}
        </div>
      </div>
    </Widget>
  );
}
