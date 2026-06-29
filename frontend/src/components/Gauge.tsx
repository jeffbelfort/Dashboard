interface GaugeProps {
  value: number;
  max?: number;
  size?: number;
  color?: string;
  label?: string;
  unit?: string;
}

export default function Gauge({ value, max = 100, size = 80, color = '#4ade80', label, unit = '%' }: GaugeProps) {
  const pct = Math.min(value / max, 1);
  const r = (size / 2) - 8;
  const circ = 2 * Math.PI * r;
  const dash = pct * circ;
  const gap = circ - dash;

  const hue = pct < 0.6 ? '#4ade80' : pct < 0.8 ? '#fbbf24' : '#ef4444';
  const strokeColor = color === '#4ade80' ? hue : color;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke="#1e2e1e" strokeWidth="4"
          />
          <circle
            cx={size / 2} cy={size / 2} r={r}
            fill="none" stroke={strokeColor} strokeWidth="4"
            strokeDasharray={`${dash} ${gap}`}
            strokeLinecap="butt"
            style={{ transition: 'stroke-dasharray 0.5s ease, stroke 0.5s ease' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-mono" style={{ color: strokeColor }}>
            {Math.round(value)}{unit}
          </span>
        </div>
      </div>
      {label && <span className="text-[10px] text-[#3a5a3a] tracking-widest uppercase">{label}</span>}
    </div>
  );
}
