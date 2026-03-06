import OpenAI from "openai";
import { storage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const RSS_SOURCES = [
  { url: "https://www.aljazeera.com/xml/rss/all.xml", name: "Al Jazeera" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", name: "BBC World" },
];

function extractRssItems(xml: string): { title: string; description: string; pubDate: string; link: string }[] {
  const items: { title: string; description: string; pubDate: string; link: string }[] = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag: string) => {
      const m = block.match(new RegExp(`<${tag}[^>]*>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`));
      return m ? m[1].trim() : "";
    };
    const title = get("title");
    const description = get("description");
    const pubDate = get("pubDate");
    const link = get("link") || (block.match(/<link>([^<]+)<\/link>/) || [])[1] || "";
    if (title) items.push({ title, description, pubDate, link });
  }
  return items;
}

async function fetchRssFeed(url: string): Promise<{ title: string; description: string; pubDate: string; link: string }[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MIRSAD Intelligence Engine/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return extractRssItems(xml);
  } catch {
    return [];
  }
}

const GEOPOLITICAL_KEYWORDS = [
  "war", "attack", "strike", "bomb", "missile", "military", "troops", "sanction",
  "crisis", "conflict", "invasion", "ceasefire", "nuclear", "tension", "protest",
  "coup", "election", "diplomatic", "embargo", "blockade", "escalation", "treaty",
  "terrorist", "siege", "refugee", "massacre", "airstrike", "navy", "army",
  "oil", "energy", "supply", "trade", "tariff", "inflation", "economy", "market",
  "cybersecurity", "hack", "espionage", "intelligence", "nato", "un", "security",
  "hostage", "assassination", "genocide", "famine", "disaster", "earthquake", "flood",
  "china", "russia", "usa", "iran", "israel", "ukraine", "north korea", "taiwan",
  "middle east", "pacific", "africa", "europe", "asia", "gulf", "strait",
];

function isGeopoliticallyRelevant(title: string, description: string): boolean {
  const text = (title + " " + description).toLowerCase();
  return GEOPOLITICAL_KEYWORDS.some(kw => text.includes(kw));
}

type RawEvent = {
  title: string;
  description: string;
  category: string;
  severity: number;
  confidence: number;
  latitude: number;
  longitude: number;
  timestamp: Date;
  sources: string[];
};

async function classifyHeadlinesWithAI(
  headlines: { title: string; description: string; pubDate: string; source: string }[]
): Promise<RawEvent[]> {
  if (headlines.length === 0) return [];

  const prompt = `You are a geopolitical intelligence analyst. Classify each news headline as a structured event.

For each headline, return a JSON object with:
- title: string (concise, under 70 chars)
- description: string (2-3 sentences, professional intelligence style)
- category: one of exactly ["Conflicts", "Military activity", "Cyber", "Energy", "Economic", "Political", "Strategic hotspots", "Humanitarian"]
- severity: integer 1-5 (1=minor, 5=critical)
- confidence: float 0.0-1.0 (certainty of the event/impact)
- latitude: float (primary geographic focal point)
- longitude: float (primary geographic focal point)
- sources: array of strings (source names, max 3)

Return ONLY a JSON array. If a headline is not geopolitically relevant, omit it.

Headlines:
${headlines.map((h, i) => `${i + 1}. [${h.source}] ${h.title}\n   ${h.description}`).join("\n\n")}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_tokens: 3000,
    });

    const content = response.choices[0].message.content || "{}";
    const parsed = JSON.parse(content);
    const arr: RawEvent[] = Array.isArray(parsed) ? parsed : (parsed.events || parsed.data || []);

    return arr.map((e: any) => ({
      title: String(e.title || "").slice(0, 100),
      description: String(e.description || ""),
      category: e.category || "Political",
      severity: Math.min(5, Math.max(1, Number(e.severity) || 3)),
      confidence: Math.min(1, Math.max(0, Number(e.confidence) || 0.7)),
      latitude: Number(e.latitude) || 0,
      longitude: Number(e.longitude) || 0,
      timestamp: new Date(),
      sources: Array.isArray(e.sources) ? e.sources.slice(0, 3) : ["News Feed"],
    }));
  } catch {
    return [];
  }
}

export async function fetchAndIngestNews(): Promise<{ added: number; skipped: number }> {
  let added = 0;
  let skipped = 0;

  try {
    const allHeadlines: { title: string; description: string; pubDate: string; source: string }[] = [];

    for (const src of RSS_SOURCES) {
      const items = await fetchRssFeed(src.url);
      for (const item of items.slice(0, 15)) {
        if (isGeopoliticallyRelevant(item.title, item.description)) {
          allHeadlines.push({ ...item, source: src.name });
        }
      }
    }

    if (allHeadlines.length === 0) return { added: 0, skipped: 0 };

    const existingEvents = await storage.getEvents();
    const existingTitles = new Set(existingEvents.map(e => e.title.toLowerCase().trim()));

    const newHeadlines = allHeadlines.filter(h => {
      const norm = h.title.toLowerCase().trim();
      return !existingTitles.has(norm) && !Array.from(existingTitles).some(t => {
        const overlap = norm.split(" ").filter(w => w.length > 4 && t.includes(w)).length;
        return overlap >= 3;
      });
    });

    if (newHeadlines.length === 0) return { added: 0, skipped: allHeadlines.length };

    const classified = await classifyHeadlinesWithAI(newHeadlines.slice(0, 10));

    for (const event of classified) {
      if (!event.title || event.title.length < 5) { skipped++; continue; }
      try {
        await storage.createEvent(event);
        added++;
      } catch {
        skipped++;
      }
    }

    return { added, skipped };
  } catch (err) {
    console.error("[news-fetcher] error:", err);
    return { added: 0, skipped: 0 };
  }
}

export function startNewsFetchScheduler(): void {
  const INTERVAL_MS = 30 * 60 * 1000;

  const run = async () => {
    console.log("[news-fetcher] fetching live news...");
    const result = await fetchAndIngestNews();
    console.log(`[news-fetcher] done — added: ${result.added}, skipped: ${result.skipped}`);
  };

  run();
  setInterval(run, INTERVAL_MS);
}
