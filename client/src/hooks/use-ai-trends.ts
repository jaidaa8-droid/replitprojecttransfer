import { useQuery } from "@tanstack/react-query";
import type { AiTrend } from "@shared/schema";

export function useAiTrends(filters?: { region?: string; category?: string; sector?: string }) {
  const params = new URLSearchParams();
  if (filters?.region && filters.region !== "All") params.set("region", filters.region);
  if (filters?.category && filters.category !== "All") params.set("category", filters.category);
  if (filters?.sector && filters.sector !== "All") params.set("sector", filters.sector);

  const qs = params.toString();
  return useQuery<AiTrend[]>({
    queryKey: ["/api/ai-trends", filters?.region, filters?.category, filters?.sector],
    queryFn: async () => {
      const res = await fetch(`/api/ai-trends${qs ? `?${qs}` : ""}`);
      if (!res.ok) throw new Error("Failed to fetch AI trends");
      return res.json();
    },
  });
}
