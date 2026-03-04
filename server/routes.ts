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

const h = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000);

const SEED_EVENTS = [
  { title: "Cyber Attack on Ukrainian Power Grid", description: "Coordinated ransomware campaign targets electricity distribution networks in Kyiv and Kharkiv, causing partial blackouts.", category: "Cyber", severity: 5, confidence: 0.88, latitude: 50.45, longitude: 30.52, timestamp: h(2), sources: ["Reuters", "CyberSec Intel", "CERT-UA"] },
  { title: "South China Sea Naval Standoff", description: "PLA Navy vessels intercept Philippine Coast Guard patrol near Scarborough Shoal, escalating territorial dispute.", category: "Military activity", severity: 4, confidence: 0.91, latitude: 15.12, longitude: 117.75, timestamp: h(5), sources: ["AP News", "Jane's Intelligence"] },
  { title: "OPEC+ Surprise Production Cut", description: "Cartel announces emergency 1.5 million bpd output reduction, sending Brent crude above $95/barrel.", category: "Energy", severity: 3, confidence: 0.97, latitude: 23.88, longitude: 45.07, timestamp: h(10), sources: ["Bloomberg", "OPEC Press Office"] },
  { title: "Sudan Paramilitary Offensive", description: "RSF forces launch coordinated assault on Khartoum North, displacing 120,000 civilians amid infrastructure collapse.", category: "Conflicts", severity: 5, confidence: 0.83, latitude: 15.55, longitude: 32.53, timestamp: h(8), sources: ["UN OCHA", "AFP"] },
  { title: "Taiwan Strait Military Drills", description: "PLA Eastern Theatre Command initiates live-fire exercises encircling Taiwan, practicing blockade scenarios.", category: "Military activity", severity: 5, confidence: 0.92, latitude: 24.38, longitude: 120.42, timestamp: h(14), sources: ["Reuters", "CSIS Asia Maritime Transparency"] },
  { title: "Houthi Red Sea Shipping Attacks", description: "Iran-backed Houthis launch drone swarm against three commercial tankers in Bab el-Mandeb Strait, insurers suspend cover.", category: "Trade chokepoints", severity: 5, confidence: 0.95, latitude: 12.50, longitude: 43.30, timestamp: h(18), sources: ["Lloyd's List", "UKMTO"] },
  { title: "EU-Russia Gas Transit Dispute", description: "Gazprom halts remaining gas transit through Poland citing payment disputes, triggering emergency storage protocols in Germany.", category: "Energy", severity: 4, confidence: 0.86, latitude: 52.23, longitude: 21.01, timestamp: h(22), sources: ["IEA", "Bundesnetzagentur"] },
  { title: "Pakistan Balochistan Militant Strike", description: "Separatist BLA attack on CPEC pipeline junction kills 18 security personnel, halting oil transport for 72 hours.", category: "Conflicts", severity: 4, confidence: 0.79, latitude: 29.38, longitude: 66.97, timestamp: h(30), sources: ["Dawn", "Reuters"] },
  { title: "Iran Uranium Enrichment Milestone", description: "IAEA confirms Iran enriching uranium to 84% purity at Fordow facility, crossing de-facto weapons-grade threshold.", category: "Strategic hotspots", severity: 5, confidence: 0.94, latitude: 34.90, longitude: 50.60, timestamp: h(36), sources: ["IAEA Bulletin", "Associated Press"] },
  { title: "Myanmar Civil War Escalation", description: "Resistance forces capture Lashio, securing critical supply corridor from China and threatening junta northern supply lines.", category: "Conflicts", severity: 4, confidence: 0.81, latitude: 22.93, longitude: 97.75, timestamp: h(40), sources: ["Irrawaddy", "BBC"] },
  { title: "Turkey-Syria Border Bombardment", description: "Turkish artillery strikes SDF positions along 120km frontier following IED attack on Hatay military base.", category: "Military activity", severity: 3, confidence: 0.85, latitude: 36.85, longitude: 37.88, timestamp: h(44), sources: ["Al Jazeera", "Syrian Observatory"] },
  { title: "Ecuador Cartel Violence Surge", description: "Los Choneros cartel retaliates against government crackdown with simultaneous attacks on police stations in six provinces.", category: "Conflicts", severity: 4, confidence: 0.87, latitude: -1.83, longitude: -78.18, timestamp: h(50), sources: ["El Universo", "InSight Crime"] },
  { title: "India-China LAC Standoff", description: "PLA troops erect prefabricated structures in disputed Depsang Plains, prompting Indian Army forward deployment.", category: "Military activity", severity: 4, confidence: 0.88, latitude: 34.70, longitude: 78.23, timestamp: h(55), sources: ["The Hindu", "Jane's Defence"] },
  { title: "Venezuela Election Crisis", description: "Opposition rejects official Maduro victory declaration amid credible evidence of widespread fraud, sparking mass protests.", category: "Strategic hotspots", severity: 3, confidence: 0.91, latitude: 10.48, longitude: -66.87, timestamp: h(60), sources: ["Reuters", "Carter Center"] },
  { title: "Sahel Coup Contagion Risk", description: "Military officers in Senegal deploy armored vehicles around state broadcaster as unconfirmed coup rumors spread.", category: "Strategic hotspots", severity: 4, confidence: 0.62, latitude: 14.72, longitude: -17.44, timestamp: h(65), sources: ["RFI", "Africa Intelligence"] },
  { title: "Semiconductor Export Controls Expansion", description: "US Commerce Department adds 43 Chinese chip firms to Entity List, restricting access to ASML lithography equipment.", category: "Sanctions", severity: 3, confidence: 0.99, latitude: 39.90, longitude: 116.40, timestamp: h(70), sources: ["BIS Notice", "Wall Street Journal"] },
  { title: "Arctic Submarine Activity Spike", description: "NATO SOSUS detects unprecedented Russian submarine activity near Greenland-Iceland-UK gap, five vessels tracked.", category: "Military activity", severity: 4, confidence: 0.73, latitude: 65.00, longitude: -18.00, timestamp: h(72), sources: ["NATO Intel Brief", "The Drive"] },
  { title: "Gaza Ceasefire Collapse", description: "Fighting resumes in Rafah after Qatar-mediated ceasefire breaks down, triggering humanitarian corridor closure.", category: "Conflicts", severity: 5, confidence: 0.93, latitude: 31.35, longitude: 34.45, timestamp: h(20), sources: ["Al Jazeera", "UN Humanitarian"] },
  { title: "Nigeria Oil Delta Sabotage", description: "Pipeline explosions disable Shell Trans-Niger pipeline, cutting exports by 150,000 bpd and elevating local flooding risk.", category: "Infrastructure outages", severity: 4, confidence: 0.84, latitude: 5.33, longitude: 6.75, timestamp: h(80), sources: ["NNPC", "Reuters"] },
  { title: "North Korea ICBM Launch", description: "Hwasong-18 solid-fuel ICBM test overflies Japan EEZ, landing 200km off Hokkaido coast at maximum trajectory.", category: "Military activity", severity: 5, confidence: 0.98, latitude: 39.02, longitude: 125.74, timestamp: h(85), sources: ["JCS Seoul", "NHK"] },
  { title: "Panama Canal Drought Crisis", description: "Gatun Lake levels reach 50-year low, restricting vessel draft to 44ft and cutting daily transits from 36 to 18.", category: "Trade chokepoints", severity: 4, confidence: 0.97, latitude: 9.08, longitude: -79.67, timestamp: h(90), sources: ["ACP", "Bloomberg Shipping"] },
  { title: "Russia Sakhalin Energy Seizure", description: "Kremlin decrees transfer of Shell's 27.5% stake in Sakhalin-2 LNG project to state entity Novatek under force majeure.", category: "Energy", severity: 3, confidence: 0.92, latitude: 50.69, longitude: 142.76, timestamp: h(96), sources: ["Kommersant", "S&P Global Platts"] },
  { title: "Mozambique LNG Attack", description: "Al-Shabaab affiliate Ansar al-Sunna attacks TotalEnergies LNG construction site, forcing suspension of $20bn project.", category: "Conflicts", severity: 4, confidence: 0.81, latitude: -13.43, longitude: 40.53, timestamp: h(100), sources: ["Acled", "TotalEnergies Statement"] },
  { title: "Haiti Territorial Control Crisis", description: "Gang federation G9 controls 80% of Port-au-Prince, blockading main port and cutting fuel supplies to hospitals.", category: "Infrastructure outages", severity: 5, confidence: 0.89, latitude: 18.54, longitude: -72.33, timestamp: h(104), sources: ["BINUH", "UN Security Council"] },
  { title: "Libya Oil Crescent Shutdown", description: "LNA forces blockade Es Sider and Ras Lanuf terminals amid political dispute, removing 900,000 bpd from market.", category: "Energy", severity: 4, confidence: 0.87, latitude: 30.62, longitude: 18.34, timestamp: h(108), sources: ["NOC Tripoli", "S&P Platts"] },
  { title: "Kazakhstan Tengiz Field Strike", description: "Oil workers at Chevron-operated Tengiz superfield strike over wages, reducing output by 200,000 bpd.", category: "Energy", severity: 3, confidence: 0.91, latitude: 45.45, longitude: 53.12, timestamp: h(112), sources: ["KazMunayGas", "Reuters"] },
  { title: "Philippines Cyber Espionage Campaign", description: "Volt Typhoon APT group infiltrates DICT and AFP networks, exfiltrating South China Sea defense plans.", category: "Cyber", severity: 4, confidence: 0.77, latitude: 14.59, longitude: 120.98, timestamp: h(116), sources: ["DICT Philippines", "Mandiant"] },
  { title: "Colombia FARC Splinter Resurgence", description: "FARC-EMC dissidents seize control of Putumayo drug corridors, triggering military offensive and civilian displacement.", category: "Conflicts", severity: 3, confidence: 0.83, latitude: 0.43, longitude: -76.59, timestamp: h(120), sources: ["INDEPAZ", "El Espectador"] },
  { title: "Sri Lanka Port Debt Sovereignty Risk", description: "China Merchants Port Holdings invokes Hambantota lease provisions to restrict Sri Lankan Navy access for 25 years.", category: "Strategic hotspots", severity: 3, confidence: 0.76, latitude: 6.12, longitude: 81.11, timestamp: h(124), sources: ["The Diplomat", "Colombo Gazette"] },
  { title: "Iraq Shia Militia Rocket Campaign", description: "Iran-aligned militias launch 40+ rockets at Al-Asad airbase and Erbil airport, wounding 12 US personnel.", category: "Military activity", severity: 4, confidence: 0.9, latitude: 33.43, longitude: 42.44, timestamp: h(128), sources: ["CENTCOM", "AFP"] },
  { title: "Kenya Currency Freefall", description: "KES hits record 163 per USD as IMF structural adjustment conditionality triggers capital flight and fuel subsidy removal.", category: "Economic disruptions", severity: 3, confidence: 0.94, latitude: -1.29, longitude: 36.82, timestamp: h(132), sources: ["CBK", "Bloomberg"] },
  { title: "Argentina Peso Hyperinflation", description: "Monthly inflation breaches 25%, triggering runs on bank deposits and emergency peso-dollar conversion restrictions.", category: "Economic disruptions", severity: 4, confidence: 0.96, latitude: -34.61, longitude: -58.41, timestamp: h(136), sources: ["INDEC", "Reuters"] },
  { title: "Israel-Hezbollah Border Escalation", description: "Hezbollah fires 120mm Kornet ATGMs at IDF positions near Metula as cross-border exchange kills 6 soldiers.", category: "Conflicts", severity: 5, confidence: 0.91, latitude: 33.28, longitude: 35.57, timestamp: h(140), sources: ["IDF Spokesman", "L'Orient Today"] },
  { title: "Taiwanese Chip Fab Earthquake Damage", description: "6.2 magnitude quake near Hsinchu damages TSMC N3 fab clean room, impacting 5nm wafer output for 3-4 weeks.", category: "Infrastructure outages", severity: 4, confidence: 0.88, latitude: 24.80, longitude: 120.96, timestamp: h(144), sources: ["TSMC Statement", "Nikkei Asia"] },
  { title: "Ethiopia Tigray Rearming", description: "TPLF signs arms deal with Eritrea, breaching Pretoria ceasefire and raising spectre of regional war resumption.", category: "Military activity", severity: 3, confidence: 0.68, latitude: 14.10, longitude: 38.40, timestamp: h(148), sources: ["Africa Intelligence", "ISS Africa"] },
  { title: "Bangladesh Garment Supply Shock", description: "Flash floods inundate 34 export processing zones in Dhaka, disrupting 40% of global apparel production capacity.", category: "Natural disasters", severity: 4, confidence: 0.92, latitude: 23.81, longitude: 90.41, timestamp: h(152), sources: ["BGMEA", "WFP"] },
  { title: "Indonesia Sunda Strait Volcanic Eruption", description: "Anak Krakatau eruption generates 4m tsunami warning, forcing evacuation of coastal Java and Sumatra ports.", category: "Natural disasters", severity: 4, confidence: 0.86, latitude: -6.10, longitude: 105.42, timestamp: h(156), sources: ["BMKG", "Reuters"] },
  { title: "Saudi Arabia Vision 2030 Bond Default Risk", description: "Fitch downgrades NEOM project-linked bonds to BB+ citing cost overruns and liquidity concerns at PIF.", category: "Economic disruptions", severity: 3, confidence: 0.71, latitude: 24.68, longitude: 46.72, timestamp: h(160), sources: ["Fitch Ratings", "Financial Times"] },
  { title: "Greenland Rare Earth Dispute", description: "US pressures Denmark over Greenland's decision to award rare earth mining licenses to Chinese firm Shenghe Resources.", category: "Strategic hotspots", severity: 3, confidence: 0.82, latitude: 64.18, longitude: -51.74, timestamp: h(164), sources: ["Politiken", "Foreign Policy"] },
  { title: "Mali Gold Mine Nationalisation", description: "Junta decrees seizure of Barrick and AngloGold Ashanti operations, prompting EU sanctions on transitional government.", category: "Sanctions", severity: 3, confidence: 0.88, latitude: 17.57, longitude: -3.99, timestamp: h(168), sources: ["Jeune Afrique", "Mining Weekly"] },
  { title: "Pakistan IMF Bailout Conditions Unmet", description: "IMF suspends $7bn bailout tranche as Pakistan misses revenue targets, triggering renewed forex reserve crisis.", category: "Economic disruptions", severity: 4, confidence: 0.89, latitude: 33.68, longitude: 73.05, timestamp: h(172), sources: ["Dawn", "IMF Statement"] },
  { title: "Spain Port Strike Transport Disruption", description: "Dockworkers at Barcelona and Valencia stage indefinite strike, halting Med trade hub and triggering EU mediation.", category: "Economic disruptions", severity: 2, confidence: 0.94, latitude: 41.38, longitude: 2.18, timestamp: h(25), sources: ["Reuters", "Port of Barcelona"] },
  { title: "Cuba Internet Infrastructure Attack", description: "Suspected state-sponsored DDoS disables Cuban national DNS for 18 hours, isolating diaspora communications.", category: "Cyber", severity: 2, confidence: 0.72, latitude: 23.13, longitude: -82.38, timestamp: h(176), sources: ["NetBlocks", "ETECSA"] },
  { title: "Morocco Phosphate Export Ban", description: "King Mohammed VI signs decree restricting phosphate exports to protect domestic fertilizer security, alarming food markets.", category: "Economic disruptions", severity: 3, confidence: 0.85, latitude: 33.99, longitude: -6.85, timestamp: h(180), sources: ["OCP Group", "Bloomberg Commodities"] },
  { title: "South Korea THAAD Incident", description: "Chinese J-16 fighters simulate attack runs on THAAD radar site in Seongju, prompting scramble of 30 KAF jets.", category: "Military activity", severity: 4, confidence: 0.79, latitude: 35.89, longitude: 128.20, timestamp: h(32), sources: ["Yonhap", "ROKAF"] },
  { title: "DRC Cobalt Mine Flooding", description: "Unprecedented rainfall floods Mutanda and Tenke Fungurume cobalt mines, disrupting 15% of global EV battery supply.", category: "Natural disasters", severity: 4, confidence: 0.9, latitude: -11.35, longitude: 26.67, timestamp: h(60), sources: ["Mining Journal", "Glencore Statement"] },
  { title: "Turkey Economic Sanctions Threat", description: "US Treasury warns of CAATSA sanctions after Turkey receives S-400 system upgrades and facilitates Russian oil trade.", category: "Sanctions", severity: 3, confidence: 0.78, latitude: 39.91, longitude: 32.86, timestamp: h(184), sources: ["US Treasury OFAC", "Daily Sabah"] },
  { title: "Strait of Hormuz Tanker Seizure", description: "IRGC Navy boards and diverts Greek-flagged oil tanker Advantage Sweet in retaliation for US sanctions enforcement.", category: "Trade chokepoints", severity: 5, confidence: 0.96, latitude: 26.50, longitude: 56.25, timestamp: h(188), sources: ["UKMTO", "AP News"] },
  { title: "Somalia Al-Shabaab Port Attack", description: "Suicide boat bomb targets Mogadishu commercial pier, destroying two vessels and killing 23 dock workers.", category: "Conflicts", severity: 4, confidence: 0.88, latitude: 2.03, longitude: 45.34, timestamp: h(192), sources: ["AMISOM", "Voice of America"] },
  { title: "Baltic Undersea Cable Sabotage", description: "Investigations confirm deliberate anchor-drag severing of Balticconnector gas pipeline and data cables linking Finland-Estonia.", category: "Infrastructure outages", severity: 5, confidence: 0.84, latitude: 59.80, longitude: 25.10, timestamp: h(196), sources: ["Finnish NBI", "NATO MARCOM"] },
];

