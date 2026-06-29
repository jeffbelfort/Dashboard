interface BarProps {
  value: number;
  max?: number;
  height?: number;
  label?: string;
  showValue?: boolean;
}

export default function Bar({ value, max = 100, height = 4, label, showValue = true }: BarProps) {
  const pct = Math.min((value / max) * 100, 100);
  const color = pct < 60 ? '#4ade80' : pct < 80 ? '#fbbf24' : '#ef4444';

  return (
    <div className="w-full">
      {(label || showValue) && (
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-[#3a5a3a] tracking-wider">{label}</span>
          <span style={{ color }}>{Math.round(pct)}%</span>
        </div>
      )}
      <div className="w-full bg-[#1e2e1e]" style={{ height }}>
        <div
          className="h-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}
