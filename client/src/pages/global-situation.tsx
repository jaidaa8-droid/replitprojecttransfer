import { useState, useMemo } from "react";
import { Map, Marker, NavigationControl } from "react-map-gl/maplibre";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { Search, X, Zap, ArrowRight, BrainCircuit, Crosshair, Activity } from "lucide-react";
import { useEvents } from "@/hooks/use-events";
import { useAnalyzeEvent } from "@/hooks/use-ai";
import { AppShell } from "@/components/layout/app-shell";
import { SeverityBadge, ConfidenceMeter } from "@/components/ui/severity-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Event } from "@shared/schema";

export default function GlobalSituation() {
  const [timeWindow, setTimeWindow] = useState<"24h" | "48h" | "5d" | "7d">("48h");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  
  const { data: events = [], isLoading } = useEvents(timeWindow);
  
  const selectedEvent = useMemo(() => 
    events.find(e => e.id === selectedEventId) || null
  , [events, selectedEventId]);

  const getMarkerColor = (severity: number) => {
    if (severity >= 5) return '#ef4444'; // red-500
    if (severity === 4) return '#f97316'; // orange-500
    if (severity === 3) return '#eab308'; // yellow-500
    if (severity === 2) return '#22c55e'; // green-500
    return '#3b82f6'; // blue-500
  };

  return (
    <AppShell>
      <div className="relative w-full h-full flex">
        {/* Main Map Area */}
        <div className="flex-1 relative bg-[#09090b]">
          <Map
            initialViewState={{
              longitude: 20,
              latitude: 35,
              zoom: 2.5
            }}
            mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
            attributionControl={false}
          >
            <NavigationControl position="bottom-right" />
            
            {events.map((event) => (
              <Marker
                key={event.id}
                longitude={event.longitude}
                latitude={event.latitude}
                anchor="center"
                onClick={e => {
                  e.originalEvent.stopPropagation();
                  setSelectedEventId(event.id);
                }}
              >
                <div 
                  className={`w-4 h-4 rounded-full cursor-pointer transition-transform hover:scale-125 ${event.severity >= 4 ? 'radar-marker' : ''}`}
                  style={{ 
                    backgroundColor: getMarkerColor(event.severity),
                    boxShadow: `0 0 15px ${getMarkerColor(event.severity)}`
                  }}
                />
              </Marker>
            ))}
          </Map>

          {/* Top Floating Controls */}
          <div className="absolute top-6 left-6 right-6 flex justify-between items-start pointer-events-none z-10">
            <div className="glass-panel rounded-xl p-2 flex items-center gap-2 pointer-events-auto">
              <Search className="w-4 h-4 text-muted-foreground ml-2" />
              <Input 
                className="border-0 bg-transparent focus-visible:ring-0 w-64 text-sm font-mono h-8" 
                placeholder="TRACK ENTITY OR REGION..."
              />
              <div className="w-px h-6 bg-border mx-2" />
              <div className="flex bg-secondary/50 rounded-lg p-1">
                {(["24h", "48h", "5d", "7d"] as const).map(tw => (
                  <button
                    key={tw}
                    onClick={() => setTimeWindow(tw)}
                    className={`px-3 py-1 text-xs font-mono rounded-md transition-all ${
                      timeWindow === tw 
                      ? 'bg-primary/20 text-primary border border-primary/30' 
                      : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {tw}
                  </button>
                ))}
              </div>
            </div>

            <div className="glass-panel px-4 py-2 rounded-xl pointer-events-auto flex items-center gap-4">
              <div className="flex flex-col items-end">
                <span className="text-[10px] text-muted-foreground font-display tracking-widest">ACTIVE NODES</span>
                <span className="font-mono text-primary font-bold">{events.length}</span>
              </div>
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            </div>
          </div>
        </div>

        {/* Right Drawer - Event Details */}
        <AnimatePresence>
          {selectedEvent && (
            <motion.div
              initial={{ x: "100%", opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-[450px] shrink-0 border-l border-border/50 bg-card/95 backdrop-blur-2xl h-full flex flex-col shadow-[-20px_0_40px_rgba(0,0,0,0.5)] z-20"
            >
              <EventDrawerContent event={selectedEvent} onClose={() => setSelectedEventId(null)} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </AppShell>
  );
}

function EventDrawerContent({ event, onClose }: { event: Event, onClose: () => void }) {
  const analyzeMutation = useAnalyzeEvent();
  
  return (
    <>
      <div className="p-4 border-b border-border flex items-center justify-between bg-secondary/30">
        <div className="flex items-center gap-3">
          <Activity className="w-5 h-5 text-primary" />
          <h2 className="font-display font-semibold text-lg tracking-wide text-foreground">NODE: {event.id.toString().padStart(4, '0')}</h2>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} className="rounded-full hover:bg-white/10">
          <X className="w-4 h-4" />
        </Button>
      </div>
      
      <ScrollArea className="flex-1 p-6">
        <div className="space-y-6">
          <div className="flex items-start justify-between gap-4">
            <h1 className="text-xl font-bold leading-tight">{event.title}</h1>
            <SeverityBadge level={event.severity} glow={event.severity >= 4} />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-secondary/30 p-3 rounded-lg border border-border/50">
              <div className="text-[10px] text-muted-foreground font-display tracking-widest mb-1">CATEGORY</div>
              <div className="font-mono text-sm">{event.category}</div>
            </div>
            <div className="bg-secondary/30 p-3 rounded-lg border border-border/50">
              <div className="text-[10px] text-muted-foreground font-display tracking-widest mb-1">TIMESTAMP</div>
              <div className="font-mono text-sm">{format(new Date(event.timestamp), "yyyy-MM-dd HH:mm")}</div>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground font-display tracking-widest mb-2">SIGNAL CONFIDENCE</div>
            <ConfidenceMeter value={event.confidence} />
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground font-display tracking-widest mb-2">INTELLIGENCE SUMMARY</div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {event.description}
            </p>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground font-display tracking-widest mb-2">SOURCES</div>
            <div className="flex flex-wrap gap-2">
              {event.sources.map((src, i) => (
                <span key={i} className="px-2 py-1 bg-secondary rounded text-xs font-mono text-secondary-foreground border border-border">
                  {src}
                </span>
              ))}
            </div>
          </div>

          {!analyzeMutation.data ? (
            <Button 
              className="w-full h-12 font-display tracking-widest gap-2 bg-gradient-to-r from-primary/80 to-primary text-primary-foreground hover:from-primary hover:to-primary/90 shadow-[0_0_20px_rgba(0,229,255,0.3)] transition-all"
              onClick={() => analyzeMutation.mutate({ event_id: event.id })}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? (
                <>
                  <div className="w-4 h-4 rounded-full border-2 border-background border-t-transparent animate-spin" />
                  PROCESSING SYNTHESIS...
                </>
              ) : (
                <>
                  <BrainCircuit className="w-5 h-5" />
                  INITIATE STRATEGIC AI ANALYSIS
                </>
              )}
            </Button>
          ) : (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-8 border-t border-border pt-6"
            >
              <h3 className="font-display font-semibold text-primary flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4" /> AI SYNTHESIS COMPLETE
              </h3>
              
              <Tabs defaultValue="analogues" className="w-full">
                <TabsList className="w-full grid grid-cols-4 bg-secondary/50 rounded-lg h-auto p-1 mb-4">
                  <TabsTrigger value="analogues" className="text-[10px] font-display py-2 data-[state=active]:bg-card">HISTORIC</TabsTrigger>
                  <TabsTrigger value="causal" className="text-[10px] font-display py-2 data-[state=active]:bg-card">CAUSAL</TabsTrigger>
                  <TabsTrigger value="impact" className="text-[10px] font-display py-2 data-[state=active]:bg-card">IMPACT</TabsTrigger>
                  <TabsTrigger value="action" className="text-[10px] font-display py-2 data-[state=active]:bg-card">ACTION</TabsTrigger>
                </TabsList>
                
                <TabsContent value="analogues" className="space-y-4">
                  {analyzeMutation.data.historical_analogues.map((a, i) => (
                    <div key={i} className="bg-secondary/20 p-4 rounded-xl border border-border/50 hover:border-primary/30 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <div className="font-semibold text-sm">{a.title} ({a.year})</div>
                        <div className="text-[10px] font-mono text-primary bg-primary/10 px-2 py-1 rounded">
                          {(a.similarity_score * 100).toFixed(0)}% MATCH
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">{a.rationale}</p>
                    </div>
                  ))}
                </TabsContent>
                
                <TabsContent value="causal" className="space-y-0">
                  {analyzeMutation.data.causal_chain.map((c, i) => (
                    <div key={i} className="relative pl-6 pb-6 last:pb-0">
                      <div className="absolute left-[11px] top-2 bottom-0 w-px bg-border last:hidden" />
                      <div className="absolute left-[7px] top-2 w-2.5 h-2.5 rounded-full bg-secondary border-2 border-primary" />
                      <div className="bg-secondary/20 p-3 rounded-lg border border-border/50">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-xs font-semibold">{c.claim}</span>
                          <span className="text-[10px] font-mono text-warning">{c.probability}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mb-2">HORIZON: {c.time_horizon}</div>
                        <div className="flex flex-wrap gap-1">
                          {c.evidence_signals.map((sig, j) => (
                            <span key={j} className="text-[9px] bg-background px-1.5 py-0.5 rounded border border-border text-muted-foreground">
                              {sig}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="impact" className="space-y-3">
                  {analyzeMutation.data.portfolio_impact.map((p, i) => (
                    <div key={i} className="flex gap-3 bg-secondary/20 p-3 rounded-lg border border-border/50">
                      <div className="mt-0.5"><Crosshair className="w-4 h-4 text-destructive" /></div>
                      <div>
                        <div className="text-sm font-semibold">{p.asset_or_business}</div>
                        <div className="text-xs text-muted-foreground mt-1">{p.pathway}</div>
                        <div className="flex gap-2 mt-2">
                          <span className="text-[10px] font-mono bg-destructive/10 text-destructive px-2 py-0.5 rounded border border-destructive/20">{p.impact_type}</span>
                          <span className="text-[10px] font-mono bg-background px-2 py-0.5 rounded border border-border">{p.magnitude}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="action" className="space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-xs font-display font-bold text-primary flex items-center gap-2"><ArrowRight className="w-3 h-3"/> NO REGRETS</h4>
                    {analyzeMutation.data.action_framework.no_regrets.map((a, i) => (
                      <div key={i} className="bg-secondary/30 p-3 rounded border border-primary/20 text-sm">
                        {a.action}
                        <div className="mt-2 flex gap-2 text-[10px] font-mono">
                          <span className="text-muted-foreground">OWNER: {a.owner_role}</span>
                          <span className="text-muted-foreground">| DUE: {a.deadline}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="space-y-2">
                    <h4 className="text-xs font-display font-bold text-warning flex items-center gap-2"><ArrowRight className="w-3 h-3"/> STUDY NOW</h4>
                    {analyzeMutation.data.action_framework.study_now.map((a, i) => (
                      <div key={i} className="bg-secondary/20 p-3 rounded border border-warning/20 text-sm">
                        {a.action}
                      </div>
                    ))}
                  </div>
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