const SEED_COUNTRIES = [
  { code: "UKR", name: "Ukraine", instabilityScore: 88, momentumChange: "+4", primaryDrivers: ["Active conflict", "Infrastructure damage", "Economic collapse"], confidenceLevel: "High" },
  { code: "SDN", name: "Sudan", instabilityScore: 87, momentumChange: "+6", primaryDrivers: ["Civil war", "RSF territorial control", "Humanitarian crisis"], confidenceLevel: "High" },
  { code: "HTI", name: "Haiti", instabilityScore: 86, momentumChange: "+8", primaryDrivers: ["Gang control", "State collapse", "Food insecurity"], confidenceLevel: "High" },
  { code: "SOM", name: "Somalia", instabilityScore: 83, momentumChange: "+2", primaryDrivers: ["Al-Shabaab", "Climate shocks", "Governance deficit"], confidenceLevel: "High" },
  { code: "SYR", name: "Syria", instabilityScore: 81, momentumChange: "-1", primaryDrivers: ["Fragmented control", "Economic sanctions", "Regional proxy conflict"], confidenceLevel: "High" },
  { code: "YEM", name: "Yemen", instabilityScore: 80, momentumChange: "+3", primaryDrivers: ["Houthi control", "Coalition airstrikes", "Famine risk"], confidenceLevel: "High" },
  { code: "MMR", name: "Myanmar", instabilityScore: 79, momentumChange: "+5", primaryDrivers: ["Junta vs resistance", "Ethnic conflict", "Border instability"], confidenceLevel: "High" },
  { code: "IRN", name: "Iran", instabilityScore: 72, momentumChange: "+3", primaryDrivers: ["Nuclear program", "IRGC proxy network", "Economic sanctions"], confidenceLevel: "High" },
  { code: "PRK", name: "North Korea", instabilityScore: 70, momentumChange: "+2", primaryDrivers: ["ICBM program", "Sanctions evasion", "Regime opacity"], confidenceLevel: "Medium" },
  { code: "ETH", name: "Ethiopia", instabilityScore: 68, momentumChange: "-3", primaryDrivers: ["Post-Tigray fragility", "Amhara insurgency", "Nile dam tensions"], confidenceLevel: "Medium" },
  { code: "MLI", name: "Mali", instabilityScore: 67, momentumChange: "+4", primaryDrivers: ["Junta governance", "Sahel insurgency", "Wagner presence"], confidenceLevel: "Medium" },
  { code: "COD", name: "Dem. Rep. Congo", instabilityScore: 66, momentumChange: "+2", primaryDrivers: ["M23 rebels", "Eastern front violence", "Resource curse"], confidenceLevel: "Medium" },
  { code: "LBY", name: "Libya", instabilityScore: 64, momentumChange: "+1", primaryDrivers: ["Dual government", "Oil terminal blockades", "Mercenary activity"], confidenceLevel: "Medium" },
  { code: "NGA", name: "Nigeria", instabilityScore: 62, momentumChange: "+3", primaryDrivers: ["Boko Haram north", "Delta insurgency", "Economic pressure"], confidenceLevel: "Medium" },
  { code: "PAK", name: "Pakistan", instabilityScore: 60, momentumChange: "+2", primaryDrivers: ["Debt crisis", "TTP terrorism", "Civil-military tensions"], confidenceLevel: "Medium" },
  { code: "TWN", name: "Taiwan", instabilityScore: 58, momentumChange: "+5", primaryDrivers: ["PLA military pressure", "Semiconductor dependency", "US-China proxy"], confidenceLevel: "High" },
  { code: "ISR", name: "Israel", instabilityScore: 56, momentumChange: "+6", primaryDrivers: ["Gaza conflict", "Hezbollah northern front", "Domestic political crisis"], confidenceLevel: "High" },
  { code: "VEN", name: "Venezuela", instabilityScore: 55, momentumChange: "+1", primaryDrivers: ["Election fraud", "Economic collapse", "Maduro sanctions"], confidenceLevel: "Medium" },
  { code: "KOR", name: "South Korea", instabilityScore: 35, momentumChange: "+2", primaryDrivers: ["DPRK missile threat", "Political crisis", "Chip war exposure"], confidenceLevel: "High" },
  { code: "IRQ", name: "Iraq", instabilityScore: 52, momentumChange: "+3", primaryDrivers: ["Shia militia influence", "ISIL remnants", "Iranian interference"], confidenceLevel: "Medium" },
  { code: "COL", name: "Colombia", instabilityScore: 46, momentumChange: "+1", primaryDrivers: ["FARC splinters", "Drug corridor wars", "Border tensions"], confidenceLevel: "Medium" },
  { code: "TUR", name: "Turkey", instabilityScore: 44, momentumChange: "-2", primaryDrivers: ["NATO tensions", "Inflation", "Kurdish conflict"], confidenceLevel: "Medium" },
  { code: "MEX", name: "Mexico", instabilityScore: 42, momentumChange: "+2", primaryDrivers: ["Cartel territorial control", "Judicial crisis", "US trade tensions"], confidenceLevel: "High" },
  { code: "SAU", name: "Saudi Arabia", instabilityScore: 38, momentumChange: "-4", primaryDrivers: ["Vision 2030 disruption", "Yemen war costs", "Succession risks"], confidenceLevel: "Low" },
  { code: "IND", name: "India", instabilityScore: 36, momentumChange: "+1", primaryDrivers: ["LAC border disputes", "Pakistan tensions", "Sectarian incidents"], confidenceLevel: "Medium" },
  { code: "BRA", name: "Brazil", instabilityScore: 33, momentumChange: "-3", primaryDrivers: ["Deforestation pressure", "Crime in favelas", "Political polarization"], confidenceLevel: "Medium" },
  { code: "CHN", name: "China", instabilityScore: 40, momentumChange: "+3", primaryDrivers: ["Taiwan ambition", "Trade war", "Property sector crisis"], confidenceLevel: "Medium" },
  { code: "RUS", name: "Russia", instabilityScore: 62, momentumChange: "+2", primaryDrivers: ["Ukraine war costs", "Elite fracture risk", "Sanctions impact"], confidenceLevel: "Medium" },
  { code: "ARG", name: "Argentina", instabilityScore: 55, momentumChange: "+4", primaryDrivers: ["Hyperinflation", "Milei restructuring shock", "IMF dependence"], confidenceLevel: "High" },
  { code: "KEN", name: "Kenya", instabilityScore: 38, momentumChange: "+3", primaryDrivers: ["Currency crisis", "IMF austerity", "Al-Shabaab infiltration"], confidenceLevel: "Medium" },
];

