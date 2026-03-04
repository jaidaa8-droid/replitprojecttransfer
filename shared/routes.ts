import { z } from "zod";
import { events, countries, sectorRisks, insertEventSchema, insertCountrySchema, insertSectorRiskSchema } from "./schema";

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

// AI Analysis Response
export const aiAnalysisResponseSchema = z.object({
  historical_analogues: z.array(
    z.object({
      title: z.string(),
      year: z.number(),
      similarity_score: z.number(),
      rationale: z.string(),
    })
  ),
  causal_chain: z.array(
    z.object({
      order: z.number(),
      claim: z.string(),
      probability: z.string(),
      time_horizon: z.string(),
      evidence_signals: z.array(z.string()),
    })
  ),
  live_indicators: z.array(
    z.object({
      indicator_name: z.string(),
      status: z.string(),
      threshold: z.string(),
      note: z.string(),
    })
  ),
  portfolio_impact: z.array(
    z.object({
      asset_or_business: z.string(),
      impact_type: z.string(),
      magnitude: z.string(),
      pathway: z.string(),
    })
  ),
  action_framework: z.object({
    no_regrets: z.array(
      z.object({
        action: z.string(),
        tag: z.enum(["opportunity", "mitigant", "both"]),
        owner_role: z.string(),
        deadline: z.string(),
        trigger: z.string().optional(),
      })
    ),
    study_now: z.array(
      z.object({
        action: z.string(),
        tag: z.enum(["opportunity", "mitigant", "both"]),
        owner_role: z.string(),
        deadline: z.string(),
        trigger: z.string().optional(),
      })
    ),
    monitor: z.array(
      z.object({
        action: z.string(),
        tag: z.enum(["opportunity", "mitigant", "both"]),
        owner_role: z.string(),
        deadline: z.string(),
        trigger: z.string().optional(),
      })
    ),
  }),
  preemptive_playbook: z.array(
    z.object({
      pre_event_action: z.string(),
      cost_complexity: z.string(),
      counterfactual_outcome: z.string(),
    })
  ),
});

export const insightResponseSchema = z.object({
  key_developments: z.array(z.string()),
  emerging_risks: z.array(z.string()),
  stabilizing_signals: z.array(z.string()),
  regional_shifts: z.array(z.string()),
  trend_indicators: z.array(
    z.object({
      indicator: z.string(),
      trend: z.enum(["up", "down", "stable"]),
    })
  ),
});

export const api = {
  events: {
    list: {
      method: "GET" as const,
      path: "/api/events" as const,
      input: z.object({
        timeWindow: z.enum(["24h", "48h", "5d", "7d"]).optional(),
      }).optional(),
      responses: {
        200: z.array(z.custom<typeof events.$inferSelect>()),
      },
    },
    get: {
      method: "GET" as const,
      path: "/api/events/:id" as const,
      responses: {
        200: z.custom<typeof events.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
  countries: {
    list: {
      method: "GET" as const,
      path: "/api/countries" as const,
      responses: {
        200: z.array(z.custom<typeof countries.$inferSelect>()),
      },
    },
  },
  sectors: {
    list: {
      method: "GET" as const,
      path: "/api/sectors" as const,
      responses: {
        200: z.array(z.custom<typeof sectorRisks.$inferSelect>()),
      },
    },
  },
  ai: {
    analyze: {
      method: "POST" as const,
      path: "/api/ai/analyze" as const,
      input: z.object({
        event_id: z.number(),
        portfolio_context: z.string().optional(),
      }),
      responses: {
        200: aiAnalysisResponseSchema,
        400: errorSchemas.validation,
        404: errorSchemas.notFound,
        500: errorSchemas.internal,
      },
    },
    insights: {
      method: "POST" as const,
      path: "/api/insights/generate" as const,
      input: z.object({
        timeWindow: z.enum(["24h", "48h", "5d", "7d"]).optional(),
      }),
      responses: {
        200: insightResponseSchema,
        500: errorSchemas.internal,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

export type EventResponse = typeof events.$inferSelect;
export type CountryResponse = typeof countries.$inferSelect;
export type SectorRiskResponse = typeof sectorRisks.$inferSelect;
export type AiAnalysisResponse = z.infer<typeof aiAnalysisResponseSchema>;
export type InsightResponse = z.infer<typeof insightResponseSchema>;
