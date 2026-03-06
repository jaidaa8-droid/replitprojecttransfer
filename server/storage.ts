import { db } from "./db";
import {
  events,
  countries,
  sectorRisks,
  type Event,
  type Country,
  type SectorRisk,
  type InsertEvent,
  type InsertCountry,
  type InsertSectorRisk
} from "@shared/schema";
import { eq, gte, and, like } from "drizzle-orm";

export interface IStorage {
  // Events
  getEvents(timeWindow?: string): Promise<Event[]>;
  getAllEventTitles(): Promise<string[]>;
  getEvent(id: number): Promise<Event | undefined>;
  createEvent(event: InsertEvent): Promise<Event>;
  deleteEventsByTitlePattern(pattern: string): Promise<void>;
  deleteAllEvents(): Promise<void>;
  
  // Countries
  getCountries(): Promise<Country[]>;
  createCountry(country: InsertCountry): Promise<Country>;
  deleteCountry(code: string): Promise<void>;
  
  // Sector Risks
  getSectorRisks(): Promise<SectorRisk[]>;
  createSectorRisk(risk: InsertSectorRisk): Promise<SectorRisk>;
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
      return await db.select().from(events).where(and(gte(events.timestamp, threshold), minConfidence));
    }

    return await db.select().from(events).where(minConfidence);
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
}

export const storage = new DatabaseStorage();