const SECTORS = ["Energy", "Finance", "Transport", "Technology", "Manufacturing", "Agriculture", "Defense", "Telecommunications"];
const REGIONS = ["North America", "Europe", "Middle East", "Africa", "Asia Pacific", "Latin America"];
const SECTOR_BASE: Record<string, number[]> = {
  "Energy":            [28, 62, 85, 55, 70, 48],
  "Finance":           [35, 45, 72, 41, 58, 60],
  "Transport":         [22, 50, 80, 65, 75, 52],
  "Technology":        [30, 38, 60, 35, 82, 40],
  "Manufacturing":     [25, 55, 65, 58, 78, 55],
  "Agriculture":       [18, 35, 77, 70, 62, 68],
  "Defense":           [40, 58, 88, 45, 72, 42],
  "Telecommunications":[20, 42, 68, 40, 65, 38],
};

async function seedDatabase() {
  const [existingEvents, existingCountries, existingSectors] = await Promise.all([
    storage.getEvents(),
    storage.getCountries(),
    storage.getSectorRisks(),
  ]);

  if (existingEvents.length < 10) {
    for (const e of SEED_EVENTS) {
      await storage.createEvent(e);
    }
  }

  if (existingCountries.length < 10) {
    for (const c of SEED_COUNTRIES) {
      await storage.createCountry(c);
    }
  }

  if (existingSectors.length < 10) {
    for (const sector of SECTORS) {
      const scores = SECTOR_BASE[sector];
      for (let i = 0; i < REGIONS.length; i++) {
        await storage.createSectorRisk({ sector, region: REGIONS[i], riskScore: scores[i] });
      }
    }
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
