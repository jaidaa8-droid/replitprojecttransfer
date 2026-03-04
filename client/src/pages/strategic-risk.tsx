import { AppShell } from "@/components/layout/app-shell";
import { Target, Activity, Zap } from "lucide-react";
import { useEvents } from "@/hooks/use-events";
import { SeverityBadge } from "@/components/ui/severity-badge";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";

export default function StrategicRisk() {
  const { data: events = [], isLoading } = useEvents("7d");

  // Only show high severity events for strategic oversight
  const criticalEvents = events.filter(e => e.severity >= 3).sort((a, b) => b.severity - a.severity);

  return (
    <AppShell>
      <div className="h-full flex flex-col p-6 md:p-8 bg-background overflow-hidden">
        <header className="mb-8">
          <h1 className="text-3xl font-display font-bold text-foreground flex items-center gap-3">
            <Target className="w-8 h-8 text-primary" />
            STRATEGIC RISK OVERSIGHT
          </h1>
          <p className="text-muted-foreground font-mono mt-2 text-sm">
            High-priority threat vectors requiring immediate strategic alignment.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-auto pb-8 custom-scrollbar">
          {isLoading ? (
            <div className="col-span-full h-40 flex items-center justify-center font-mono text-muted-foreground">
              INITIALIZING RISK MATRICES...
            </div>
          ) : (
            criticalEvents.map(event => (
              <div key={event.id} className="glass-panel p-6 rounded-xl flex flex-col hover:border-primary/40 transition-colors group">
                <div className="flex justify-between items-start mb-4">
                  <SeverityBadge level={event.severity} glow={event.severity >= 4} />
                  <div className="text-[10px] font-mono text-muted-foreground">{format(new Date(event.timestamp), "MMM dd, HH:mm")}</div>
                </div>
                
                <h3 className="font-semibold text-lg mb-2 leading-tight group-hover:text-primary transition-colors">{event.title}</h3>
                <p className="text-sm text-muted-foreground line-clamp-3 mb-6 flex-1">
                  {event.description}
                </p>

                <div className="mt-auto space-y-4">
                  <div className="flex justify-between items-center border-t border-border/50 pt-4">
                    <span className="text-[10px] font-display text-muted-foreground">CONFIDENCE</span>
                    <span className="font-mono text-sm text-foreground">{(event.confidence * 100).toFixed(1)}%</span>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 bg-secondary/30 border-border hover:bg-secondary text-xs font-mono h-8">
                      <Activity className="w-3 h-3 mr-2" /> MONITOR
                    </Button>
                    <Button className="flex-1 bg-primary/20 text-primary hover:bg-primary hover:text-primary-foreground border border-primary/50 text-xs font-mono h-8">
                      <Zap className="w-3 h-3 mr-2" /> MITIGATE
                    </Button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
