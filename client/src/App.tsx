import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import GlobalSituation from "./pages/global-situation";
import GlobalInsights from "./pages/global-insights";
import CountryInstability from "./pages/country-instability";
import SectorHeatmap from "./pages/sector-heatmap";
import AiTrends from "./pages/ai-trends";

function Router() {
  return (
    <Switch>
      <Route path="/" component={GlobalSituation} />
      <Route path="/insights" component={GlobalInsights} />
      <Route path="/countries" component={CountryInstability} />
      <Route path="/sectors" component={SectorHeatmap} />
      <Route path="/ai-trends" component={AiTrends} />
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
