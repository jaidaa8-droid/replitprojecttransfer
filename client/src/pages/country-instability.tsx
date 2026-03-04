import { AppShell } from "@/components/layout/app-shell";
import { useCountries } from "@/hooks/use-countries";
import { ShieldAlert, TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export default function CountryInstability() {
  const { data: countries = [], isLoading } = useCountries();

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-destructive font-bold drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]";
    if (score >= 60) return "text-orange-400 font-bold";
    if (score >= 40) return "text-yellow-400";
    return "text-green-400";
  };

  const getMomentumIcon = (momentum: string) => {
    if (momentum === "increasing") return <TrendingUp className="w-4 h-4 text-destructive" />;
    if (momentum === "decreasing") return <TrendingDown className="w-4 h-4 text-green-400" />;
    return <Minus className="w-4 h-4 text-muted-foreground" />;
  };

  return (
    <AppShell>
      <div className="h-full flex flex-col p-6 md:p-8 overflow-hidden bg-background">
        <header className="mb-4 md:mb-8 border-b border-border/50 pb-4 md:pb-6">
          <h1 className="text-xl md:text-3xl font-display font-bold text-foreground flex items-center gap-2 md:gap-3">
            <ShieldAlert className="w-6 h-6 md:w-8 md:h-8 text-primary shrink-0" />
            NATION-STATE INSTABILITY INDEX
          </h1>
          <p className="text-muted-foreground font-mono mt-1 text-xs md:text-sm">
            Real-time algorithmic assessment of geopolitical fragility and sovereign risk.
          </p>
        </header>

        <div className="flex-1 overflow-auto glass-panel rounded-xl border-border/50">
          <div className="min-w-[640px]">
          <Table>
            <TableHeader className="bg-secondary/80 sticky top-0 backdrop-blur-md z-10">
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="w-20 font-display text-muted-foreground">ISO</TableHead>
                <TableHead className="font-display text-muted-foreground">NATION</TableHead>
                <TableHead className="font-display text-muted-foreground text-right">INSTABILITY SCORE</TableHead>
                <TableHead className="font-display text-muted-foreground text-center">MOMENTUM</TableHead>
                <TableHead className="font-display text-muted-foreground">PRIMARY DRIVERS</TableHead>
                <TableHead className="font-display text-muted-foreground text-right">CONFIDENCE</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-64 text-center text-muted-foreground font-mono">
                    CALCULATING METRICS...
                  </TableCell>
                </TableRow>
              ) : (
                countries
                  .sort((a, b) => b.instabilityScore - a.instabilityScore)
                  .map((country) => (
                  <TableRow key={country.id} className="border-border/50 hover:bg-secondary/30 transition-colors cursor-default">
                    <TableCell className="font-mono text-muted-foreground">{country.code}</TableCell>
                    <TableCell className="font-semibold">{country.name}</TableCell>
                    <TableCell className={`text-right font-mono text-lg ${getScoreColor(country.instabilityScore)}`}>
                      {country.instabilityScore}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex justify-center">{getMomentumIcon(country.momentumChange)}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {country.primaryDrivers.slice(0, 3).map((driver, i) => (
                          <span key={i} className="text-[10px] bg-background border border-border px-1.5 py-0.5 rounded text-muted-foreground truncate max-w-[150px]">
                            {driver}
                          </span>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs text-muted-foreground">
                      {country.confidenceLevel.toUpperCase()}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
