import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { fetchAndIngestNews, startNewsFetchScheduler } from "./news-fetcher";
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
  { title: "Russia Targets Zaporizhzhia Grid Again", description: "Overnight missile barrage strikes transformer stations feeding Europe's largest nuclear plant, triggering IAEA emergency session.", category: "Infrastructure outages", severity: 5, confidence: 0.97, latitude: 47.50, longitude: 34.61, timestamp: h(3), sources: ["IAEA", "Reuters", "Kyiv Independent"] },
  { title: "China Sanctions 12 US Defense Firms", description: "Beijing's Commerce Ministry restricts Raytheon, Northrop Grumman and L3 Technologies over Taiwan arms sales, blocking rare earth exports.", category: "Sanctions", severity: 4, confidence: 0.99, latitude: 39.90, longitude: 116.40, timestamp: h(6), sources: ["Xinhua", "Financial Times", "Wall Street Journal"] },
  { title: "Niger Uranium Mines Seized", description: "Military junta nationalises Orano-operated Arlit mines supplying 20% of EU uranium imports, sparking energy security crisis in France.", category: "Energy", severity: 4, confidence: 0.91, latitude: 18.73, longitude: 7.93, timestamp: h(11), sources: ["Le Monde", "World Nuclear News", "AFP"] },
  { title: "Mexico Cartel Seizes Border Crossing", description: "CJNG gunmen take control of Nuevo Laredo international bridge for six hours, halting $1.3bn daily bilateral trade corridor.", category: "Trade chokepoints", severity: 4, confidence: 0.89, latitude: 27.50, longitude: -99.51, timestamp: h(15), sources: ["El Universal", "AP News", "Texas Tribune"] },
  { title: "South China Sea Oil Rig Standoff", description: "Chinese coast guard water cannons target Philippine supply vessel at Recto Bank, prompting US mutual defense treaty consultation.", category: "Military activity", severity: 5, confidence: 0.94, latitude: 8.67, longitude: 115.85, timestamp: h(19), sources: ["Philippine Coast Guard", "Reuters", "CSIS AMTI"] },
  { title: "European Power Grid Frequency Incident", description: "Suspected cyberattack causes 49.84 Hz frequency deviation across continental European grid, activating automatic load-shedding in five nations.", category: "Cyber", severity: 5, confidence: 0.81, latitude: 48.85, longitude: 2.35, timestamp: h(23), sources: ["ENTSO-E", "Der Spiegel", "Wired"] },
  { title: "Tunisia IMF Deal Collapse", description: "President Saied rejects IMF $1.9bn conditional loan citing sovereignty concerns, triggering credit rating downgrade and capital flight.", category: "Economic disruptions", severity: 3, confidence: 0.95, latitude: 36.82, longitude: 10.17, timestamp: h(27), sources: ["IMF Statement", "Agence Tunis Afrique Presse", "Bloomberg"] },
  { title: "Japan Coast Guard Drone Intercept", description: "JMSDF P-1 patrol aircraft intercepts Chinese military drone flying 15km inside Japan's ADIZ near Senkaku Islands.", category: "Military activity", severity: 3, confidence: 0.88, latitude: 25.75, longitude: 123.47, timestamp: h(31), sources: ["NHK", "Kyodo News", "Jane's Defence Weekly"] },
  { title: "Congo Basin Deforestation Crisis", description: "Satellite data confirms 2.3m hectare clearance in six months — largest ever recorded — threatening global carbon sink and biodiversity corridor.", category: "Natural disasters", severity: 3, confidence: 0.93, latitude: -0.23, longitude: 25.51, timestamp: h(38), sources: ["Global Forest Watch", "WWF", "Nature Climate Change"] },
  { title: "Gulf of Guinea Piracy Escalates", description: "MDAT-GoG reports 14 crew kidnappings from three separate vessels in international waters off Nigeria within a single week.", category: "Trade chokepoints", severity: 4, confidence: 0.87, latitude: 3.50, longitude: 3.30, timestamp: h(42), sources: ["IMB Piracy Reporting Centre", "Splash247", "Lloyd's List"] },
  { title: "Serbia-Kosovo Border Closure", description: "Belgrade closes two northern border crossings after Kosovo deploys special police units to Serb-majority municipalities, raising NATO alarm.", category: "Military activity", severity: 3, confidence: 0.82, latitude: 43.32, longitude: 21.89, timestamp: h(46), sources: ["Balkan Insight", "AFP", "EULEX Kosovo"] },
  { title: "Israeli Judicial Overhaul Protests", description: "1.5m citizens paralyse Tel Aviv's highways and Ben Gurion Airport in 37th consecutive week of demonstration against Supreme Court reform.", category: "Strategic hotspots", severity: 2, confidence: 0.99, latitude: 32.08, longitude: 34.78, timestamp: h(53), sources: ["Haaretz", "Times of Israel", "BBC"] },
  { title: "Sahara Solar Farm Sabotage", description: "Moroccan-Algerian border tension escalates as Xlinks interconnector route survey teams face armed harassment in disputed territory.", category: "Energy", severity: 2, confidence: 0.68, latitude: 27.15, longitude: -8.68, timestamp: h(57), sources: ["North Africa Energy", "Middle East Eye", "Politico EU"] },
  { title: "Bangladesh Garment Worker Strike", description: "500,000 RMG workers halt production at 600 factories after government rejects 140% minimum wage demand, disrupting H&M and Zara supply chains.", category: "Economic disruptions", severity: 3, confidence: 0.91, latitude: 23.81, longitude: 90.41, timestamp: h(63), sources: ["Reuters", "Clean Clothes Campaign", "Financial Times"] },
  { title: "Mozambique Channel LNG Disruption", description: "Ansar al-Sunna ambush forces Eni and Shell helicopter evacuation of offshore Coral South FLNG vessel, halting 3.4m tonnes per annum output.", category: "Energy", severity: 4, confidence: 0.78, latitude: -15.50, longitude: 40.20, timestamp: h(67), sources: ["Acled", "S&P Global Platts", "Reuters"] },
  { title: "US-Iran Nuclear Talks Breakdown", description: "Vienna negotiations collapse after Iran insists on IRGC sanctions removal as precondition; enrichment continues at Natanz B facility.", category: "Strategic hotspots", severity: 4, confidence: 0.88, latitude: 35.69, longitude: 51.39, timestamp: h(74), sources: ["Reuters", "IAEA", "Associated Press"] },
  { title: "Australia-China Iron Ore Tariff Dispute", description: "Beijing imposes 25% tariff on Australian iron ore citing 'quality irregularities', hitting 60% of Pilbara export revenue and ASX mining stocks.", category: "Sanctions", severity: 3, confidence: 0.86, latitude: -22.90, longitude: 118.10, timestamp: h(78), sources: ["Australian Financial Review", "Bloomberg", "Nikkei Asia"] },
  { title: "Central African Republic Mineral War", description: "Wagner-backed FAD forces clash with FACA army over newly discovered Ndassima gold deposit, causing 3,000 civilian displacement.", category: "Conflicts", severity: 4, confidence: 0.74, latitude: 5.47, longitude: 18.57, timestamp: h(82), sources: ["UN Panel of Experts", "Radio Ndeke Luka", "The Sentry"] },
  { title: "Suez Canal Fee Surge", description: "Egyptian Suez Canal Authority imposes 15% emergency toll surcharge citing Red Sea security costs; 23 carriers announce Cape of Good Hope diversions.", category: "Trade chokepoints", severity: 3, confidence: 0.96, latitude: 30.42, longitude: 32.34, timestamp: h(86), sources: ["Suez Canal Authority", "Drewry", "Lloyd's List"] },
  { title: "Peru Lithium Mine Blockade", description: "Indigenous Aymara communities blockade access to Macusani lithium deposits, threatening $2.3bn CATL joint venture and EV supply chain.", category: "Economic disruptions", severity: 3, confidence: 0.84, latitude: -14.07, longitude: -70.43, timestamp: h(93), sources: ["Reuters", "Mining Monitor", "El Comercio"] },
  { title: "Lebanon Banking System Collapse", description: "Banque du Liban halts all forex operations as USD reserves drop below $500m; ATM withdrawals suspended nationwide, civil unrest growing.", category: "Economic disruptions", severity: 5, confidence: 0.92, latitude: 33.89, longitude: 35.50, timestamp: h(97), sources: ["IMF Staff Report", "L'Orient Le Jour", "Bloomberg"] },
  { title: "Mozambique Gas Field Disruption", description: "Category 4 cyclone Freddy destroys Maputo port infrastructure used for LNG equipment import, delaying Total project restart by 18 months.", category: "Natural disasters", severity: 4, confidence: 0.95, latitude: -25.97, longitude: 32.57, timestamp: h(103), sources: ["INCN Mozambique", "Reuters", "Offshore Energy"] },
  { title: "Serbia Lithium Mining Backlash", description: "Mass protests force government to cancel Rio Tinto Jadar lithium mine licence; EU critical minerals supply plan faces 8-year delay.", category: "Economic disruptions", severity: 2, confidence: 0.97, latitude: 44.80, longitude: 20.46, timestamp: h(107), sources: ["Rio Tinto Statement", "Balkan Insight", "The Guardian"] },
  { title: "Taiwan Semiconductor Export Controls", description: "Taipei restricts advanced chip manufacturing equipment exports to 23 countries under US pressure, targeting dual-use 3nm-capable gear.", category: "Sanctions", severity: 3, confidence: 0.91, latitude: 25.04, longitude: 121.56, timestamp: h(111), sources: ["MOEA Taiwan", "Nikkei Asia", "Semiconductor Industry Association"] },
  // --- Middle East Escalation Arc ---
  { title: "Iran Closes Strait of Hormuz to Western Shipping", description: "IRGC Navy enforces total blockade of the Strait of Hormuz following US-Iran escalation, halting 20% of global oil flow and triggering emergency IEA reserve release. Lloyds market suspends all underwriting for the Persian Gulf.", category: "Trade chokepoints", severity: 5, confidence: 0.94, latitude: 26.56, longitude: 56.25, timestamp: h(17), sources: ["Reuters", "Lloyd's List", "IEA Emergency Statement"] },
  { title: "Iran Seizes Greek Oil Tanker in Gulf of Oman", description: "IRGC fast boats intercept and board the MT Ariadne Star in international waters 40nm south of Bandar Abbas, detaining 22 crew. Iran cites procedural violations as pretext; US 5th Fleet on heightened alert.", category: "Military activity", severity: 5, confidence: 0.96, latitude: 25.90, longitude: 57.10, timestamp: h(21), sources: ["AP News", "UKMTO", "Greek Foreign Ministry"] },
  { title: "US Carrier Strike Group Enters Persian Gulf", description: "USS Carl Vinson Carrier Strike Group transits the Strait of Hormuz in a show of force following Iranian closure declaration. F/A-18 combat air patrols established over the Gulf. Iran warns of decisive response.", category: "Military activity", severity: 5, confidence: 0.98, latitude: 26.10, longitude: 54.80, timestamp: h(13), sources: ["CENTCOM", "Reuters", "USNI News"] },
  { title: "Israel Strikes Iranian Nuclear Facility at Natanz", description: "Israeli Air Force conducts overnight precision strikes on Natanz uranium enrichment facility using long-range munitions, setting back Iranian nuclear program by an estimated 18-24 months according to intelligence assessments.", category: "Military activity", severity: 5, confidence: 0.91, latitude: 33.73, longitude: 51.73, timestamp: h(25), sources: ["Haaretz", "Reuters", "Times of Israel"] },
  { title: "Oil Price Surges Past $120 on Hormuz Crisis", description: "Brent crude jumps 18% to $121 per barrel as Hormuz closure cuts 20 million barrels per day from global supply. Emergency OPEC+ teleconference called. Saudi Arabia activates Yanbu Red Sea export terminal as alternative route.", category: "Energy", severity: 5, confidence: 0.99, latitude: 24.47, longitude: 39.61, timestamp: h(15), sources: ["Bloomberg", "OPEC", "S&P Global Platts"] },
  { title: "Jordan Declares Emergency Over Refugee Surge", description: "Jordan activates emergency border protocols as 180,000 civilians flee escalating Israel-Iran exchange across Syria and Lebanon. UNHCR warns of largest displacement crisis since 2015.", category: "Strategic hotspots", severity: 4, confidence: 0.87, latitude: 31.95, longitude: 35.93, timestamp: h(16), sources: ["UNHCR", "Al Jazeera", "Jordan Times"] },
  { title: "Saudi Arabia Evacuates Eastern Province Oil Workers", description: "Aramco suspends non-essential operations at Ras Tanura and Abqaiq refineries amid Gulf tensions. 12,000 expat workers airlifted. Markets brace for major supply disruption.", category: "Energy", severity: 4, confidence: 0.92, latitude: 26.63, longitude: 50.04, timestamp: h(22), sources: ["Saudi Aramco Statement", "Financial Times", "Bloomberg"] },
  // --- Russia-Ukraine Escalation ---
  { title: "Russia Launches Largest Drone Barrage of 2026", description: "Russia fires 186 Shahed-136 drones in overnight wave targeting Kyiv, Odesa, and Dnipro. Ukrainian air defence intercepts 143; 14 strike residential districts causing 31 fatalities. EU emergency energy council convened.", category: "Military activity", severity: 5, confidence: 0.97, latitude: 50.45, longitude: 30.52, timestamp: h(28), sources: ["Reuters", "Kyiv Independent", "BBC"] },
  { title: "North Korea Deploys Troops to Russia-Ukraine Front", description: "US and UK intelligence confirm 18,000 North Korean soldiers now operating with Russian forces in Zaporizhzhia and Kherson oblasts, equipped with KN-23 artillery systems. UN Security Council holds emergency session.", category: "Military activity", severity: 5, confidence: 0.93, latitude: 47.83, longitude: 35.16, timestamp: h(30), sources: ["CIA Statement", "MI6 Assessment", "Reuters", "New York Times"] },
  { title: "Trump Halts All Ukraine Military Aid", description: "White House issues executive order freezing $61bn in congressionally approved military aid to Ukraine, effective immediately. Kyiv warns of catastrophic front-line collapse within 30 days. European allies convene emergency NATO session.", category: "Military activity", severity: 5, confidence: 0.99, latitude: 50.45, longitude: 30.52, timestamp: h(12), sources: ["Associated Press", "Politico", "The Guardian", "Defense One"] },
  { title: "Russia Seizes Kharkiv in Overnight Advance", description: "Russian armoured columns exploit reduced Ukrainian air defence following US aid freeze, advancing 40km to encircle Kharkiv. Ukraine President declares martial law nationwide. EU triggers maximum sanctions package.", category: "Military activity", severity: 5, confidence: 0.95, latitude: 49.99, longitude: 36.23, timestamp: h(8), sources: ["Kyiv Independent", "Reuters", "ISW", "BBC"] },
  // --- Taiwan-China Crisis ---
  { title: "China Formally Annexes Scarborough Shoal", description: "PLAN raises Chinese flag on Scarborough Shoal and declares it a domestic territory under new maritime sovereignty decree. Philippines invokes 2016 PCA ruling and calls emergency ASEAN+US summit. US 7th Fleet moves to condition 3.", category: "Military activity", severity: 5, confidence: 0.94, latitude: 15.12, longitude: 117.75, timestamp: h(14), sources: ["Reuters", "CNN", "CSIS Asia Maritime Transparency Initiative", "Philippine Star"] },
  { title: "Taiwan Strait Full Blockade Declared", description: "PLA Eastern Theatre Command declares full naval and air blockade of Taiwan, banning all foreign vessels from entering 50nm exclusion zone. TSMC halts operations. NYSE-listed Taiwan stocks suspended.", category: "Military activity", severity: 5, confidence: 0.96, latitude: 24.38, longitude: 120.42, timestamp: h(18), sources: ["PLA Daily", "Reuters", "CSIS", "Nikkei Asia", "Bloomberg"] },
  { title: "Taiwan Activates Reserve Forces for First Time Since 1958", description: "President Lai Ching-te orders mobilisation of 2.3 million reservists following Chinese coast guard blockade and suspension of civilian flights. Semiconductor fabs activate continuity protocols.", category: "Strategic hotspots", severity: 5, confidence: 0.91, latitude: 25.04, longitude: 121.56, timestamp: h(19), sources: ["Taiwan Presidential Office", "Reuters", "Nikkei Asia", "TSMC Statement"] },
  // --- Global Economic Shockwaves ---
  { title: "US Imposes Emergency Tariffs on Chinese Steel", description: "White House invokes Section 232 to impose 45% emergency tariff on all Chinese steel and aluminum imports, citing national security. Beijing vows symmetrical retaliation within 72 hours.", category: "Sanctions", severity: 4, confidence: 0.99, latitude: 38.90, longitude: -77.03, timestamp: h(27), sources: ["Wall Street Journal", "Bloomberg", "USTR"] },
  { title: "China Cuts All Rare Earth Exports to G7 Nations", description: "Beijing announces total suspension of rare earth element and critical mineral exports to all G7 countries, effective immediately. Covers 17 REEs, gallium, germanium and graphite. EV, defence and semiconductor industries face immediate supply shock.", category: "Sanctions", severity: 5, confidence: 0.99, latitude: 39.90, longitude: 116.40, timestamp: h(9), sources: ["Xinhua", "Reuters", "Financial Times", "Bloomberg"] },
  { title: "Brent Crude Hits $145 Amid Supply Shock", description: "Brent crude breaks through $145/barrel for first time since 2008 as Hormuz closure, Venezuela seizure, and Libya shutdown combine to remove 24 million bpd from global supply. IEA releases emergency reserves.", category: "Energy", severity: 5, confidence: 0.99, latitude: 0.00, longitude: 0.00, timestamp: h(20), sources: ["Bloomberg", "IEA Emergency Statement", "OPEC", "Platts Analytics"] },
  { title: "S&P 500 Falls 8% — Circuit Breakers Triggered", description: "New York Stock Exchange activates Level 2 circuit breakers after S&P 500 plunges 8.3% at open on Iran-US war escalation, oil at $145, and SWIFT disruption fears. Federal Reserve calls emergency board meeting.", category: "Economic disruptions", severity: 5, confidence: 0.99, latitude: 40.71, longitude: -74.01, timestamp: h(5), sources: ["NYSE", "Bloomberg", "CNBC", "Federal Reserve"] },
  { title: "Global Shipping Rates Hit Record on Dual Chokepoint Crisis", description: "Simultaneous closure of Strait of Hormuz and Houthi attacks in Red Sea remove 40% of global tanker capacity. Drewry World Container Index spikes 340% week-on-week. Rotterdam declares port emergency.", category: "Trade chokepoints", severity: 5, confidence: 0.98, latitude: 51.92, longitude: 4.48, timestamp: h(23), sources: ["Drewry", "Bloomberg", "Lloyd's List", "S&P Global Commodity Insights"] },
  { title: "Global Gold Price Smashes Record at $3,800/oz", description: "Spot gold breaches $3,800 per troy ounce as investors flee equities amid multi-front geopolitical crisis. Central banks of India, China and Turkey reported as aggressive buyers. Dollar weakens 3.4% on safe-haven rotation.", category: "Economic disruptions", severity: 4, confidence: 0.99, latitude: 51.50, longitude: -0.13, timestamp: h(6), sources: ["Bloomberg", "Reuters", "World Gold Council", "FT Markets"] },
  { title: "Bitcoin Crashes 42% as SWIFT Outage Hits Crypto", description: "Bitcoin falls from $98,000 to $56,700 in 6 hours as panic liquidations follow SWIFT disruption, exchange withdrawal freezes and reports of state-actor crypto wallet seizures. $800bn wiped from total crypto market cap.", category: "Economic disruptions", severity: 4, confidence: 0.97, latitude: 1.35, longitude: 103.81, timestamp: h(10), sources: ["CoinDesk", "Bloomberg", "Reuters", "Chainalysis"] },
  { title: "Germany Enters Recession as Energy Costs Bite", description: "Destatis confirms Germany GDP contracted 0.9% in Q4 2025 and 0.6% in Q1 2026. BASF and Thyssenkrupp announce 23,000 combined layoffs. Bundesbank warns of prolonged industrial hollowing.", category: "Economic disruptions", severity: 4, confidence: 0.99, latitude: 52.52, longitude: 13.40, timestamp: h(29), sources: ["Destatis", "Bundesbank", "Reuters", "Der Spiegel"] },
  { title: "IMF Emergency $500bn Global Stability Fund Activated", description: "IMF Board activates rarely used Global Stabilisation Mechanism, pledging $500bn in emergency liquidity to developing nations facing capital flight from cascading geopolitical crises. 34 countries in queue.", category: "Economic disruptions", severity: 4, confidence: 0.98, latitude: 38.90, longitude: -77.05, timestamp: h(16), sources: ["IMF Press Release", "Reuters", "Bloomberg", "Washington Post"] },
  { title: "UK Government Falls — Emergency Election Called", description: "Prime Minister loses confidence vote 287-341 after backbench rebellion over Ukraine policy reversal. King Charles dissolves Parliament. Emergency election set for April 10. Pound falls 4.2% versus dollar.", category: "Economic disruptions", severity: 4, confidence: 0.99, latitude: 51.50, longitude: -0.13, timestamp: h(11), sources: ["BBC", "The Guardian", "Sky News", "Reuters"] },
  // --- Cyber & Infrastructure ---
  { title: "Cyberattack Cripples SWIFT Banking Network", description: "Sophisticated nation-state actor disables SWIFT interbank messaging for 4 hours across 47 countries. $2.3 trillion in transactions frozen. Attribution points to Sandworm/GRU based on TTPs. Emergency fallback protocols activated.", category: "Cyber", severity: 5, confidence: 0.88, latitude: 50.85, longitude: 4.35, timestamp: h(24), sources: ["SWIFT Statement", "Mandiant", "CISA", "Financial Times"] },
  { title: "DeepSeek Cyberweapon Targets US Defence Contractors", description: "CISA issues emergency alert after Chinese state-linked AI cyberweapon successfully exfiltrates classified design data from Lockheed Martin, RTX and General Dynamics networks. F-35 programme documents among stolen files.", category: "Cyber", severity: 5, confidence: 0.87, latitude: 38.90, longitude: -77.03, timestamp: h(11), sources: ["CISA Alert", "Washington Post", "Wired", "Mandiant Threat Intelligence"] },
  { title: "Baltic Undersea Cable Severed Near Gotland", description: "Fiber optic cable connecting Sweden to Latvia severed in Swedish EEZ waters south of Gotland. Swedish navy deploys corvettes; NATO activates Baltic maritime surveillance. Russia denies involvement.", category: "Infrastructure outages", severity: 4, confidence: 0.79, latitude: 57.50, longitude: 19.00, timestamp: h(26), sources: ["SVT", "Reuters", "NATO"] },
  { title: "Germany Declares Energy Emergency as Gas Reserves Hit 20%", description: "Bundesnetzagentur activates Stage 2 Gas Emergency Plan as storage drops to 20.3%, triggering mandatory industrial curtailment. Chemical and automotive sectors ordered to reduce consumption by 30%.", category: "Energy", severity: 4, confidence: 0.98, latitude: 52.52, longitude: 13.40, timestamp: h(23), sources: ["Bundesnetzagentur", "Reuters", "Der Spiegel"] },
  // --- NATO / European Security ---
  { title: "EU Activates Article 42.7 Collective Defence", description: "European Council triggers EU mutual defence clause for first time in history following Baltic cable sabotage and hybrid attacks on Estonia and Latvia. 12 member states deploy rapid reaction forces to eastern flank.", category: "Military activity", severity: 5, confidence: 0.92, latitude: 59.43, longitude: 24.74, timestamp: h(16), sources: ["European Council", "Financial Times", "Politico Europe", "DW"] },
  { title: "NATO Invokes Article 5 Over Baltic Attacks", description: "NATO Secretary General confirms invocation of Article 5 collective defence following confirmed Russian GRU cyber and sabotage attacks on Estonian infrastructure and Latvian border posts. First Article 5 activation since 9/11.", category: "Military activity", severity: 5, confidence: 0.97, latitude: 59.43, longitude: 24.74, timestamp: h(9), sources: ["NATO HQ", "AP News", "Reuters", "Defense News"] },
  { title: "Macron Proposes European Nuclear Deterrent", description: "French President Macron announces proposal to extend France's nuclear umbrella to all EU member states, offering joint deterrence doctrine as NATO credibility questioned. UK and Germany signal qualified support.", category: "Strategic hotspots", severity: 4, confidence: 0.91, latitude: 48.85, longitude: 2.35, timestamp: h(19), sources: ["Elysee Palace", "Reuters", "Le Monde", "Financial Times"] },
  { title: "Japan Announces $200bn Emergency Defence Budget", description: "Japanese Cabinet approves emergency 30 trillion yen defence supplementary budget — the largest in post-war history — following Taiwan activation and DPRK missile launches. Pacifist constitutional reinterpretation fast-tracked in Diet.", category: "Military activity", severity: 4, confidence: 0.96, latitude: 35.68, longitude: 139.69, timestamp: h(14), sources: ["NHK", "Kyodo News", "Nikkei Asia", "Reuters"] },
  // --- South Asia ---
  { title: "Pakistan Army Mobilises on Afghan Border", description: "Pakistan Army deploys three additional brigades to Durand Line following cross-border TTP rocket strikes killing 27 soldiers. Islamabad warns of hot pursuit operations inside Afghan territory.", category: "Military activity", severity: 4, confidence: 0.88, latitude: 33.60, longitude: 70.25, timestamp: h(26), sources: ["Dawn", "Reuters", "Al Jazeera"] },
  { title: "Pakistan Conducts Nuclear-Capable Missile Test", description: "Pakistan test-fires Shaheen-III MRBM with range of 2,750km during India-Pakistan tensions. India puts Strategic Forces Command on elevated alert. US, China and UK issue joint de-escalation statement.", category: "Strategic hotspots", severity: 5, confidence: 0.96, latitude: 30.38, longitude: 71.68, timestamp: h(21), sources: ["ISPR Pakistan", "Times of India", "Reuters", "Bulletin of the Atomic Scientists"] },
  { title: "India-Pakistan Cross-Border Artillery Duel", description: "Artillery exchange erupts across 220km of Line of Control after Indian strike on alleged TTP camp kills 11 Pakistani soldiers. Pakistan puts air force on scramble alert. Washington hotline calls to both capitals.", category: "Military activity", severity: 5, confidence: 0.90, latitude: 33.73, longitude: 74.87, timestamp: h(12), sources: ["Indian Army", "ISPR Pakistan", "Reuters", "The Hindu"] },
  // --- Americas ---
  { title: "Venezuela Seizes Exxon Offshore Platform", description: "Maduro government deploys naval vessels to forcibly take control of ExxonMobil Stabroek Block platform, claiming exclusive economic zone violation. Guyana requests UN Security Council emergency session.", category: "Energy", severity: 5, confidence: 0.92, latitude: 7.12, longitude: -58.40, timestamp: h(27), sources: ["Reuters", "Bloomberg", "Caribbean Report"] },
  { title: "Mexico Declares Cartel Emergency — Army Deployed Nationwide", description: "President Sheinbaum deploys 80,000 army troops to all 32 states after CJNG and Sinaloa cartel alliance launches coordinated attacks on police stations and government buildings across 18 cities simultaneously.", category: "Conflicts", severity: 5, confidence: 0.93, latitude: 23.63, longitude: -102.55, timestamp: h(18), sources: ["Mexican Presidency", "Reuters", "El Universal", "InSight Crime"] },
  // --- Africa ---
  { title: "Sudan Famine Declared — 8 Million Facing Starvation", description: "UN formally declares famine in 5 Sudanese states as RSF controls humanitarian corridors. IPC phase 5 conditions confirmed across Darfur and Kordofan. WFP warns of worst food security emergency since Somalia 2011.", category: "Conflicts", severity: 4, confidence: 0.97, latitude: 15.55, longitude: 32.53, timestamp: h(29), sources: ["WFP", "UN OCHA", "IPC", "BBC Africa"] },
  { title: "West Africa ECOWAS Bloc Dissolves", description: "Mali, Burkina Faso, Niger and Guinea formally withdraw from ECOWAS and announce new Alliance of Sahel States with Russian and Chinese security partnerships. Threatens $400bn West African trade zone.", category: "Strategic hotspots", severity: 4, confidence: 0.92, latitude: 17.57, longitude: -3.99, timestamp: h(10), sources: ["AFP", "Al Jazeera", "RFI", "Africa Intelligence"] },
  { title: "Al-Shabaab Overruns Mogadishu Checkpoint Network", description: "Al-Shabaab militants breach outer security ring of Mogadishu, seizing 14 police checkpoints and besieging AMISOM logistics hub. African Union requests emergency reinforcements.", category: "Conflicts", severity: 5, confidence: 0.84, latitude: 2.05, longitude: 45.34, timestamp: h(25), sources: ["ACLED", "AFP", "UN Somalia"] },
  // --- Latest Breaking (sourced from live feeds) ---
  { title: "Tehran Hit by Heavy Bombing on Day Seven of US-Israel War", description: "US B-2 stealth bombers and Israeli F-35s conduct seventh consecutive night of strikes on Tehran, targeting IRGC command centres and missile storage facilities. Iranian state TV confirms military academy hit. Civilian casualties reported in Shahran district.", category: "Military activity", severity: 5, confidence: 0.99, latitude: 35.69, longitude: 51.39, timestamp: h(2), sources: ["Al Jazeera", "Reuters", "BBC", "CENTCOM"] },
  { title: "Iran Targets Israeli Embassy in Bahrain — Saudi Arabia Intercepts Missile", description: "IRGC ballistic missile aimed at Israeli embassy in Manama intercepted by Saudi Patriot battery over Gulf waters. Bahrain evacuates diplomatic quarter. Confirms Iran broadening target set beyond Israel and US bases.", category: "Military activity", severity: 5, confidence: 0.97, latitude: 26.21, longitude: 50.59, timestamp: h(3), sources: ["Al Jazeera", "Saudi MoD", "Bahrain News Agency"] },
  { title: "More Than 120 Killed in Israel's Lebanon Attacks", description: "Israeli air and ground strikes kill 124 people across Beirut southern suburbs, Bekaa Valley, and eastern Lebanon as Hezbollah front fully activated. UN calls it the deadliest 48 hours in Lebanon since 2006.", category: "Conflicts", severity: 5, confidence: 0.98, latitude: 33.89, longitude: 35.50, timestamp: h(1), sources: ["Al Jazeera", "Reuters", "UN UNIFIL", "Lebanese Red Cross"] },
  { title: "US Says Iran Missile Attacks Down 90% After B-2 Strikes", description: "Pentagon briefing reports Iranian ballistic missile launch capacity reduced by 90% following destruction of six IRGC launch sites by B-2 Spirit bombers. Trump declares 'Mission Proceeding as Planned'. Iran denies capability degradation.", category: "Military activity", severity: 5, confidence: 0.95, latitude: 32.43, longitude: 53.69, timestamp: h(4), sources: ["Pentagon", "Al Jazeera", "Reuters", "Defense One"] },
  { title: "South Korea Puts Military on DEFCON 3", description: "ROK Joint Chiefs of Staff elevates readiness to DEFCON 3 following North Korean submarine activity near Busan naval base and intercepted communications about imminent provocation. US Forces Korea on high alert.", category: "Military activity", severity: 5, confidence: 0.89, latitude: 37.56, longitude: 126.97, timestamp: h(8), sources: ["ROK Joint Chiefs", "Yonhap", "Reuters", "Stars and Stripes"] },
  { title: "Turkey Closes Bosphorus to All Warships", description: "Ankara invokes Montreux Convention Article 19 to deny passage of all warships through the Bosphorus Strait, citing active conflict in Black Sea. US and Russian naval assets trapped in respective seas.", category: "Trade chokepoints", severity: 4, confidence: 0.94, latitude: 41.08, longitude: 29.05, timestamp: h(13), sources: ["Turkish Foreign Ministry", "Reuters", "Jane's Defence", "Lloyd's List"] },
  { title: "Saudi Arabia Declares Neutrality, Halts US Base Access", description: "Riyadh announces formal neutrality in US-Iran conflict and suspends access to Prince Sultan Air Base, citing domestic stability risks. Kingdom opens backchannels to Tehran. Oil markets interpret move as bullish on further supply disruption.", category: "Strategic hotspots", severity: 5, confidence: 0.91, latitude: 24.68, longitude: 46.72, timestamp: h(6), sources: ["Saudi Press Agency", "Reuters", "Al Arabiya", "Financial Times"] },
  { title: "Kazakhstan Announces Russian Asset Seizures", description: "Nur-Sultan expropriates 8 Russian-owned industrial facilities under newly passed foreign ownership law, signalling strategic pivot toward EU and China. Moscow threatens economic countermeasures.", category: "Sanctions", severity: 3, confidence: 0.83, latitude: 51.18, longitude: 71.45, timestamp: h(26), sources: ["RFE/RL", "Interfax", "Financial Times"] },
  { title: "UAE Announces $150bn Emergency Oil Infrastructure Build", description: "Abu Dhabi commits $150bn to fast-track pipeline bypass around Strait of Hormuz through Fujairah, doubling existing Habshan-Fujairah pipeline capacity to 3.5m bpd within 90 days on emergency wartime footing.", category: "Energy", severity: 3, confidence: 0.88, latitude: 23.42, longitude: 53.84, timestamp: h(10), sources: ["ADNOC Statement", "Reuters", "Bloomberg", "Middle East Eye"] },
  { title: "OPEC+ Emergency Meeting Fails — Cartel Fractures", description: "Saudi Arabia and Russia veto UAE and Kuwait proposal to release 3m bpd emergency reserves, citing sovereign revenue protection. Iraq and UAE announce unilateral production increases, effectively breaking cartel discipline.", category: "Energy", severity: 4, confidence: 0.94, latitude: 24.46, longitude: 54.37, timestamp: h(14), sources: ["OPEC Secretariat", "Reuters", "Bloomberg", "S&P Global Platts"] },
  { title: "India Deploys Aircraft Carrier to Arabian Sea", description: "INS Vikrant carrier battle group enters Arabian Sea with full air wing embarked, positioned to protect Indian shipping and enforce freedom of navigation through Hormuz approaches. India advises nationals to leave Iran and Iraq.", category: "Military activity", severity: 4, confidence: 0.93, latitude: 15.50, longitude: 65.00, timestamp: h(15), sources: ["Indian Navy", "Reuters", "The Hindu", "NDTV"] },
  { title: "Red Cross Suspends Operations in Five Conflict Zones", description: "ICRC suspends field operations in Sudan, Gaza, southern Lebanon, Yemen and eastern Ukraine citing inability to guarantee staff safety and deliberate targeting of humanitarian convoys. Worst operational contraction since WWII.", category: "Conflicts", severity: 4, confidence: 0.98, latitude: 46.20, longitude: 6.15, timestamp: h(20), sources: ["ICRC Statement", "UN Humanitarian", "Reuters", "BBC"] },
  { title: "India-Pakistan Nuclear Doctrine Statements Exchange", description: "Pakistan NSA warns of asymmetric deterrent response to Indian conventional strikes near LoC. India's CDS reaffirms no-first-use policy while confirming operational readiness. US State Dept urges de-escalation.", category: "Strategic hotspots", severity: 5, confidence: 0.86, latitude: 28.64, longitude: 77.21, timestamp: h(27), sources: ["Times of India", "Dawn", "Reuters"] },
];

