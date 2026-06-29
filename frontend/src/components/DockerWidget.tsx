import Widget from './Widget';
import Bar from './Bar';

interface ContainerStat {
  name: string;
  cpu: number;
  memory: number;
  memUsed: number;
  memLimit: number;
  status: string;
}

function formatBytes(bytes: number): string {
  const mb = bytes / 1024 / 1024;
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${mb.toFixed(0)}MB`;
}

export default function DockerWidget({ data }: { data: ContainerStat[] | null }) {
  const containers = data ?? [];

  return (
    <Widget title={`DOCKER // ${containers.length} CONTAINERS`} accent="#f472b6">
      {containers.length === 0 ? (
        <div className="text-[#3a5a3a] text-xs tracking-widest text-center py-4">
          {data === null ? 'CONNECTING...' : 'NO CONTAINERS'}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {containers.map((c) => (
            <div key={c.name} className="border border-[#1e2e1e] p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs text-[#c8d8c0] tracking-wider truncate">{c.name}</span>
                <span className="text-[10px] text-[#4ade80] tracking-widest uppercase ml-2 shrink-0">
                  ● UP
                </span>
              </div>
              <Bar value={c.cpu} label="CPU" />
              <Bar value={c.memory} label="MEM" />
              <div className="text-[10px] text-[#3a5a3a] tracking-widest">
                {formatBytes(c.memUsed)} / {formatBytes(c.memLimit)}
              </div>
            </div>
          ))}
        </div>
      )}
    </Widget>
  );
}
