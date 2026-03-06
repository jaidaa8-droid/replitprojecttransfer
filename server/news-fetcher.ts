import OpenAI from "openai";
import { storage } from "./storage";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

const RSS_SOURCES = [
  { url: "https://www.aljazeera.com/xml/rss/all.xml", name: "Al Jazeera" },
  { url: "https://feeds.bbci.co.uk/news/world/rss.xml", name: "BBC World" },
  { url: "https://feeds.bbci.co.uk/news/world/middle_east/rss.xml", name: "BBC Middle East" },
];

function extractRssItems(xml: string): { title: string; description: string; pubDate: string; link: string }[] {
  const items: { title: string; description: string; pubDate: string; link: string }[] = [];
  const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const getField = (tag: string): string => {
      // Handle CDATA-wrapped values: <tag><![CDATA[value]]></tag>
      // Note: double-escape backslashes when building regex strings for new RegExp()
      const cdataPattern = "<" + tag + "[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/" + tag + ">";
      const cdataM = block.match(new RegExp(cdataPattern, "i"));
      if (cdataM) return cdataM[1].trim();
      // Handle plain-text values: <tag>value</tag>
      const plainPattern = "<" + tag + "[^>]*>([^<]*)<\\/" + tag + ">";
      const plainM = block.match(new RegExp(plainPattern, "i"));
      if (plainM) return plainM[1].trim();
      return "";
    };
    const title = getField("title");
    const description = getField("description");
    const pubDate = getField("pubDate");
    const link = getField("link") || (block.match(/<link>([^<]+)<\/link>/) || [])[1] || "";
    if (title && title.length > 5) items.push({ title, description, pubDate, link });
  }
  return items;
}

async function fetchRssFeed(url: string): Promise<{ title: string; description: string; pubDate: string; link: string }[]> {
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "MIRSAD Intelligence Engine/1.0" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      console.error(`[news-fetcher] HTTP ${res.status} for ${url}`);
      return [];
    }
    const xml = await res.text();
    const items = extractRssItems(xml);
    console.log(`[news-fetcher] ${url} → ${items.length} items, xml=${xml.length}chars`);
    return items;
  } catch (err: any) {
    console.error(`[news-fetcher] fetch error for ${url}:`, err?.message || err);
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
  // Saudi Arabia / Arabian Peninsula / Gulf region
  "saudi", "arabia", "riyadh", "aramco", "gcc", "opec",
  "uae", "dubai", "abu dhabi", "qatar", "doha", "bahrain", "kuwait", "oman", "muscat",
  "yemen", "houthi", "red sea", "persian gulf", "arabian gulf", "hormuz",
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

For each headline, return an event object with:
- title: string (concise, under 70 chars)
- description: string (2-3 sentences, professional intelligence style)
- category: one of exactly ["Conflicts", "Military activity", "Cyber", "Energy", "Economic", "Political", "Strategic hotspots", "Humanitarian"]
- severity: integer 1-5 (1=minor, 5=critical)
- confidence: float 0.90-1.0 (use high confidence for confirmed real news)
- latitude: float (primary geographic focal point)
- longitude: float (primary geographic focal point)
- sources: array of strings (source names, max 3)

Return a JSON object with key "events" containing an array of classified events. Skip non-geopolitical headlines.

Headlines:
${headlines.map((h, i) => `${i + 1}. [${h.source}] ${h.title}\n   ${h.description}`).join("\n\n")}`;

  try {
    console.log(`[news-fetcher] calling GPT for ${headlines.length} headlines...`);
    const response = await openai.chat.completions.create({
      model: "gpt-5.1",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
      max_completion_tokens: 4000,
    });

    const content = response.choices[0].message.content || "{}";
    console.log(`[news-fetcher] GPT response length: ${content.length}, preview:`, content.substring(0, 200));
    const parsed = JSON.parse(content);
    const arr: RawEvent[] = Array.isArray(parsed) ? parsed : (parsed.events || parsed.data || parsed.results || []);

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
  } catch (err: any) {
    console.error("[news-fetcher] GPT error:", err?.status, err?.message, err?.code, JSON.stringify(err?.error || {}));
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
      let relevant = 0;
      for (const item of items) {
        if (isGeopoliticallyRelevant(item.title, item.description)) {
          allHeadlines.push({ ...item, source: src.name });
          relevant++;
        }
      }
      console.log(`[news-fetcher] ${src.name}: ${items.length} items, ${relevant} relevant`);
    }
    console.log(`[news-fetcher] total allHeadlines: ${allHeadlines.length}`);

    if (allHeadlines.length === 0) return { added: 0, skipped: 0 };

    const existingEvents = await storage.getEvents();
    const existingTitles = new Set(existingEvents.map(e => e.title.toLowerCase().trim()));

    const newHeadlines = allHeadlines.filter(h => {
      const norm = h.title.toLowerCase().trim();
      const exactMatch = existingTitles.has(norm);
      const wordOverlapMatch = Array.from(existingTitles).some(t => {
        const overlap = norm.split(" ").filter(w => w.length > 4 && t.includes(w)).length;
        return overlap >= 3;
      });
      return !exactMatch && !wordOverlapMatch;
    });
    console.log(`[news-fetcher] after dedup: ${newHeadlines.length} new headlines, ${allHeadlines.length - newHeadlines.length} deduped`);
    if (newHeadlines.length > 0) {
      console.log(`[news-fetcher] new:`, newHeadlines.slice(0,3).map(h => h.title));
    }

    if (newHeadlines.length === 0) return { added: 0, skipped: allHeadlines.length };

    const classified = await classifyHeadlinesWithAI(newHeadlines.slice(0, 15));

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
