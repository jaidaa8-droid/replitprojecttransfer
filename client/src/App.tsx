import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import GlobalSituation from "./pages/global-situation";
import GlobalInsights from "./pages/global-insights";
import CountryInstability from "./pages/country-instability";
import StrategicRisk from "./pages/strategic-risk";
import SectorHeatmap from "./pages/sector-heatmap";

function Router() {
  return (
    <Switch>
      <Route path="/" component={GlobalSituation} />
      <Route path="/insights" component={GlobalInsights} />
      <Route path="/countries" component={CountryInstability} />
      <Route path="/oversight" component={StrategicRisk} />
      <Route path="/sectors" component={SectorHeatmap} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
