import { useState, useMemo } from "react";
import { AppShell } from "@/components/layout/app-shell";
import { useAiTrends } from "@/hooks/use-ai-trends";
import type { AiTrend } from "@shared/schema";
import {
  BrainCircuit, TrendingUp, Globe2, Shield, Building2,
  ExternalLink, ChevronDown, ChevronUp, Filter, Calendar, Award,
  Lightbulb, DollarSign, Landmark, Cpu, Zap,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

const BRAND = "#005C4D";

const REGIONS = ["All", "North America", "Europe", "Asia Pacific", "Middle East", "Global", "Latin America", "Africa"];
const CATEGORIES = ["All", "Investment", "M&A", "IPO", "Partnership", "Policy", "Infrastructure", "Research"];
const SECTORS = ["All", "Artificial Intelligence", "Semiconductors", "Infrastructure", "Energy", "Transportation", "Healthcare", "Finance", "Defense & Security"];

const SOURCE_TYPE_COLORS: Record<string, string> = {
  "Investor Relations": "bg-blue-500/20 text-blue-300 border-blue-500/30",
  "Government": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Government / Official": "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  "Academic Research": "bg-purple-500/20 text-purple-300 border-purple-500/30",
  "International Organisation": "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
  "Regulatory": "bg-amber-500/20 text-amber-300 border-amber-500/30",
  "News Wire": "bg-rose-500/20 text-rose-300 border-rose-500/30",
  "Market Research": "bg-orange-500/20 text-orange-300 border-orange-500/30",
  "Institutional Media": "bg-rose-500/20 text-rose-300 border-rose-500/30",
  "Partnership": "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
};

const CATEGORY_ICONS: Record<string, typeof TrendingUp> = {
  "Investment": DollarSign,
  "M&A": Building2,
  "IPO": TrendingUp,
  "Partnership": Globe2,
  "Policy": Landmark,
  "Infrastructure": Cpu,
  "Research": BrainCircuit,
};

const CATEGORY_COLORS: Record<string, string> = {
  "Investment": "#005C4D",
  "M&A": "#0284c7",
  "IPO": "#7c3aed",
  "Partnership": "#0891b2",
  "Policy": "#d97706",
  "Infrastructure": "#6366f1",
  "Research": "#64748b",
};

const SIGNIFICANCE_LABELS: Record<number, { label: string; color: string }> = {
  5: { label: "HIGH", color: "text-red-400 bg-red-500/10 border-red-500/30" },
  4: { label: "SIGNIFICANT", color: "text-orange-400 bg-orange-500/10 border-orange-500/30" },
  3: { label: "NOTABLE", color: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30" },
  2: { label: "MONITOR", color: "text-blue-400 bg-blue-500/10 border-blue-500/30" },
  1: { label: "INFORMATIONAL", color: "text-slate-400 bg-slate-500/10 border-slate-500/30" },
};

function formatAmount(amount: number | null | undefined): string {
  if (!amount) return "—";
  if (amount >= 1) return `$${amount.toFixed(1)}B`;
  return `$${(amount * 1000).toFixed(0)}M`;
}

function formatDate(d: string | Date): string {
  const date = new Date(d);
  return date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

function SourceLabel({ sourceName, sourceType, sourceUrl, publicationDate, updatedAt }: {
  sourceName: string; sourceType: string; sourceUrl?: string | null;
  publicationDate: string | Date; updatedAt: string | Date;
}) {
  const typeClass = SOURCE_TYPE_COLORS[sourceType] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30";
  return (
    <div className="flex flex-wrap items-center gap-1.5 mt-2" data-testid="source-label">
      <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${typeClass}`}>{sourceType.toUpperCase()}</span>
      {sourceUrl ? (
        <a href={sourceUrl} target="_blank" rel="noopener noreferrer"
          className="text-[9px] font-mono text-muted-foreground/60 hover:text-primary transition-colors flex items-center gap-0.5">
          {sourceName} <ExternalLink className="w-2.5 h-2.5" />
        </a>
      ) : (
        <span className="text-[9px] font-mono text-muted-foreground/60">{sourceName}</span>
      )}
      <span className="text-[9px] font-mono text-muted-foreground/40">
        PUB: {formatDate(publicationDate)} · UPDATED: {formatDate(updatedAt)}
      </span>
    </div>
  );
}

function KpiCard({ icon: Icon, value, label, sublabel, sourceNote }: {
  icon: typeof TrendingUp; value: string; label: string; sublabel?: string; sourceNote: string;
}) {
  return (
    <div className="glass-panel rounded-xl p-4 flex flex-col gap-1" data-testid="kpi-card">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <span className="text-[10px] font-mono text-muted-foreground/60 uppercase tracking-wider">{label}</span>
      </div>
      <div className="text-2xl font-display font-bold text-foreground">{value}</div>
      {sublabel && <div className="text-[10px] font-mono text-muted-foreground/70">{sublabel}</div>}
      <div className="text-[9px] font-mono text-muted-foreground/40 mt-auto pt-2 border-t border-border/30">{sourceNote}</div>
    </div>
  );
}

function BriefCard({ rank, trend }: { rank: number; trend: AiTrend }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = CATEGORY_ICONS[trend.category] ?? TrendingUp;
  return (
    <div className="glass-panel rounded-xl p-4 flex gap-4" data-testid={`brief-card-${trend.id}`}>
      <div className="shrink-0 flex flex-col items-center gap-2">
        <div className="w-8 h-8 rounded-full flex items-center justify-center font-mono font-bold text-sm border"
          style={{ borderColor: `${BRAND}66`, backgroundColor: `${BRAND}1a`, color: BRAND }}>
          {rank}
        </div>
        <Icon className="w-4 h-4 text-muted-foreground/40" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <h3 className="text-sm font-display font-semibold text-foreground leading-snug flex-1">{trend.title}</h3>
          <span className={`shrink-0 text-[9px] font-mono px-1.5 py-0.5 rounded border ${SIGNIFICANCE_LABELS[trend.significance]?.color}`}>
            {SIGNIFICANCE_LABELS[trend.significance]?.label}
          </span>
        </div>
        {trend.strategicImplication && (
          <div className="mt-2 flex items-start gap-1.5">
            <Lightbulb className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
            <p className="text-[11px] text-amber-200/80 font-mono leading-relaxed">{trend.strategicImplication}</p>
          </div>
        )}
        <button onClick={() => setExpanded(v => !v)}
          className="mt-2 text-[10px] font-mono text-muted-foreground/50 hover:text-primary transition-colors flex items-center gap-0.5">
          {expanded ? <><ChevronUp className="w-3 h-3" /> HIDE DETAIL</> : <><ChevronDown className="w-3 h-3" /> FULL DETAIL</>}
        </button>
        {expanded && (
          <p className="mt-2 text-xs text-muted-foreground/80 leading-relaxed border-t border-border/30 pt-2">{trend.description}</p>
        )}
        <SourceLabel sourceName={trend.sourceName} sourceType={trend.sourceType}
          sourceUrl={trend.sourceUrl} publicationDate={trend.publicationDate} updatedAt={trend.updatedAt} />
      </div>
    </div>
  );
}

function TrendRow({ trend }: { trend: AiTrend }) {
  const [expanded, setExpanded] = useState(false);
  const Icon = CATEGORY_ICONS[trend.category] ?? TrendingUp;
  const catColor = CATEGORY_COLORS[trend.category] ?? "#64748b";
  return (
    <>
      <tr
        className="border-b border-border/30 hover:bg-white/3 cursor-pointer transition-colors"
        onClick={() => setExpanded(v => !v)}
        data-testid={`trend-row-${trend.id}`}
      >
        <td className="py-2.5 pl-4 pr-2">
          <div className="flex items-center gap-1.5">
            <Icon className="w-3.5 h-3.5 shrink-0" style={{ color: catColor }} />
            <span className="text-[10px] font-mono" style={{ color: catColor }}>{trend.category}</span>
          </div>
        </td>
        <td className="py-2.5 px-2">
          <span className="text-xs text-foreground/90 font-medium">{trend.title}</span>
        </td>
        <td className="py-2.5 px-2 hidden md:table-cell">
          <span className="text-[10px] font-mono text-muted-foreground/70">{trend.region}</span>
        </td>
        <td className="py-2.5 px-2 hidden lg:table-cell">
          <span className="text-[10px] font-mono text-muted-foreground/70 truncate max-w-[120px] block">{trend.sector}</span>
        </td>
        <td className="py-2.5 px-2 text-right">
          <span className="text-xs font-mono text-foreground/80">{formatAmount(trend.amountUsd)}</span>
        </td>
        <td className="py-2.5 px-2 hidden md:table-cell">
          <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${SIGNIFICANCE_LABELS[trend.significance]?.color}`}>
            {SIGNIFICANCE_LABELS[trend.significance]?.label}
          </span>
        </td>
        <td className="py-2.5 px-2 pr-4 hidden lg:table-cell">
          <span className="text-[10px] font-mono text-muted-foreground/50">{formatDate(trend.publicationDate)}</span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-border/30 bg-secondary/20">
          <td colSpan={7} className="px-4 py-3">
            <p className="text-xs text-muted-foreground/80 leading-relaxed mb-2">{trend.description}</p>
            {trend.strategicImplication && (
              <div className="flex items-start gap-1.5 mb-2">
                <Lightbulb className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-200/70 font-mono leading-relaxed">{trend.strategicImplication}</p>
              </div>
            )}
            <div className="flex flex-wrap gap-1 mb-2">
              {(trend.tags as string[]).map(tag => (
                <span key={tag} className="text-[9px] font-mono px-1.5 py-0.5 bg-secondary rounded border border-border/50 text-muted-foreground/60">{tag}</span>
              ))}
            </div>
            <SourceLabel sourceName={trend.sourceName} sourceType={trend.sourceType}
              sourceUrl={trend.sourceUrl} publicationDate={trend.publicationDate} updatedAt={trend.updatedAt} />
          </td>
        </tr>
      )}
    </>
  );
}

