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
    const rawLink = getField("link") || (block.match(/<link>([^<]+)<\/link>/) || [])[1] || "";
    const link = rawLink.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"');
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

const STEM_STOP = new Set(["after","about","their","these","those","which","where","while","there","other","would","could","should","might","still","since","until","under","every","being","first","three","seven","eight","again","never","often","world","state","local","right","great","large","small","major","total","among","whose","along","above","below","later","early","today","night","based","needs","least","going","years","named","given","order","taken","began","seen","told","says","said","both","such","when","then","been","have","from","this","that","with","they","will","more","were","over","what","into","also","than","some","most","only","even","back","just","last","many","much","same","each","made","come","high","does","down","away","know","make","like","long","need","time","used","part","call","keep","left","help","show","turn","place","give","work","full","city","move","play","next","soon","days","week","month","year"]);

function stemify(text: string): string[] {
  return text.toLowerCase().split(/\s+/)
    .map(w => w.replace(/[^a-z]/g, ""))
    .filter(w => w.length > 4 && !STEM_STOP.has(w) && !STEM_STOP.has(w.slice(0, 5)))
    .map(w => w.slice(0, 5));
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
  sourceUrls?: string[];
};

async function classifyHeadlinesWithAI(
  headlines: { title: string; description: string; pubDate: string; link: string; source: string }[]
): Promise<RawEvent[]> {
  if (headlines.length === 0) return [];

  const prompt = `You are a geopolitical intelligence analyst. Classify each news headline as a structured event.

For each headline, return an event object with:
- title: string (concise, under 70 chars)
- description: string (2-3 sentences, professional intelligence style)
- category: one of exactly ["Conflicts", "Military activity", "Cyber", "Energy", "Economic", "Political", "Strategic hotspots", "Humanitarian"]
- severity: integer 1-5 (1=minor, 5=critical)
- confidence: float 0.90-1.0 (use high confidence for confirmed real news)
- latitude: float — the location of the PRIMARY ACTOR or subject named in the headline, NOT the conflict they are responding to. If the headline is about Gulf states reacting to a war, use UAE/Dubai coordinates. If about Houthis, use Yemen.
- longitude: float — same rule as latitude
- sources: array of strings (source names, max 3)

GEOCODING REFERENCE (use exact values when these countries/cities are the primary subject):
Gulf states / GCC response: 25.20, 55.27 | UAE / Dubai: 25.20, 55.27 | Qatar / Doha: 25.29, 51.53
Kuwait: 29.37, 47.98 | Bahrain / Manama: 26.22, 50.59 | Oman / Muscat: 23.59, 58.39
Yemen / Sanaa: 15.37, 44.19 | Iraq / Baghdad: 33.34, 44.40 | Jordan / Amman: 31.95, 35.93
Iran / Tehran: 35.69, 51.39 | Israel / Tel Aviv: 32.07, 34.78 | Lebanon / Beirut: 33.89, 35.50
Syria / Damascus: 33.51, 36.29 | Turkey / Ankara: 39.93, 32.86 | Egypt / Cairo: 30.06, 31.25
Strait of Hormuz: 26.56, 56.25 | Red Sea: 20.00, 38.00 | Arabian Sea: 15.00, 65.00

Also include in each event object:
- pubDate: string — copy the pubDate value EXACTLY as given for that headline (do not modify it)
- sourceUrl: string — copy the link/URL value EXACTLY as given for that headline (do not modify it)

Return a JSON object with key "events" containing an array of classified events. Skip non-geopolitical headlines.

Headlines:
${headlines.map((h, i) => `${i + 1}. [${h.source}] pubDate: ${h.pubDate || "unknown"} link: ${h.link || ""}\n   ${h.title}\n   ${h.description}`).join("\n\n")}`;

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

    return arr.map((e: any) => {
      // Use the article's actual publication date; fall back to now if unparseable
      let timestamp = new Date();
      if (e.pubDate && e.pubDate !== "unknown") {
        const parsed = new Date(e.pubDate);
        if (!isNaN(parsed.getTime())) timestamp = parsed;
      }

      // Collect ALL matching URLs from input headlines (not just the GPT-echoed one)
      const evStems = stemify(String(e.title || ""));
      const allUrls: string[] = [];

      // First: include the GPT-echoed URL if valid
      if (typeof e.sourceUrl === "string" && e.sourceUrl.startsWith("http")) {
        allUrls.push(e.sourceUrl);
      }

      // Then: find all other input headlines that match this event by title stems,
      // BUT only include URLs from sources that are listed in the event's sources array
      const eventSources: string[] = Array.isArray(e.sources) ? e.sources : [];
      headlines.forEach(h => {
        if (h.link && h.link.startsWith("http") && !allUrls.includes(h.link)) {
          // Only include if headline's feed source is named in event.sources
          const sourceMatches = eventSources.some(src =>
            src.toLowerCase() === h.source.toLowerCase() ||
            src.toLowerCase().startsWith(h.source.split(" ")[0].toLowerCase()) ||
            h.source.toLowerCase().startsWith(src.split(" ")[0].toLowerCase())
          );
          if (!sourceMatches) return;
          const hStems = stemify(h.title);
          const score = evStems.filter(s => hStems.includes(s)).length;
          if (score >= 2) allUrls.push(h.link);
        }
      });

      return {
        title: String(e.title || "").slice(0, 100),
        description: String(e.description || ""),
        category: e.category || "Political",
        severity: Math.min(5, Math.max(1, Number(e.severity) || 3)),
        confidence: Math.min(1, Math.max(0, Number(e.confidence) || 0.7)),
        latitude: Number(e.latitude) || 0,
        longitude: Number(e.longitude) || 0,
        timestamp,
        sources: Array.isArray(e.sources) ? e.sources.slice(0, 3) : ["News Feed"],
        sourceUrls: allUrls.length > 0 ? allUrls : undefined,
      };
    });
  } catch (err: any) {
    console.error("[news-fetcher] GPT error:", err?.status, err?.message, err?.code, JSON.stringify(err?.error || {}));
    return [];
  }
}

