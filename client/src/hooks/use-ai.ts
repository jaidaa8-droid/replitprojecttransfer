import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";

export function useAnalyzeEvent() {
  return useMutation({
    mutationFn: async (input: z.infer<typeof api.ai.analyze.input>) => {
      const res = await fetch(api.ai.analyze.path, {
        method: api.ai.analyze.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to run AI analysis");
      const data = await res.json();
      const parsed = api.ai.analyze.responses[200].safeParse(data);
      if (!parsed.success) {
        console.error("AI Analysis Parse Error", parsed.error);
        throw parsed.error;
      }
      return parsed.data;
    },
  });
}

export function useGenerateInsights() {
  return useMutation({
    mutationFn: async (input: z.infer<typeof api.ai.insights.input>) => {
      const res = await fetch(api.ai.insights.path, {
        method: api.ai.insights.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to generate insights");
      const data = await res.json();
      const parsed = api.ai.insights.responses[200].safeParse(data);
      if (!parsed.success) {
        console.error("Insights Parse Error", parsed.error);
        throw parsed.error;
      }
      return parsed.data;
    },
  });
}