export default function AiTrends() {
  const [regionFilter, setRegionFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [sectorFilter, setSectorFilter] = useState("All");
  const [sortField, setSortField] = useState<"significance" | "publicationDate" | "amountUsd">("significance");
  const [sortDesc, setSortDesc] = useState(true);

  const { data: allTrends = [], isLoading } = useAiTrends();

  const filteredBase = useMemo(() => allTrends.filter(t => {
    if (regionFilter !== "All" && t.region !== regionFilter) return false;
    if (categoryFilter !== "All" && t.category !== categoryFilter) return false;
    if (sectorFilter !== "All" && t.sector !== sectorFilter) return false;
    return true;
  }), [allTrends, regionFilter, categoryFilter, sectorFilter]);

  const filtered = useMemo(() => [...filteredBase].sort((a, b) => {
    let va: number, vb: number;
    if (sortField === "publicationDate") {
      va = new Date(a.publicationDate).getTime();
      vb = new Date(b.publicationDate).getTime();
    } else if (sortField === "amountUsd") {
      va = a.amountUsd ?? 0;
      vb = b.amountUsd ?? 0;
    } else {
      va = a.significance; vb = b.significance;
    }
    return sortDesc ? vb - va : va - vb;
  }), [filteredBase, sortField, sortDesc]);

  const boardBrief = useMemo(() =>
    filteredBase.filter(t => t.significance === 5).slice(0, 5), [filteredBase]);

  const regionalData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredBase.filter(t => t.amountUsd && t.category !== "Research").forEach(t => {
      const r = t.region === "Global" ? "Global" : t.region;
      map[r] = (map[r] ?? 0) + (t.amountUsd ?? 0);
    });
    return Object.entries(map)
      .map(([region, total]) => ({ region: region.replace(" America", " Am.").replace(" Pacific", " Pac."), total: parseFloat(total.toFixed(1)) }))
      .sort((a, b) => b.total - a.total);
  }, [filteredBase]);

  const categoryData = useMemo(() => {
    const map: Record<string, number> = {};
    filteredBase.forEach(t => { map[t.category] = (map[t.category] ?? 0) + 1; });
    return Object.entries(map).map(([cat, count]) => ({ cat, count })).sort((a, b) => b.count - a.count);
  }, [filteredBase]);

  const toggleSort = (field: typeof sortField) => {
    if (sortField === field) setSortDesc(v => !v);
    else { setSortField(field); setSortDesc(true); }
  };

  return (
    <AppShell>
      <div className="h-full flex flex-col bg-background overflow-hidden">
        {/* Header */}
        <header className="shrink-0 px-6 md:px-8 pt-6 pb-4 border-b border-border/40">
          <div className="flex flex-col sm:flex-row sm:items-end gap-3 mb-4">
            <div className="flex-1">
              <h1 className="text-xl md:text-2xl font-display font-bold text-foreground flex items-center gap-2.5">
                <BrainCircuit className="w-6 h-6 shrink-0" style={{ color: BRAND }} />
                AI TRENDS INTELLIGENCE
              </h1>
              <p className="text-muted-foreground font-mono mt-0.5 text-[11px]">
                Intelligence on Global AI Development and Investment
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground/50">
              <Calendar className="w-3 h-3" />
              UPDATED: {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }).toUpperCase()}
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-2 items-center">
            <Filter className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
            {[
              { label: "Region", allLabel: "All Regions", options: REGIONS, value: regionFilter, set: setRegionFilter },
              { label: "Category", allLabel: "All Categories", options: CATEGORIES, value: categoryFilter, set: setCategoryFilter },
              { label: "Sector", allLabel: "All Sectors", options: SECTORS, value: sectorFilter, set: setSectorFilter },
            ].map(({ label, allLabel, options, value, set }) => (
              <select key={label} value={value} onChange={e => set(e.target.value)}
                data-testid={`filter-${label.toLowerCase()}`}
                className="text-[10px] font-mono bg-secondary border border-border/50 rounded px-2 py-1 text-foreground/80 focus:outline-none focus:border-primary/50">
                {options.map(o => <option key={o} value={o}>{o === "All" ? allLabel : o}</option>)}
              </select>
            ))}
            {(regionFilter !== "All" || categoryFilter !== "All" || sectorFilter !== "All") && (
              <button onClick={() => { setRegionFilter("All"); setCategoryFilter("All"); setSectorFilter("All"); }}
                className="text-[10px] font-mono text-primary/70 hover:text-primary border border-primary/30 rounded px-2 py-1 transition-colors">
                RESET
              </button>
            )}
            <span className="ml-auto text-[10px] font-mono text-muted-foreground/40">{filtered.length} RECORDS</span>
          </div>
        </header>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 md:px-8 py-6 space-y-6">

          {isLoading ? (
            <div className="h-64 flex items-center justify-center font-mono text-muted-foreground/50 text-sm">
              LOADING INTELLIGENCE DATA...
            </div>
          ) : (
            <>
              {/* ── KPI Row ── */}
              <section>
                <div className="text-[10px] font-mono text-muted-foreground/50 tracking-widest mb-3">KEY METRICS</div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <KpiCard icon={DollarSign} value="$189B" label="AI Funding in February 2026 Alone"
                    sublabel="All-time monthly record · 90% to AI companies"
                    sourceNote="SOURCE: Crunchbase Venture Report · Feb 2026" />
                  <KpiCard icon={TrendingUp} value="$700B+" label="Big Tech AI Capex 2026"
                    sublabel="Amazon $200B · Google $175B · MSFT $145B · Meta $125B"
                    sourceNote="SOURCE: Goldman Sachs AI Capex Report · Feb 2026" />
                  <KpiCard icon={Landmark} value="60+" label="Countries with National AI Strategy"
                    sublabel="US federal framework preempts state laws from Dec 2025"
                    sourceNote="SOURCE: OECD AI Policy Observatory · 2025" />
                  <KpiCard icon={Zap} value="10 GW" label="New AI Data Centre Power Added 2025"
                    sublabel="Global AI power demand tripling by 2030"
                    sourceNote="SOURCE: IEA — World Energy Outlook 2025" />
                </div>
              </section>

              {/* ── Board / IC Brief ── */}
              {boardBrief.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <Award className="w-4 h-4" style={{ color: BRAND }} />
                    <span className="text-[10px] font-mono text-muted-foreground/50 tracking-widest">Executive Brief — Key AI Trends</span>
                  </div>
                  <div className="space-y-3">
                    {boardBrief.map((t, i) => <BriefCard key={t.id} rank={i + 1} trend={t} />)}
                  </div>
                  <div className="mt-2 text-[9px] font-mono text-muted-foreground/30 text-right">
                    Sourced exclusively from primary institutional, government, regulatory, and investor relations materials.
                  </div>
                </section>
              )}

              {/* ── Charts Row ── */}
              <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Regional Investment */}
                <div className="glass-panel rounded-xl p-5">
                  <div className="text-[10px] font-mono text-muted-foreground/50 tracking-widest mb-1">AI INVESTMENT FLOW BY REGION (IDENTIFIED DEALS)</div>
                  <div className="text-[9px] font-mono text-muted-foreground/30 mb-3">USD billions · Excludes research benchmarks</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={regionalData} margin={{ top: 0, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                      <XAxis dataKey="region" tick={{ fontSize: 9, fontFamily: "monospace", fill: "rgba(255,255,255,0.4)" }} />
                      <YAxis tick={{ fontSize: 9, fontFamily: "monospace", fill: "rgba(255,255,255,0.4)" }}
                        tickFormatter={v => `$${v}B`} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.85)" }}
                        labelStyle={{ color: "rgba(255,255,255,0.5)", marginBottom: 4 }}
                        itemStyle={{ color: "rgba(255,255,255,0.85)" }}
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        formatter={(v: number) => [`$${v}B`, "Investment"]} />
                      <Bar dataKey="total" radius={[4, 4, 0, 0]}>
                        {regionalData.map((_, i) => (
                          <Cell key={i} fill={i === 0 ? BRAND : i === 1 ? "#0891b2" : i === 2 ? "#7c3aed" : "rgba(255,255,255,0.15)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-2 text-[9px] font-mono text-muted-foreground/30">
                    SOURCE: Stanford HAI AI Index 2024 · Microsoft/Amazon/Google IR · Saudi Press Agency · Government Announcements
                  </div>
                </div>

                {/* Category breakdown */}
                <div className="glass-panel rounded-xl p-5">
                  <div className="text-[10px] font-mono text-muted-foreground/50 tracking-widest mb-1">INTELLIGENCE RECORDS BY CATEGORY</div>
                  <div className="text-[9px] font-mono text-muted-foreground/30 mb-3">Count of tracked events in this dataset</div>
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={categoryData} layout="vertical" margin={{ top: 0, right: 8, left: 60, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 9, fontFamily: "monospace", fill: "rgba(255,255,255,0.4)" }} />
                      <YAxis dataKey="cat" type="category" width={55} tick={{ fontSize: 9, fontFamily: "monospace", fill: "rgba(255,255,255,0.5)" }} />
                      <Tooltip
                        contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontFamily: "monospace", fontSize: 11, color: "rgba(255,255,255,0.85)" }}
                        labelStyle={{ color: "rgba(255,255,255,0.5)", marginBottom: 4 }}
                        itemStyle={{ color: "rgba(255,255,255,0.85)" }}
                        cursor={{ fill: "rgba(255,255,255,0.04)" }}
                        formatter={(v: number) => [v, "Records"]} />
                      <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                        {categoryData.map(({ cat }) => (
                          <Cell key={cat} fill={CATEGORY_COLORS[cat] ?? "rgba(255,255,255,0.15)"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                  <div className="mt-2 text-[9px] font-mono text-muted-foreground/30">
                    SOURCE: Curated from institutional, government, regulatory, and investor relations primary sources only.
                  </div>
                </div>
              </section>

              {/* ── Intelligence Table ── */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] font-mono text-muted-foreground/50 tracking-widest">
                    INTELLIGENCE RECORDS ({filtered.length})
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground/40">Click row to expand · Click column to sort</div>
                </div>
                <div className="glass-panel rounded-xl overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-left min-w-[600px]">
                      <thead>
                        <tr className="border-b border-border/50 bg-secondary/30">
                          {[
                            { key: null, label: "CATEGORY" },
                            { key: null, label: "TITLE" },
                            { key: null, label: "REGION", cls: "hidden md:table-cell" },
                            { key: null, label: "SECTOR", cls: "hidden lg:table-cell" },
                            { key: "amountUsd" as const, label: "AMOUNT" },
                            { key: "significance" as const, label: "PRIORITY", cls: "hidden md:table-cell" },
                            { key: "publicationDate" as const, label: "DATE", cls: "hidden lg:table-cell" },
                          ].map(col => (
                            <th key={col.label}
                              onClick={() => col.key && toggleSort(col.key)}
                              className={`py-2.5 px-2 first:pl-4 last:pr-4 text-[9px] font-mono text-muted-foreground/50 tracking-widest whitespace-nowrap
                                ${col.key ? "cursor-pointer hover:text-primary transition-colors select-none" : ""}
                                ${col.cls ?? ""}`}>
                              {col.label}
                              {col.key && sortField === col.key && (sortDesc ? " ↓" : " ↑")}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="py-12 text-center text-xs font-mono text-muted-foreground/40">
                              NO RECORDS MATCH CURRENT FILTERS
                            </td>
                          </tr>
                        ) : (
                          filtered.map(t => <TrendRow key={t.id} trend={t} />)
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>

              {/* ── Policy Tracker ── */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Landmark className="w-4 h-4 text-amber-400" />
                  <span className="text-[10px] font-mono text-muted-foreground/50 tracking-widest">AI POLICY TRACKER</span>
                </div>
                <div className="glass-panel rounded-xl p-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {filteredBase.filter(t => t.category === "Policy").map(t => (
                      <div key={t.id} className="flex flex-col gap-1 p-3 rounded-lg bg-secondary/30 border border-border/30"
                        data-testid={`policy-card-${t.id}`}>
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-[11px] font-medium text-foreground/90 leading-snug">{t.title}</span>
                          <span className={`shrink-0 text-[8px] font-mono px-1.5 py-0.5 rounded border ${SIGNIFICANCE_LABELS[t.significance]?.color}`}>
                            {SIGNIFICANCE_LABELS[t.significance]?.label}
                          </span>
                        </div>
                        <div className="text-[10px] font-mono text-muted-foreground/60">{t.region}</div>
                        {t.strategicImplication && (
                          <div className="flex items-start gap-1 mt-1">
                            <Lightbulb className="w-2.5 h-2.5 text-amber-400/70 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-200/60 leading-snug">{t.strategicImplication}</p>
                          </div>
                        )}
                        <SourceLabel sourceName={t.sourceName} sourceType={t.sourceType}
                          sourceUrl={t.sourceUrl} publicationDate={t.publicationDate} updatedAt={t.updatedAt} />
                      </div>
                    ))}
                  </div>
                  {filteredBase.filter(t => t.category === "Policy").length === 0 && (
                    <div className="text-center text-xs font-mono text-muted-foreground/40 py-8">
                      NO POLICY RECORDS — ADJUST FILTERS
                    </div>
                  )}
                </div>
              </section>

              {/* ── Infrastructure Signals ── */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Cpu className="w-4 h-4 text-indigo-400" />
                  <span className="text-[10px] font-mono text-muted-foreground/50 tracking-widest">INFRASTRUCTURE SIGNALS</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {filteredBase.filter(t => t.category === "Infrastructure").map(t => {
                    return (
                      <div key={t.id} className="glass-panel rounded-xl p-4" data-testid={`infra-card-${t.id}`}>
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h4 className="text-[11px] font-display font-semibold text-foreground/90 leading-snug">{t.title}</h4>
                          {t.amountUsd && (
                            <span className="shrink-0 text-xs font-mono font-bold" style={{ color: BRAND }}>
                              {formatAmount(t.amountUsd)}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-muted-foreground/70 leading-relaxed line-clamp-3">{t.description}</p>
                        {t.strategicImplication && (
                          <div className="flex items-start gap-1 mt-2 pt-2 border-t border-border/30">
                            <Lightbulb className="w-2.5 h-2.5 text-amber-400/70 shrink-0 mt-0.5" />
                            <p className="text-[10px] text-amber-200/60 leading-relaxed">{t.strategicImplication}</p>
                          </div>
                        )}
                        <SourceLabel sourceName={t.sourceName} sourceType={t.sourceType}
                          sourceUrl={t.sourceUrl} publicationDate={t.publicationDate} updatedAt={t.updatedAt} />
                      </div>
                    );
                  })}
                  {filteredBase.filter(t => t.category === "Infrastructure").length === 0 && (
                    <div className="col-span-3 text-center text-xs font-mono text-muted-foreground/40 py-8 glass-panel rounded-xl">
                      NO INFRASTRUCTURE RECORDS — ADJUST FILTERS
                    </div>
                  )}
                </div>
              </section>

              {/* Attribution footer */}
              <div className="border-t border-border/30 pt-4 pb-2">
                <p className="text-[9px] font-mono text-muted-foreground/30 text-center leading-relaxed">
                  All intelligence records sourced exclusively from primary and institutional sources including IMF, World Bank, OECD, Stanford AI Index, WIPO, IEA, official government publications,
                  investor relations materials, and regulatory filings. No unattributed or low-credibility content. Data is informational only and does not constitute investment advice.
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
