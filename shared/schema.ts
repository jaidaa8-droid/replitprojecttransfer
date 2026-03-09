import { pgTable, text, serial, integer, real, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const events = pgTable("events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  severity: integer("severity").notNull(),
  confidence: real("confidence").notNull(),
  latitude: real("latitude").notNull(),
  longitude: real("longitude").notNull(),
  timestamp: timestamp("timestamp").notNull(),
  sources: jsonb("sources").$type<string[]>().notNull(),
  sourceUrls: jsonb("source_urls").$type<string[]>(),
});

export const countries = pgTable("countries", {
  id: serial("id").primaryKey(),
  code: varchar("code", { length: 3 }).notNull(),
  name: text("name").notNull(),
  instabilityScore: integer("instability_score").notNull(),
  momentumChange: text("momentum_change").notNull(),
  primaryDrivers: jsonb("primary_drivers").$type<string[]>().notNull(),
  confidenceLevel: text("confidence_level").notNull(),
});

export const sectorRisks = pgTable("sector_risks", {
  id: serial("id").primaryKey(),
  sector: text("sector").notNull(),
  region: text("region").notNull(),
  riskScore: integer("risk_score").notNull(),
});

export const aiTrends = pgTable("ai_trends", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  region: text("region").notNull(),
  sector: text("sector").notNull(),
  amountUsd: real("amount_usd"),
  investmentType: text("investment_type"),
  entities: jsonb("entities").$type<string[]>().notNull(),
  sourceName: text("source_name").notNull(),
  sourceType: text("source_type").notNull(),
  sourceUrl: text("source_url"),
  publicationDate: timestamp("publication_date").notNull(),
  updatedAt: timestamp("updated_at").notNull(),
  significance: integer("significance").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull(),
  strategicImplication: text("strategic_implication"),
});

export const insertEventSchema = createInsertSchema(events).omit({ id: true });
export const insertCountrySchema = createInsertSchema(countries).omit({ id: true });
export const insertSectorRiskSchema = createInsertSchema(sectorRisks).omit({ id: true });
export const insertAiTrendSchema = createInsertSchema(aiTrends).omit({ id: true });

export type Event = typeof events.$inferSelect;
export type Country = typeof countries.$inferSelect;
export type SectorRisk = typeof sectorRisks.$inferSelect;
export type AiTrend = typeof aiTrends.$inferSelect;

export type InsertEvent = z.infer<typeof insertEventSchema>;
export type InsertCountry = z.infer<typeof insertCountrySchema>;
export type InsertSectorRisk = z.infer<typeof insertSectorRiskSchema>;
export type InsertAiTrend = z.infer<typeof insertAiTrendSchema>;
