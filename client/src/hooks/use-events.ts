import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { z } from "zod";

function parseWithLogging<T>(schema: z.ZodSchema<T>, data: unknown, label: string): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.error(`[Zod] ${label} validation failed:`, result.error.format());
    throw result.error;
  }
  return result.data;
}

export function useEvents(timeWindow?: "24h" | "48h" | "5d" | "7d") {
  return useQuery({
    queryKey: [api.events.list.path, timeWindow],
    queryFn: async () => {
      let url = api.events.list.path;
      if (timeWindow) {
        url += `?timeWindow=${timeWindow}`;
      }
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch events');
      const data = await res.json();
      return parseWithLogging(api.events.list.responses[200], data, "events.list");
    },
    refetchInterval: 5 * 60 * 1000,
  });
}

export function useEvent(id: number | null) {
  return useQuery({
    queryKey: [api.events.get.path, id],
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.events.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch event');
      const data = await res.json();
      return parseWithLogging(api.events.get.responses[200], data, "events.get");
    },
    enabled: id !== null,
  });
}
