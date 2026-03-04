import { useQuery } from "@tanstack/react-query";
import { api } from "@shared/routes";

export function useSectors() {
  return useQuery({
    queryKey: [api.sectors.list.path],
    queryFn: async () => {
      const res = await fetch(api.sectors.list.path, { credentials: "include" });
      if (!res.ok) throw new Error('Failed to fetch sectors');
      const data = await res.json();
      const result = api.sectors.list.responses[200].safeParse(data);
      if (!result.success) {
        console.error("Sectors parse error", result.error);
        throw result.error;
      }
      return result.data;
    },
  });
}
