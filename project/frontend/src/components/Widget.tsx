interface WidgetProps {
  title: string;
  children: React.ReactNode;
  className?: string;
  accent?: string;
}

export default function Widget({ title, children, className = '', accent = '#4ade80' }: WidgetProps) {
  return (
    <div className={`border border-[#1e2e1e] bg-[#0b0f0b] p-4 relative ${className}`}>
      <div className="flex items-center gap-2 mb-3">
        <div className="w-1 h-4" style={{ backgroundColor: accent }} />
        <span className="text-xs tracking-widest uppercase" style={{ color: accent }}>
          {title}
        </span>
      </div>
      {children}
    </div>
  );
}