export async function fetchAndIngestNews(): Promise<{ added: number; merged: number; skipped: number }> {
  let added = 0;
  let merged = 0;
  let skipped = 0;

  try {
    const allHeadlines: { title: string; description: string; pubDate: string; link: string; source: string }[] = [];

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

    if (allHeadlines.length === 0) return { added: 0, merged: 0, skipped: 0 };

    // Load all existing events for dedup (lightweight: id, title, sources, sourceUrls)
    const existingForDedup = await storage.getEventsForDedup();
    const existingTitleStems = existingForDedup.map(e => ({
      id: e.id,
      titleLower: e.title.toLowerCase(),
      stems: stemify(e.title),
      sources: e.sources,
      sourceUrls: e.sourceUrls || [],
    }));

    // Pre-GPT filter: remove raw headlines that clearly match an existing GPT title
    // (cheap first pass — misses vocab-variant duplicates, caught post-GPT)
    const newHeadlines = allHeadlines.filter(h => {
      const norm = h.title.toLowerCase().trim();
      return !existingTitleStems.some(ex => {
        if (ex.titleLower === norm) return true;
        const hStems = stemify(h.title);
        return hStems.filter(s => ex.stems.includes(s)).length >= 3;
      });
    });

    // Prioritize Gulf/Arabian Peninsula stories
    const GULF_PRIORITY = ["saudi", "gulf", "riyadh", "aramco", "gcc", "opec", "uae", "dubai", "qatar", "doha", "kuwait", "bahrain", "oman", "houthi", "red sea", "hormuz", "arabian"];
    const isGulfStory = (h: { title: string; description: string }) =>
      GULF_PRIORITY.some(kw => (h.title + " " + h.description).toLowerCase().includes(kw));
    const prioritised = [
      ...newHeadlines.filter(isGulfStory),
      ...newHeadlines.filter(h => !isGulfStory(h)),
    ];

    console.log(`[news-fetcher] pre-GPT filter: ${prioritised.length} candidates, ${allHeadlines.length - newHeadlines.length} pre-filtered`);

    if (prioritised.length === 0) return { added: 0, merged: 0, skipped: allHeadlines.length };

    const classified = await classifyHeadlinesWithAI(prioritised.slice(0, 20));

    for (const event of classified) {
      if (!event.title || event.title.length < 5) { skipped++; continue; }

      // Post-GPT dedup: compare GPT-generated title against existing GPT-generated titles
      // This catches cases where two different RSS phrasings become similar GPT titles
      const evStems = stemify(event.title);
      let bestMatch: { id: number; sources: string[]; sourceUrls: string[] } | null = null;
      let bestScore = 0;

      for (const ex of existingTitleStems) {
        const score = evStems.filter(s => ex.stems.includes(s)).length;
        if (score >= 3 && score > bestScore) {
          bestScore = score;
          bestMatch = { id: ex.id, sources: ex.sources, sourceUrls: ex.sourceUrls };
        }
      }

      if (bestMatch) {
        // Event already exists — merge in any new source names and URLs
        const newSrcs = (event.sources || []).filter(s => !(bestMatch!.sources || []).includes(s));
        const newUrls = (event.sourceUrls || []).filter(u => !(bestMatch!.sourceUrls || []).includes(u));
        if (newSrcs.length > 0 || newUrls.length > 0) {
          await storage.mergeEventSources(bestMatch.id, event.sources || [], event.sourceUrls || []);
          console.log(`[news-fetcher] merged "${event.title.slice(0, 50)}" into existing id=${bestMatch.id} (+${newSrcs.join(",")})`);
          merged++;
        } else {
          skipped++;
        }
        continue;
      }

      // No match — insert as a new event
      try {
        const created = await storage.createEvent(event);
        // Add the newly created event to the in-memory dedup list for this run
        existingTitleStems.push({
          id: created.id,
          titleLower: created.title.toLowerCase(),
          stems: stemify(created.title),
          sources: created.sources,
          sourceUrls: created.sourceUrls || [],
        });
        added++;
      } catch {
        skipped++;
      }
    }

    return { added, merged, skipped };
  } catch (err) {
    console.error("[news-fetcher] error:", err);
    return { added: 0, merged: 0, skipped: 0 };
  }
}

export function startNewsFetchScheduler(): void {
  const INTERVAL_MS = 30 * 60 * 1000;

  const run = async () => {
    console.log("[news-fetcher] fetching live news...");
    const result = await fetchAndIngestNews();
    console.log(`[news-fetcher] done — added: ${result.added}, merged: ${result.merged}, skipped: ${result.skipped}`);
  };

  const safeRun = () => run().catch((err) => console.error("[news-fetcher] scheduler error:", err));

  safeRun();
  setInterval(safeRun, INTERVAL_MS);
}
