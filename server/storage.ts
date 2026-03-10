import { db } from "./db";
import {
  events,
  countries,
  sectorRisks,
  aiTrends,
  type Event,
  type Country,
  type SectorRisk,
  type AiTrend,
  type InsertEvent,
  type InsertCountry,
  type InsertSectorRisk,
  type InsertAiTrend,
} from "@shared/schema";
import { eq, gte, and, like, desc } from "drizzle-orm";

export interface IStorage {
  // Events
  getEvents(timeWindow?: string): Promise<Event[]>;
  getEventsForDedup(): Promise<{ id: number; title: string; sources: string[]; sourceUrls: string[] | null }[]>;
  getAllEventTitles(): Promise<string[]>;
  getEvent(id: number): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  mergeEventSources(id: number, newSources: string[], newUrls: string[]): Promise<void>;
  deleteEventsByTitlePattern(pattern: string): Promise<void>;
  deleteAllEvents(): Promise<void>;

  // Countries
  getCountries(): Promise<Country[]>;
  createCountry(country: InsertCountry): Promise<Country>;
  deleteCountry(code: string): Promise<void>;

  // Sector Risks
  getSectorRisks(): Promise<SectorRisk[]>;
  createSectorRisk(risk: InsertSectorRisk): Promise<SectorRisk>;

  // AI Trends
  getAiTrends(filters?: { region?: string; category?: string; sector?: string }): Promise<AiTrend[]>;
  createAiTrend(trend: InsertAiTrend): Promise<AiTrend>;
  deleteAllAiTrends(): Promise<void>;
}

export class DatabaseStorage implements IStorage {
  async getEvents(timeWindow?: string): Promise<Event[]> {
    const minConfidence = gte(events.confidence, 0.85);

    if (timeWindow) {
      const now = new Date();
      let hours = 24;
      if (timeWindow === "48h") hours = 48;
      else if (timeWindow === "5d") hours = 24 * 5;
      else if (timeWindow === "7d") hours = 24 * 7;

      const threshold = new Date(now.getTime() - hours * 60 * 60 * 1000);
      return await db.select().from(events).where(and(gte(events.timestamp, threshold), minConfidence)).orderBy(desc(events.timestamp));
    }

    return await db.select().from(events).where(minConfidence).orderBy(desc(events.timestamp));
  }

  async getEventsForDedup(): Promise<{ id: number; title: string; sources: string[]; sourceUrls: string[] | null }[]> {
    const rows = await db.select({
      id: events.id,
      title: events.title,
      sources: events.sources,
      sourceUrls: events.sourceUrls,
    }).from(events);
    return rows as { id: number; title: string; sources: string[]; sourceUrls: string[] | null }[];
  }

  async getAllEventTitles(): Promise<string[]> {
    const rows = await db.select({ title: events.title }).from(events);
    return rows.map(r => r.title);
  }

  async getEvent(id: number): Promise<Event | undefined> {
    const [event] = await db.select().from(events).where(eq(events.id, id));
    return event;
  }

  async createEvent(event: InsertEvent): Promise<Event> {
    const [created] = await db.insert(events).values(event).returning();
    return created;
  }

  async mergeEventSources(id: number, newSources: string[], newUrls: string[]): Promise<void> {
    const [ev] = await db.select({ sources: events.sources, sourceUrls: events.sourceUrls })
      .from(events).where(eq(events.id, id));
    if (!ev) return;
    const merged = [...new Set([...(ev.sources || []), ...newSources])].slice(0, 5);
    const mergedUrls = [...new Set([...(ev.sourceUrls || []), ...newUrls])];
    await db.update(events).set({ sources: merged, sourceUrls: mergedUrls }).where(eq(events.id, id));
  }

  async deleteEventsByTitlePattern(pattern: string): Promise<void> {
    await db.delete(events).where(like(events.title, pattern));
  }

  async deleteAllEvents(): Promise<void> {
    await db.delete(events);
  }

  async getCountries(): Promise<Country[]> {
    return await db.select().from(countries);
  }

  async createCountry(country: InsertCountry): Promise<Country> {
    const [countriesResult] = await db.insert(countries).values(country).returning();
    return countriesResult;
  }

  async deleteCountry(code: string): Promise<void> {
    await db.delete(countries).where(eq(countries.code, code));
  }

  async getSectorRisks(): Promise<SectorRisk[]> {
    return await db.select().from(sectorRisks);
  }

  async createSectorRisk(risk: InsertSectorRisk): Promise<SectorRisk> {
    const [created] = await db.insert(sectorRisks).values(risk).returning();
    return created;
  }

  async getAiTrends(filters?: { region?: string; category?: string; sector?: string }): Promise<AiTrend[]> {
    const rows = await db.select().from(aiTrends).orderBy(desc(aiTrends.significance), desc(aiTrends.publicationDate));
    if (!filters) return rows;
    return rows.filter(r => {
      if (filters.region && filters.region !== "All" && r.region !== filters.region) return false;
      if (filters.category && filters.category !== "All" && r.category !== filters.category) return false;
      if (filters.sector && filters.sector !== "All" && r.sector !== filters.sector) return false;
      return true;
    });
  }

  async createAiTrend(trend: InsertAiTrend): Promise<AiTrend> {
    const [created] = await db.insert(aiTrends).values(trend).returning();
    return created;
  }

  async deleteAllAiTrends(): Promise<void> {
    await db.delete(aiTrends);
  }
}

export const storage = new DatabaseStorage();
