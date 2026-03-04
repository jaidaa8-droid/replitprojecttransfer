import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { Globe, Activity, ShieldAlert, Target, PieChart, Database, Map } from "lucide-react";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [location] = useLocation();

  const navItems = [
    { href: "/", icon: Map, label: "Global Situation" },
    { href: "/insights", icon: Activity, label: "Intelligence Brief" },
    { href: "/countries", icon: Globe, label: "Country Instability" },
    { href: "/sectors", icon: PieChart, label: "Sector Heatmap" },
    { href: "/oversight", icon: ShieldAlert, label: "Strategic Oversight" },
  ];

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      {/* Left Navigation Rail */}
      <nav className="w-16 md:w-20 border-r border-border/50 bg-card/50 backdrop-blur-md flex flex-col items-center py-6 z-50 shrink-0">
        <div className="mb-8 relative group cursor-pointer">
          <div className="absolute inset-0 bg-primary/20 blur-xl rounded-full group-hover:bg-primary/40 transition-all"></div>
          <Target className="w-8 h-8 text-primary relative z-10" />
        </div>
        
        <div className="flex flex-col gap-6 w-full">
          {navItems.map((item) => {
            const isActive = location === item.href;
            return (
              <Link key={item.href} href={item.href} className="w-full relative flex justify-center group">
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 bg-primary rounded-r-full shadow-[0_0_10px_rgba(0,229,255,0.8)]" />
                )}
                <div className={cn(
                  "p-3 rounded-xl transition-all duration-300",
                  isActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
                )}>
                  <item.icon className="w-5 h-5 md:w-6 md:h-6" strokeWidth={isActive ? 2.5 : 1.5} />
                </div>
              </Link>
            );
          })}
        </div>
        
        <div className="mt-auto">
          <div className="w-10 h-10 rounded-full bg-secondary border border-border/50 flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors">
            <Database className="w-4 h-4 text-muted-foreground" />
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 relative h-full flex flex-col overflow-hidden">
        {children}
      </main>
    </div>
  );
}
