import { AppShell } from "@/components/layout/app-shell";
import { PieChart } from "lucide-react";
import { useSectors } from "@/hooks/use-sectors";
import { useMemo } from "react";

export default function SectorHeatmap() {
  const { data: sectors = [], isLoading } = useSectors();

  // Group data to build matrix
  const { uniqueSectors, uniqueRegions, matrix } = useMemo(() => {
    const sSet = new Set<string>();
    const rSet = new Set<string>();
    
    sectors.forEach(s => {
      sSet.add(s.sector);
      rSet.add(s.region);
    });

    const uSectors = Array.from(sSet).sort();
    const uRegions = Array.from(rSet).sort();

    const mat = new Map<string, number>();
    sectors.forEach(s => {
      mat.set(`${s.sector}-${s.region}`, s.riskScore);
    });

    return { uniqueSectors: uSectors, uniqueRegions: uRegions, matrix: mat };
  }, [sectors]);

  const getHeatColor = (score?: number) => {
    if (score === undefined) return "bg-secondary/20 border-transparent";
    if (score >= 80) return "bg-destructive/40 border-destructive shadow-[inset_0_0_20px_rgba(239,68,68,0.2)]";
    if (score >= 60) return "bg-orange-500/30 border-orange-500/50";
    if (score >= 40) return "bg-yellow-500/20 border-yellow-500/30";
    return "bg-green-500/10 border-green-500/20";
  };

  return (
    <AppShell>
      <div className="h-full flex flex-col p-6 md:p-8 bg-background overflow-hidden">
        <header className="mb-4 md:mb-8">
          <h1 className="text-xl md:text-3xl font-display font-bold text-foreground flex items-center gap-2 md:gap-3">
            <PieChart className="w-6 h-6 md:w-8 md:h-8 text-primary shrink-0" />
            GLOBAL SECTOR HEATMAP
          </h1>
          <p className="text-muted-foreground font-mono mt-1 text-xs md:text-sm">
            Cross-matrix risk correlation by industry vertical and geopolitical zone.
          </p>
        </header>

        <div className="flex-1 overflow-auto custom-scrollbar">
          {isLoading ? (
            <div className="h-64 flex items-center justify-center font-mono text-muted-foreground">
              RENDERING HEAT MATRIX...
            </div>
          ) : (
            <div className="inline-block min-w-full glass-panel rounded-xl p-6">
              <div className="flex">
                {/* Y-axis Labels (Sectors) */}
                <div className="flex flex-col mt-10 mr-4 shrink-0">
                  {uniqueSectors.map(sector => (
                    <div key={sector} className="h-12 flex items-center justify-end font-mono text-xs text-muted-foreground text-right w-32 truncate pr-4 border-r border-border">
                      {sector}
                    </div>
                  ))}
                </div>

                <div>
                  {/* X-axis Labels (Regions) */}
                  <div className="flex mb-4">
                    {uniqueRegions.map(region => (
                      <div key={region} className="w-24 shrink-0 text-center font-display text-[10px] text-muted-foreground uppercase tracking-wider px-2">
                        <div className="h-10 flex items-end justify-center">{region}</div>
                      </div>
                    ))}
                  </div>

                  {/* Grid */}
                  <div className="flex flex-col gap-1.5">
                    {uniqueSectors.map(sector => (
                      <div key={sector} className="flex gap-1.5">
                        {uniqueRegions.map(region => {
                          const score = matrix.get(`${sector}-${region}`);
                          return (
                            <div 
                              key={`${sector}-${region}`}
                              className={`w-24 h-[42px] shrink-0 rounded border transition-all hover:scale-105 hover:z-10 cursor-crosshair flex items-center justify-center ${getHeatColor(score)}`}
                              title={`${sector} in ${region}: Risk Score ${score || 'N/A'}`}
                            >
                              {score !== undefined && (
                                <span className="font-mono text-xs font-bold opacity-80">{score}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              
              {/* Legend */}
              <div className="mt-8 flex items-center gap-4 border-t border-border/50 pt-4">
                <span className="text-[10px] font-display text-muted-foreground tracking-widest">RISK INDEX</span>
                <div className="flex gap-2">
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-green-500/10 border border-green-500/20" /> <span className="text-[10px] font-mono text-muted-foreground">&lt;40</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-yellow-500/20 border border-yellow-500/30" /> <span className="text-[10px] font-mono text-muted-foreground">40-59</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-orange-500/30 border border-orange-500/50" /> <span className="text-[10px] font-mono text-muted-foreground">60-79</span></div>
                  <div className="flex items-center gap-1"><div className="w-3 h-3 rounded bg-destructive/40 border border-destructive" /> <span className="text-[10px] font-mono text-muted-foreground">80+</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