const SEED_COUNTRIES = [
  { code: "IRN", name: "Iran", instabilityScore: 93, momentumChange: "+18", primaryDrivers: ["US-Israel military strikes", "Ballistic missile exchange", "Gulf shipping blockade"], confidenceLevel: "High" },
  { code: "UKR", name: "Ukraine", instabilityScore: 91, momentumChange: "+5", primaryDrivers: ["Russia seizes Kharkiv", "Trump halts all US military aid", "Infrastructure destruction"], confidenceLevel: "High" },
  { code: "TWN", name: "Taiwan", instabilityScore: 90, momentumChange: "+28", primaryDrivers: ["PLA full naval blockade declared", "Reserve forces mobilised", "TSMC operations halted"], confidenceLevel: "High" },
  { code: "SDN", name: "Sudan", instabilityScore: 88, momentumChange: "+6", primaryDrivers: ["Civil war — RSF territorial advance", "Famine declared — 8M at risk", "Humanitarian corridor collapse"], confidenceLevel: "High" },
  { code: "LBN", name: "Lebanon", instabilityScore: 85, momentumChange: "+20", primaryDrivers: ["Israeli ground invasion of southern Lebanon", "Hezbollah 3,000-rocket campaign", "Banking system collapse"], confidenceLevel: "High" },
  { code: "ISR", name: "Israel", instabilityScore: 84, momentumChange: "+22", primaryDrivers: ["Iran missile barrages", "Ground invasion of Lebanon", "Hezbollah 3,000-rocket campaign"], confidenceLevel: "High" },
  { code: "AFG", name: "Afghanistan", instabilityScore: 82, momentumChange: "+3", primaryDrivers: ["Taliban governance fragility", "Pakistan border mobilisation", "Humanitarian emergency"], confidenceLevel: "High" },
  { code: "SOM", name: "Somalia", instabilityScore: 82, momentumChange: "+3", primaryDrivers: ["Al-Shabaab overruns Mogadishu checkpoints", "Port infrastructure attacks", "Governance deficit"], confidenceLevel: "High" },
  { code: "SYR", name: "Syria", instabilityScore: 80, momentumChange: "+2", primaryDrivers: ["Israeli airstrikes on Hezbollah supply routes", "Regional proxy escalation", "Economic collapse"], confidenceLevel: "High" },
  { code: "YEM", name: "Yemen", instabilityScore: 80, momentumChange: "+4", primaryDrivers: ["Houthi Red Sea campaign continues", "Strait of Hormuz crisis spillover", "Humanitarian emergency"], confidenceLevel: "High" },
  { code: "PAK", name: "Pakistan", instabilityScore: 78, momentumChange: "+14", primaryDrivers: ["Nuclear-capable missile test conducted", "India-Pakistan artillery duel", "Army mobilised on Afghan border"], confidenceLevel: "High" },
  { code: "MMR", name: "Myanmar", instabilityScore: 78, momentumChange: "+6", primaryDrivers: ["Resistance forces capture Lashio", "Junta northern supply lines cut", "ASEAN crisis"], confidenceLevel: "High" },
  { code: "HTI", name: "Haiti", instabilityScore: 86, momentumChange: "+4", primaryDrivers: ["Gang control of capital", "State institutional collapse", "Food insecurity 5M+"], confidenceLevel: "High" },
  { code: "RUS", name: "Russia", instabilityScore: 74, momentumChange: "+8", primaryDrivers: ["Kharkiv offensive — major territorial gain", "DPRK troops deployed to front", "Trump aid suspension to Ukraine"], confidenceLevel: "High" },
  { code: "KOR", name: "South Korea", instabilityScore: 62, momentumChange: "+22", primaryDrivers: ["DEFCON 3 activated", "DPRK missile threat", "Regional war spillover from Taiwan"], confidenceLevel: "High" },
  { code: "CHN", name: "China", instabilityScore: 60, momentumChange: "+16", primaryDrivers: ["Full naval blockade of Taiwan declared", "US 7th Fleet on condition 3", "Rare earth export ban to G7"], confidenceLevel: "High" },
  { code: "IND", name: "India", instabilityScore: 58, momentumChange: "+14", primaryDrivers: ["India-Pakistan nuclear doctrine exchange", "Aircraft carrier deployed to Arabian Sea", "Cross-border artillery duel"], confidenceLevel: "High" },
  { code: "MEX", name: "Mexico", instabilityScore: 55, momentumChange: "+10", primaryDrivers: ["Cartel emergency — army deployed nationwide", "Border crossing seizures", "US tariff pressure"], confidenceLevel: "High" },
  { code: "ARG", name: "Argentina", instabilityScore: 54, momentumChange: "+3", primaryDrivers: ["Hyperinflation persists", "IMF conditions unmet risk", "Social unrest"], confidenceLevel: "High" },
];

