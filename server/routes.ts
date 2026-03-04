import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { events, countries, sectorRisks } from "@shared/schema";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

async function seedDatabase() {
  const existingEvents = await storage.getEvents();
  if (existingEvents.length === 0) {
    await storage.createEvent({
      title: "Cyber Attack on Critical Infrastructure",
      description: "A coordinated ransomware attack has targeted power grids in Eastern Europe.",
      category: "Cyber",
      severity: 5,
      confidence: 0.85,
      latitude: 50.4501,
      longitude: 30.5234,
      timestamp: new Date(),
      sources: ["Reuters", "CyberSec Intel"],
    });
    await storage.createEvent({
      title: "Supply Chain Disruption in South China Sea",
      description: "Naval exercises have caused significant delays in shipping lanes.",
      category: "Supply chain",
      severity: 4,
      confidence: 0.9,
      latitude: 14.0583,
      longitude: 114.9667,
      timestamp: new Date(Date.now() - 24 * 60 * 60 * 1000),
      sources: ["Maritime Trade Org"],
    });
    await storage.createEvent({
      title: "Energy Price Spike",
      description: "OPEC+ announces surprise production cuts.",
      category: "Energy",
      severity: 3,
      confidence: 0.95,
      latitude: 23.8859,
      longitude: 45.0792,
      timestamp: new Date(Date.now() - 48 * 60 * 60 * 1000),
      sources: ["Bloomberg"],
    });

    await storage.createCountry({
      code: "UKR",
      name: "Ukraine",
      instabilityScore: 85,
      momentumChange: "+5",
      primaryDrivers: ["Conflict", "Infrastructure damage"],
      confidenceLevel: "High",
    });
    await storage.createCountry({
      code: "TWN",
      name: "Taiwan",
      instabilityScore: 65,
      momentumChange: "+2",
      primaryDrivers: ["Geopolitical tension", "Supply chain risks"],
      confidenceLevel: "Medium",
    });

    await storage.createSectorRisk({
      sector: "Energy",
      region: "Europe",
      riskScore: 80,
    });
    await storage.createSectorRisk({
      sector: "Technology",
      region: "Asia Pacific",
      riskScore: 75,
    });
  }
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Seed data
  seedDatabase().catch(console.error);

  app.get(api.events.list.path, async (req, res) => {
    try {
      const timeWindow = req.query.timeWindow as any;
      const events = await storage.getEvents(timeWindow);
      res.json(events);
    } catch (e) {
      res.status(500).json({ message: "Internal Error" });
    }
  });

  app.get(api.events.get.path, async (req, res) => {
    const event = await storage.getEvent(Number(req.params.id));
    if (!event) {
      return res.status(404).json({ message: "Event not found" });
    }
    res.json(event);
  });

  app.get(api.countries.list.path, async (req, res) => {
    const list = await storage.getCountries();
    res.json(list);
  });

  app.get(api.sectors.list.path, async (req, res) => {
    const list = await storage.getSectorRisks();
    res.json(list);
  });

  app.post(api.ai.analyze.path, async (req, res) => {
    try {
      const input = api.ai.analyze.input.parse(req.body);
      const event = await storage.getEvent(input.event_id);
      
      if (!event) {
        return res.status(404).json({ message: "Event not found" });
      }

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are an expert geopolitical and strategic risk analyst. 
Generate a JSON response analyzing the following event. 
Your response MUST exactly match this JSON schema:
{
  "historical_analogues": [{"title": "string", "year": 2000, "similarity_score": 0.0, "rationale": "string"}],
  "causal_chain": [{"order": 1, "claim": "string", "probability": "string", "time_horizon": "string", "evidence_signals": ["string"]}],
  "live_indicators": [{"indicator_name": "string", "status": "string", "threshold": "string", "note": "string"}],
  "portfolio_impact": [{"asset_or_business": "string", "impact_type": "string", "magnitude": "string", "pathway": "string"}],
  "action_framework": {
    "no_regrets": [{"action": "string", "tag": "opportunity", "owner_role": "string", "deadline": "string"}],
    "study_now": [{"action": "string", "tag": "opportunity", "owner_role": "string", "deadline": "string"}],
    "monitor": [{"action": "string", "tag": "opportunity", "owner_role": "string", "deadline": "string", "trigger": "string"}]
  },
  "preemptive_playbook": [{"pre_event_action": "string", "cost_complexity": "string", "counterfactual_outcome": "string"}]
}`
          },
          {
            role: "user",
            content: `Event: ${event.title}\nDescription: ${event.description}\nCategory: ${event.category}\nPortfolio Context: ${input.portfolio_context || "General"}`
          }
        ]
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      res.json(result);
    } catch (e) {
      if (e instanceof z.ZodError) {
        return res.status(400).json({ message: e.errors[0].message });
      }
      console.error(e);
      res.status(500).json({ message: "Internal Error" });
    }
  });

  app.post(api.ai.insights.path, async (req, res) => {
    try {
      const input = api.ai.insights.input.parse(req.body);
      const eventsList = await storage.getEvents(input.timeWindow);
      
      const eventsSummary = eventsList.map(e => `${e.title}: ${e.description}`).join("\n");

      const response = await openai.chat.completions.create({
        model: "gpt-5.1",
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content: `You are an expert strategic risk analyst. 
Summarize the key insights from the provided recent events.
Return strictly a JSON object matching:
{
  "key_developments": ["string"],
  "emerging_risks": ["string"],
  "stabilizing_signals": ["string"],
  "regional_shifts": ["string"],
  "trend_indicators": [{"indicator": "string", "trend": "up"}]
}`
          },
          {
            role: "user",
            content: `Recent Events:\n${eventsSummary || "No major events in this window."}`
          }
        ]
      });

      const result = JSON.parse(response.choices[0].message.content || "{}");
      res.json(result);
    } catch (e) {
      res.status(500).json({ message: "Internal Error" });
    }
  });

  return httpServer;
}
