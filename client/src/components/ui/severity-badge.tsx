import { cn } from "@/lib/utils";

interface SeverityBadgeProps {
  level: number; // 1 to 5
  className?: string;
  glow?: boolean;
}

export function SeverityBadge({ level, className, glow = false }: SeverityBadgeProps) {
  let colorClass = "bg-slate-500/20 text-slate-400 border-slate-500/50";
  let label = "UNKNOWN";
  
  if (level === 1) {
    colorClass = "bg-blue-500/20 text-blue-400 border-blue-500/50";
    if (glow) colorClass += " shadow-[0_0_10px_rgba(59,130,246,0.5)]";
    label = "LOW";
  } else if (level === 2) {
    colorClass = "bg-green-500/20 text-green-400 border-green-500/50";
    if (glow) colorClass += " shadow-[0_0_10px_rgba(34,197,94,0.5)]";
    label = "GUARDED";
  } else if (level === 3) {
    colorClass = "bg-yellow-500/20 text-yellow-400 border-yellow-500/50";
    if (glow) colorClass += " shadow-[0_0_10px_rgba(234,179,8,0.5)]";
    label = "ELEVATED";
  } else if (level === 4) {
    colorClass = "bg-orange-500/20 text-orange-400 border-orange-500/50";
    if (glow) colorClass += " shadow-[0_0_10px_rgba(249,115,22,0.5)]";
    label = "HIGH";
  } else if (level >= 5) {
    colorClass = "bg-red-500/20 text-red-400 border-red-500/50";
    if (glow) colorClass += " shadow-[0_0_15px_rgba(239,68,68,0.6)]";
    label = "SEVERE";
  }

  return (
    <div className={cn(
      "px-2.5 py-0.5 rounded-sm border text-[10px] font-display font-bold tracking-widest inline-flex items-center justify-center",
      colorClass,
      className
    )}>
      LVL {level} // {label}
    </div>
  );
}

export function ConfidenceMeter({ value }: { value: number }) {
  const percentage = value * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="text-[10px] font-mono text-muted-foreground w-8">{percentage.toFixed(0)}%</div>
      <div className="flex-1 h-1.5 bg-secondary rounded-full overflow-hidden flex">
        <div 
          className="h-full bg-primary transition-all duration-1000"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
