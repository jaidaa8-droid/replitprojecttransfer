import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Globe, Activity, Target, PieChart, Database, Map } from "lucide-react";
import { cn } from "@/lib/utils";

const BRAND = "#005C4D";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: Map, label: "Map" },
    { href: "/insights", icon: Activity, label: "Brief" },
    { href: "/countries", icon: Globe, label: "Nations" },
    { href: "/sectors", icon: PieChart, label: "Sectors" },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">

      {/* ── Left Navigation Rail (tablet+) ── */}
      <nav className="hidden md:flex w-16 lg:w-20 border-r border-border/50 bg-card/50 backdrop-blur-md flex-col items-center py-6 z-50 shrink-0">
        <div className="mb-8 flex flex-col items-center gap-2">
          <div className="relative group cursor-pointer">
            <div className="absolute inset-0 blur-xl rounded-full transition-all" style={{ backgroundColor: `${BRAND}33` }} />
            <Target className="w-8 h-8 relative z-10" style={{ color: BRAND }} />
          </div>
          <span className="font-mono text-[9px] font-bold tracking-[0.2em] leading-none" style={{ color: BRAND }}>MIRSAD</span>
        </div>

        <div className="flex flex-col gap-6 w-full">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="w-full relative flex justify-center group" data-testid={`nav-${item.href.replace("/", "") || "home"}`}>
                {isActive && (
                  <div
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
                    style={{ backgroundColor: BRAND, boxShadow: `0 0 10px ${BRAND}cc` }}
                  />
                )}
                <div
                  className={cn(
                    "p-3 rounded-xl transition-all duration-300",
                    isActive ? "bg-opacity-10" : "hover:bg-white/5"
                  )}
                  style={isActive ? { backgroundColor: `${BRAND}1a` } : {}}
                >
                  <item.icon
                    className="w-5 h-5 lg:w-6 lg:h-6 transition-colors"
                    strokeWidth={isActive ? 2.5 : 1.5}
                    style={{ color: isActive ? BRAND : undefined }}
                  />
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-auto">
          <div className="w-10 h-10 rounded-full bg-secondary border border-border/50 flex items-center justify-center cursor-pointer transition-colors"
            onMouseEnter={e => (e.currentTarget.style.borderColor = `${BRAND}80`)}
            onMouseLeave={e => (e.currentTarget.style.borderColor = "")}
          >
            <Database className="w-4 h-4" style={{ color: BRAND }} />
          </div>
        </div>
      </nav>

      {/* ── Main Content Area ── */}
      <main className="flex-1 relative h-full flex flex-col overflow-hidden min-w-0 pb-14 md:pb-0">
        <div className="shrink-0 w-full px-4 py-1 flex items-center justify-center" data-testid="disclaimer-banner">
          <span className="text-[10px] font-mono text-muted-foreground/40 tracking-wide text-center">
            Experimental tool — outputs may be inaccurate and are for testing only.
          </span>
        </div>
        {children}
      </main>

      {/* ── Bottom Navigation Bar (mobile only) ── */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-xl border-t border-border/50 flex items-center justify-around px-2 h-14 shrink-0">
        {navItems.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-bottom-${item.href.replace("/", "") || "home"}`}
              className="flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-all"
              style={isActive ? { backgroundColor: `${BRAND}1a` } : {}}
            >
              <item.icon
                className="w-5 h-5 transition-colors"
                strokeWidth={isActive ? 2.5 : 1.5}
                style={{ color: isActive ? BRAND : "hsl(var(--muted-foreground))" }}
              />
              <span
                className="text-[9px] font-mono font-medium tracking-wide"
                style={{ color: isActive ? BRAND : "hsl(var(--muted-foreground))" }}
              >
                {item.label.toUpperCase()}
              </span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
