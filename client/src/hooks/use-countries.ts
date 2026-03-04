import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";
import { z } from "zod";

export function useCountries() {
  return useQuery({
    queryKey: [api.countries.list.path],
    queryFn: async () => {
      const res = await fetch(api.countries.list.path, { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch countries');
      const data = await res.json();
      const result = api.countries.list.responses[200].safeParse(data);
      if (!result.success) {
        console.error("Countries parse error", result.error);
        throw result.error;
      }
      return result.data;
    },
  });
}
