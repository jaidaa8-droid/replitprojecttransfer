import { useState, useMemo } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
import { motion, AnimatePresence } from "framer-motion";
import { formatDistanceToNow, format } from "date-fns";
import {
  Search, X, Zap, ArrowRight, BrainCircuit, Crosshair,
  Activity, ChevronLeft, Filter, Clock, RefreshCw, Layers, Radio, ExternalLink
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useEvents } from "@/hooks/use-events";
import { useAnalyzeEvent } from "@/hooks/use-ai";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { api } from "@shared/routes";
import { AppShell } from "@/components/layout/app-shell";
import { SeverityBadge, ConfidenceMeter } from "@/components/ui/severity-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { Event } from "@shared/schema";

const CATEGORIES = [
  "All", "Conflicts", "Military activity", "Cyber", "Energy",
  "Sanctions", "Economic disruptions", "Infrastructure outages",
  "Natural disasters", "Trade chokepoints", "Strategic hotspots",
];

const SEVERITY_COLORS: Record<number, string> = {
  5: "#ef4444",
  4: "#f97316",
  3: "#eab308",
  2: "#22c55e",
  1: "#005C4D",
};

const SEVERITY_LABELS: Record<number, string> = {
  5: "CRITICAL",
  4: "HIGH",
  3: "MEDIUM",
  2: "LOW",
  1: "INFO",
};

function severityColor(s: number) {
  return SEVERITY_COLORS[s] ?? SEVERITY_COLORS[1];
}