const SECTORS = ["Energy", "Finance", "Transport", "Technology", "Manufacturing", "Agriculture", "Defense", "Telecommunications"];
const REGIONS = ["North America", "Europe", "Middle East", "Africa", "Asia Pacific", "Latin America"];
const SECTOR_BASE: Record<string, number[]> = {
  // Scores by region: [North America, Europe, Middle East, Africa, Asia Pacific, Latin America]
  "Energy":            [38, 88, 96, 62, 74, 54],
  "Finance":           [72, 74, 85, 52, 76, 64],
  "Transport":         [32, 74, 96, 70, 80, 58],
  "Technology":        [48, 52, 68, 42, 90, 44],
  "Manufacturing":     [32, 62, 84, 65, 92, 60],
  "Agriculture":       [24, 42, 88, 80, 68, 72],
  "Defense":           [52, 72, 96, 50, 89, 46],
  "Telecommunications":[28, 58, 82, 52, 74, 44],
};

async function seedDatabase() {
  const [existingEvents, existingCountries, existingSectors] = await Promise.all([
    storage.getEvents(),
    storage.getCountries(),
    storage.getSectorRisks(),
  ]);

  // Insert any seed events not already present (match by title)
  const existingTitles = new Set(existingEvents.map(e => e.title));
  const missingEvents = SEED_EVENTS.filter(e => !existingTitles.has(e.title));
  for (const e of missingEvents) {
    await storage.createEvent(e);
  }

  // Remove any Medium/Low confidence countries (cleanup for production)
  const lowConfidenceCodes = existingCountries
    .filter(c => c.confidenceLevel === "Medium" || c.confidenceLevel === "Low")
    .map(c => c.code);
  for (const code of lowConfidenceCodes) {
    await storage.deleteCountry(code);
  }

  // Insert any seed countries not already present (match by code)
  const refreshedCountries = await storage.getCountries();
  const existingCodes = new Set(refreshedCountries.map(c => c.code));
  const missingCountries = SEED_COUNTRIES.filter(c => !existingCodes.has(c.code));
  for (const c of missingCountries) {
    await storage.createCountry(c);
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

  app.post(api.news.refresh.path, async (_req, res) => {
    try {
      const result = await fetchAndIngestNews();
      res.json(result);
    } catch {
      res.status(500).json({ message: "Failed to refresh news" });
    }
  });

  startNewsFetchScheduler();

  return httpServer;
}
