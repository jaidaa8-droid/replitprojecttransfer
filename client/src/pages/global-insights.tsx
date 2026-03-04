import { useState } from "react";
import { Activity, RefreshCw, TrendingUp, AlertTriangle, Globe } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useGenerateInsights } from "@/hooks/use-ai";
import { Button } from "@/components/ui/button";

export default function GlobalInsights() {
  const generateMutation = useGenerateInsights();
  
  return (
    <AppShell>
      <div className="h-full flex flex-col p-6 md:p-8 overflow-hidden bg-[url('https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=2072&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat relative">
        <div className="absolute inset-0 bg-background/90 backdrop-blur-sm z-0" />
        
        <div className="relative z-10 flex-1 flex flex-col">
          <header className="flex flex-col sm:flex-row gap-3 sm:items-end mb-4 md:mb-8">
            <div className="flex-1">
              <h1 className="text-xl md:text-3xl font-display font-bold text-foreground">STRATEGIC INTELLIGENCE BRIEF</h1>
              <p className="text-muted-foreground font-mono mt-1 text-xs md:text-sm">SYSTEM GENERATED SYNTHESIS // CONFIDENTIAL</p>
            </div>
            <Button
              data-testid="button-generate-brief"
              onClick={() => generateMutation.mutate({ timeWindow: "48h" })}
              disabled={generateMutation.isPending}
              className="bg-primary/20 text-primary border border-primary/50 hover:bg-primary/30 shrink-0 text-xs md:text-sm"
            >
              {generateMutation.isPending ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Activity className="w-4 h-4 mr-2" />}
              {generateMutation.isPending ? "COMPILING..." : "GENERATE BRIEF"}
            </Button>
          </header>

          <div className="flex-1 overflow-auto pr-4 custom-scrollbar">
            {!generateMutation.data && !generateMutation.isPending && (
              <div className="h-full flex flex-col items-center justify-center text-center text-muted-foreground">
                <Globe className="w-16 h-16 mb-4 opacity-20" />
                <p className="font-display tracking-widest">AWAITING SYNTHESIS COMMAND</p>
              </div>
            )}

            {generateMutation.isPending && (
              <div className="h-full flex flex-col items-center justify-center text-primary space-y-4">
                <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="font-mono text-sm animate-pulse">AGGREGATING GLOBAL SENSORS...</p>
              </div>
            )}

            {generateMutation.data && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Key Developments */}
                <div className="glass-panel p-6 rounded-xl flex flex-col">
                  <h3 className="font-display text-lg text-primary flex items-center gap-2 mb-6">
                    <Activity className="w-5 h-5" />
                    KEY DEVELOPMENTS
                  </h3>
                  <div className="space-y-4 flex-1">
                    {generateMutation.data.key_developments.map((dev, i) => (
                      <div key={i} className="flex gap-4 items-start bg-secondary/30 p-4 rounded-lg border border-border">
                        <div className="font-mono text-primary opacity-50 mt-1">{String(i+1).padStart(2, '0')}</div>
                        <p className="text-sm leading-relaxed">{dev}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-6 flex flex-col">
                  {/* Emerging Risks */}
                  <div className="glass-panel p-6 rounded-xl flex-1">
                    <h3 className="font-display text-lg text-destructive flex items-center gap-2 mb-4">
                      <AlertTriangle className="w-5 h-5" />
                      EMERGING RISKS
                    </h3>
                    <ul className="space-y-3">
                      {generateMutation.data.emerging_risks.map((risk, i) => (
                        <li key={i} className="flex gap-3 text-sm text-muted-foreground items-start">
                          <div className="w-1.5 h-1.5 rounded-full bg-destructive mt-1.5 shrink-0" />
                          <span>{risk}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Trend Indicators */}
                  <div className="glass-panel p-6 rounded-xl">
                    <h3 className="font-display text-lg text-foreground flex items-center gap-2 mb-4">
                      <TrendingUp className="w-5 h-5" />
                      TREND INDICATORS
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                      {generateMutation.data.trend_indicators.map((trend, i) => (
                        <div key={i} className="bg-secondary/50 p-3 rounded-lg border border-border/50 flex justify-between items-center">
                          <span className="text-xs font-mono truncate mr-2" title={trend.indicator}>{trend.indicator}</span>
                          <span className={`text-[10px] font-bold px-2 py-1 rounded ${
                            trend.trend === 'up' ? 'bg-destructive/20 text-destructive' :
                            trend.trend === 'down' ? 'bg-green-500/20 text-green-400' :
                            'bg-yellow-500/20 text-yellow-400'
                          }`}>
                            {trend.trend.toUpperCase()}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