export default function GlobalSituation() {
  const [timeWindow, setTimeWindow] = useState<"24h" | "48h" | "5d" | "7d">("7d");
  const [selectedEventId, setSelectedEventId] = useState<number | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [severityFilter, setSeverityFilter] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const [feedOpen, setFeedOpen] = useState(true);

  const { data: events = [], isLoading, isFetching, refetch } = useEvents(timeWindow);

  const fetchLiveNews = useMutation({
    mutationFn: () => apiRequest(api.news.refresh.path, { method: "POST" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.events.list.path] });
    },
  });

  const filteredEvents = useMemo(() => {
    return events.filter(e => {
      if (categoryFilter !== "All" && e.category !== categoryFilter) return false;
      if (severityFilter !== null && e.severity !== severityFilter) return false;
      if (search && !e.title.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  }, [events, categoryFilter, severityFilter, search]);

  const selectedEvent = useMemo(
    () => events.find(e => e.id === selectedEventId) ?? null,
    [events, selectedEventId]
  );

  return (
    <AppShell>
      <div className="relative w-full h-full flex flex-col md:flex-row overflow-hidden">

        {/* ── MAP ─────────────────────────────────────────────────── */}
        <div
          className="relative bg-[#1a1a2e] flex-1 min-h-0"
          style={{ zIndex: 0 }}
        >
          <MapContainer
            center={[25, 20]}
            zoom={2}
            minZoom={2}
            maxZoom={10}
            style={{ width: "100%", height: "100%", background: "#1a1a2e" }}
            attributionControl={false}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
              subdomains="abcd"
              maxZoom={20}
            />

            {filteredEvents.map(event => (
              <CircleMarker
                key={event.id}
                center={[event.latitude, event.longitude]}
                radius={event.severity >= 4 ? 9 : 6}
                pathOptions={{
                  color: severityColor(event.severity),
                  fillColor: severityColor(event.severity),
                  fillOpacity: selectedEventId === event.id ? 1 : 0.75,
                  weight: selectedEventId === event.id ? 3 : 1.5,
                  opacity: 1,
                }}
                eventHandlers={{
                  click: () => setSelectedEventId(event.id),
                }}
              >
                <Tooltip direction="top" offset={[0, -8]} opacity={0.95}>
                  <span className="font-mono text-xs">{event.title}</span>
                </Tooltip>
              </CircleMarker>
            ))}
          </MapContainer>

          {/* Attribution */}
          <div className="absolute bottom-1 right-2 z-[1000] text-[10px] text-white/50 font-mono pointer-events-none">
            © OpenStreetMap contributors
          </div>

          {/* Time window pill */}
          <div className="absolute top-3 left-3 z-[1000] flex gap-1 bg-black/80 backdrop-blur rounded-lg p-1 border border-white/10">
            {([
              { label: "24h", value: "24h" as const },
              { label: "48h", value: "48h" as const },
              { label: "5d", value: "5d" as const },
              { label: "7d", value: "7d" as const },
            ]).map(({ label, value }) => (
              <button
                key={label}
                data-testid={`button-time-${label.toLowerCase()}`}
                onClick={() => setTimeWindow(value)}
                className={`px-2 md:px-3 py-1 text-xs font-mono rounded-md transition-all ${
                  timeWindow === value
                    ? "bg-primary/20 text-primary border border-primary/40"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Stats pill — hidden on mobile to save space */}
          <div className="hidden md:flex absolute top-3 right-3 z-[1000] items-center gap-3 bg-black/80 backdrop-blur border border-white/10 px-4 py-2 rounded-lg">
            <div className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
            <span className="text-xs font-mono text-muted-foreground">
              <span className="text-foreground font-bold">{filteredEvents.length}</span> NODES ACTIVE
            </span>
          </div>

          {/* Severity legend — hidden on mobile */}
          <div className="hidden md:block absolute bottom-8 left-4 z-[1000] bg-black/80 backdrop-blur border border-white/10 rounded-lg p-3 space-y-1.5">
            {[5, 4, 3, 2, 1].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div
                  className="w-2.5 h-2.5 rounded-full"
                  style={{ backgroundColor: severityColor(s), boxShadow: `0 0 6px ${severityColor(s)}` }}
                />
                <span className="text-[10px] font-mono text-white/70">{SEVERITY_LABELS[s]}</span>
              </div>
            ))}
          </div>

          {/* Mobile feed toggle button */}
          <button
            data-testid="button-toggle-feed"
            onClick={() => setFeedOpen(v => !v)}
            className="md:hidden absolute bottom-4 right-4 z-[1000] flex items-center gap-1.5 bg-black/90 backdrop-blur border border-white/20 px-3 py-2 rounded-full text-xs font-mono text-white/80 shadow-lg"
          >
            <Layers className="w-3.5 h-3.5" />
            {feedOpen ? "HIDE FEED" : "SHOW FEED"}
          </button>
        </div>

        {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
        <div
          className={`${feedOpen ? "flex h-1/2" : "hidden"} md:flex md:h-full md:w-[380px] w-full shrink-0 border-t md:border-t-0 md:border-l border-border/50 bg-card/95 backdrop-blur-xl flex-col relative`}
          style={{ zIndex: 10 }}
        >

          {/* Event detail panel — slides in over the list */}
          <AnimatePresence>
            {selectedEvent && (
              <motion.div
                key="detail"
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 26, stiffness: 220 }}
                className="absolute inset-0 z-20 flex flex-col bg-card"
              >
                <EventDetail
                  event={selectedEvent}
                  onClose={() => setSelectedEventId(null)}
                />
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Events feed header ── */}
          <div className="p-4 border-b border-border bg-secondary/20 shrink-0">
            <div className="flex items-center gap-2 mb-3">
              <Activity className="w-4 h-4 text-primary" />
              <span className="font-display font-semibold text-sm tracking-widest text-foreground">INTELLIGENCE FEED</span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {filteredEvents.length}/{events.length}
              </span>
                <div className="ml-auto flex items-center gap-1">
                <button
                  data-testid="button-fetch-live-news"
                  onClick={() => fetchLiveNews.mutate()}
                  disabled={fetchLiveNews.isPending}
                  className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono rounded border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
                  title="Fetch live news from RSS feeds"
                >
                  <Radio className={`w-3 h-3 ${fetchLiveNews.isPending ? "animate-pulse" : ""}`} />
                  {fetchLiveNews.isPending ? "FETCHING..." : "LIVE"}
                </button>
                <button
                  data-testid="button-refresh-feed"
                  onClick={() => refetch()}
                  disabled={isFetching}
                  className="p-1.5 rounded-md hover:bg-secondary/60 transition-colors disabled:opacity-50"
                  title="Refresh feed"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 text-muted-foreground ${isFetching ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                data-testid="input-event-search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8 h-8 text-xs font-mono bg-secondary/40 border-border/50"
                placeholder="SEARCH EVENTS..."
              />
              {search && (
                <button onClick={() => setSearch("")} className="absolute right-2.5 top-1/2 -translate-y-1/2">
                  <X className="w-3 h-3 text-muted-foreground" />
                </button>
              )}
            </div>

            {/* Severity filter */}
            <div className="flex gap-1 mb-2 flex-wrap">
              <button
                data-testid="button-sev-all"
                onClick={() => setSeverityFilter(null)}
                className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-all ${
                  severityFilter === null
                    ? "bg-secondary text-foreground border-border"
                    : "text-muted-foreground border-transparent"
                }`}
              >ALL SEV</button>
              {[5, 4, 3, 2, 1].map(s => (
                <button
                  key={s}
                  data-testid={`button-sev-${s}`}
                  onClick={() => setSeverityFilter(severityFilter === s ? null : s)}
                  className={`px-2 py-0.5 text-[10px] font-mono rounded border transition-all ${
                    severityFilter === s
                      ? "text-black border-transparent"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  }`}
                  style={severityFilter === s ? { backgroundColor: severityColor(s) } : {}}
                >
                  S{s}
                </button>
              ))}
            </div>

            {/* Category filter */}
            <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
              {CATEGORIES.map(cat => (
                <button
                  key={cat}
                  data-testid={`button-cat-${cat.replace(/\s+/g, "-").toLowerCase()}`}
                  onClick={() => setCategoryFilter(cat)}
                  className={`whitespace-nowrap px-2 py-0.5 text-[10px] font-mono rounded border transition-all shrink-0 ${
                    categoryFilter === cat
                      ? "bg-primary/20 text-primary border-primary/40"
                      : "text-muted-foreground border-transparent hover:text-foreground"
                  }`}
                >
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* ── Events list ── */}
          <ScrollArea className="flex-1">
            {isLoading ? (
              <div className="p-6 space-y-3">
                {[...Array(8)].map((_, i) => (
                  <div key={i} className="h-16 rounded-lg bg-secondary/30 animate-pulse" />
                ))}
              </div>
            ) : filteredEvents.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 text-muted-foreground text-xs font-mono">
                <Filter className="w-6 h-6 mb-2 opacity-40" />
                NO EVENTS MATCH FILTERS
              </div>
            ) : (
              <div className="p-2 space-y-1">
                {filteredEvents.map(event => (
                  <button
                    key={event.id}
                    data-testid={`card-event-${event.id}`}
                    onClick={() => setSelectedEventId(event.id)}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      selectedEventId === event.id
                        ? "bg-primary/10 border-primary/30"
                        : "bg-secondary/20 border-border/30 hover:border-border hover:bg-secondary/40"
                    }`}
                  >
                    <div className="flex items-start gap-2.5">
                      <div
                        className="mt-1 shrink-0 w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: severityColor(event.severity),
                          boxShadow: `0 0 6px ${severityColor(event.severity)}`,
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold leading-snug mb-1 truncate">
                          {event.title}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                            {event.category}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            {formatDistanceToNow(new Date(event.timestamp), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                      <span
                        className="text-[10px] font-mono font-bold shrink-0"
                        style={{ color: severityColor(event.severity) }}
                      >
                        S{event.severity}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </AppShell>
  );
}

/* ─── Event Detail Panel ──────────────────────────────────────────── */
function EventDetail({ event, onClose }: { event: Event; onClose: () => void }) {
  const analyzeMutation = useAnalyzeEvent();

  return (
    <>
      <div className="p-3 border-b border-border bg-secondary/30 flex items-center gap-2 shrink-0">
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-detail">
          <ChevronLeft className="w-4 h-4" />
        </Button>
        <Activity className="w-4 h-4 text-primary" />
        <span className="font-display text-sm font-semibold tracking-wide">NODE {event.id.toString().padStart(4, "0")}</span>
        <div className="ml-auto">
          <SeverityBadge level={event.severity} glow={event.severity >= 4} />
        </div>
      </div>

      <ScrollArea className="flex-1 p-5">
        <div className="space-y-5">
          <h1 className="text-base font-bold leading-snug">{event.title}</h1>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-secondary/30 p-3 rounded-lg border border-border/50">
              <div className="text-[10px] text-muted-foreground font-mono tracking-widest mb-1">CATEGORY</div>
              <div className="font-mono text-xs">{event.category}</div>
            </div>
            <div className="bg-secondary/30 p-3 rounded-lg border border-border/50">
              <div className="text-[10px] text-muted-foreground font-mono tracking-widest mb-1">TIMESTAMP</div>
              <div className="font-mono text-xs">{format(new Date(event.timestamp), "MMM dd HH:mm")}</div>
            </div>
            <div className="bg-secondary/30 p-3 rounded-lg border border-border/50">
              <div className="text-[10px] text-muted-foreground font-mono tracking-widest mb-1">COORDINATES</div>
              <div className="font-mono text-xs">{event.latitude.toFixed(2)}°, {event.longitude.toFixed(2)}°</div>
            </div>
            <div className="bg-secondary/30 p-3 rounded-lg border border-border/50">
              <div className="text-[10px] text-muted-foreground font-mono tracking-widest mb-1">SEVERITY</div>
              <div className="font-mono text-xs font-bold" style={{ color: severityColor(event.severity) }}>
                {SEVERITY_LABELS[event.severity]}
              </div>
            </div>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground font-mono tracking-widest mb-2">CONFIDENCE</div>
            <ConfidenceMeter value={event.confidence} />
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground font-mono tracking-widest mb-2">INTELLIGENCE SUMMARY</div>
            <p className="text-xs text-muted-foreground leading-relaxed">{event.description}</p>
          </div>

          <div>
            <div className="text-[10px] text-muted-foreground font-mono tracking-widest mb-2">SOURCES</div>
            <div className="flex flex-wrap gap-1.5">
              {event.sources.map((src, i) => (
                <span key={i} className="px-2 py-0.5 bg-secondary rounded text-xs font-mono border border-border">
                  {src}
                </span>
              ))}
            </div>
          </div>

          {event.sourceUrls && event.sourceUrls.length > 0 && (
            <div>
              <div className="text-[10px] text-muted-foreground font-mono tracking-widest mb-2">
                SOURCE REFERENCES ({event.sourceUrls.length})
              </div>
              <div className="flex flex-col gap-1.5">
                {event.sourceUrls.map((url, i) => {
                  let domain = url;
                  try { domain = new URL(url).hostname.replace("www.", ""); } catch {}
                  return (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid={`link-source-url-${i}`}
                      className="flex items-center gap-1.5 text-xs text-primary hover:underline font-mono group"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0 opacity-60 group-hover:opacity-100" />
                      <span className="truncate">{domain}</span>
                    </a>
                  );
                })}
              </div>
            </div>
          )}

          {!analyzeMutation.data ? (
            <Button
              data-testid="button-analyze"
              className="w-full gap-2"
              onClick={() => analyzeMutation.mutate({ event_id: event.id })}
              disabled={analyzeMutation.isPending}
            >
              {analyzeMutation.isPending ? (
                <>
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-background border-t-transparent animate-spin" />
                  PROCESSING...
                </>
              ) : (
                <>
                  <BrainCircuit className="w-4 h-4" />
                  ANALYZE IMPLICATIONS
                </>
              )}
            </Button>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              className="border-t border-border pt-4"
            >
              <h3 className="font-display text-xs font-semibold text-primary flex items-center gap-1.5 mb-3">
                <Zap className="w-3.5 h-3.5" /> AI SYNTHESIS COMPLETE
              </h3>

              <Tabs defaultValue="analogues" className="w-full">
                <TabsList className="w-full grid grid-cols-4 bg-secondary/50 h-auto p-0.5 mb-3">
                  <TabsTrigger value="analogues" className="text-[10px] font-mono py-1.5">HIST</TabsTrigger>
                  <TabsTrigger value="causal" className="text-[10px] font-mono py-1.5">CAUSAL</TabsTrigger>
                  <TabsTrigger value="impact" className="text-[10px] font-mono py-1.5">IMPACT</TabsTrigger>
                  <TabsTrigger value="action" className="text-[10px] font-mono py-1.5">ACTION</TabsTrigger>
                </TabsList>

                <TabsContent value="analogues" className="space-y-3">
                  {analyzeMutation.data.historical_analogues.map((a, i) => (
                    <div key={i} className="bg-secondary/20 p-3 rounded-lg border border-border/50">
                      <div className="flex justify-between items-start mb-1 gap-2">
                        <div className="font-semibold text-xs">{a.title} ({a.year})</div>
                        <div className="text-[10px] font-mono text-primary bg-primary/10 px-1.5 py-0.5 rounded shrink-0">
                          {(a.similarity_score * 100).toFixed(0)}%
                        </div>
                      </div>
                      <p className="text-[11px] text-muted-foreground">{a.rationale}</p>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="causal" className="space-y-0">
                  {analyzeMutation.data.causal_chain.map((c, i) => (
                    <div key={i} className="relative pl-5 pb-4 last:pb-0">
                      <div className="absolute left-[9px] top-2 bottom-0 w-px bg-border" />
                      <div className="absolute left-[6px] top-2 w-2 h-2 rounded-full bg-secondary border-2 border-primary" />
                      <div className="bg-secondary/20 p-2.5 rounded-lg border border-border/50">
                        <div className="flex justify-between items-center mb-0.5 gap-2">
                          <span className="text-xs font-semibold">{c.claim}</span>
                          <span className="text-[10px] font-mono text-yellow-400 shrink-0">{c.probability}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground font-mono mb-1.5">↳ {c.time_horizon}</div>
                        <div className="flex flex-wrap gap-1">
                          {c.evidence_signals.map((sig, j) => (
                            <span key={j} className="text-[9px] bg-background px-1.5 py-0.5 rounded border border-border/70 text-muted-foreground">
                              {sig}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="impact" className="space-y-2">
                  {analyzeMutation.data.portfolio_impact.map((p, i) => (
                    <div key={i} className="flex gap-2.5 bg-secondary/20 p-2.5 rounded-lg border border-border/50">
                      <Crosshair className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <div className="text-xs font-semibold">{p.asset_or_business}</div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">{p.pathway}</div>
                        <div className="flex gap-1.5 mt-1.5">
                          <span className="text-[10px] font-mono bg-destructive/10 text-destructive px-1.5 py-0.5 rounded border border-destructive/20">{p.impact_type}</span>
                          <span className="text-[10px] font-mono bg-background px-1.5 py-0.5 rounded border border-border">{p.magnitude}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </TabsContent>

                <TabsContent value="action" className="space-y-3">
                  {[
                    { label: "NO REGRETS", key: "no_regrets" as const, color: "text-primary", borderColor: "border-primary/20" },
                    { label: "STUDY NOW", key: "study_now" as const, color: "text-yellow-400", borderColor: "border-yellow-400/20" },
                    { label: "MONITOR", key: "monitor" as const, color: "text-muted-foreground", borderColor: "border-border" },
                  ].map(({ label, key, color, borderColor }) => (
                    <div key={key}>
                      <h4 className={`text-[10px] font-mono font-bold ${color} flex items-center gap-1 mb-1.5`}>
                        <ArrowRight className="w-2.5 h-2.5" /> {label}
                      </h4>
                      {analyzeMutation.data!.action_framework[key].map((a, i) => (
                        <div key={i} className={`bg-secondary/20 p-2.5 rounded border ${borderColor} text-xs mb-1.5`}>
                          {a.action}
                          <div className="mt-1 text-[10px] font-mono text-muted-foreground">
                            {a.owner_role} · {a.deadline}
                            {"trigger" in a && a.trigger ? ` · IF: ${a.trigger}` : ""}
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </TabsContent>
              </Tabs>
            </motion.div>
          )}
        </div>
      </ScrollArea>
    </>
  );
}
