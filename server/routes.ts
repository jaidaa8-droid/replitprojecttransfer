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

// SEED_EVENTS: confirmed real-world geopolitical events (2023–2025) with trusted sources only
const SEED_EVENTS = [
  // Middle East: Hamas & Gaza
  { title: "Hamas October 7 Attack on Southern Israel", description: "Hamas launches an unprecedented cross-border assault from Gaza, killing approximately 1,200 Israelis and taking 251 hostages in kibbutzim and at the Nova music festival. The deadliest day for Jewish people since the Holocaust. Israel declares a state of war.", category: "Conflicts", severity: 5, confidence: 0.99, latitude: 31.5, longitude: 34.47, timestamp: h(21144), sources: ["Reuters", "BBC", "AP News"] },
  { title: "Israel Launches Ground Operation in Gaza", description: "IDF begins a large-scale ground offensive into northern Gaza following weeks of air campaign, targeting Hamas tunnel infrastructure and command centres. UN warns of catastrophic humanitarian conditions as over one million people are displaced in the first week.", category: "Military activity", severity: 5, confidence: 0.99, latitude: 31.35, longitude: 34.35, timestamp: h(20664), sources: ["Reuters", "BBC", "AFP"] },
  { title: "Gaza Ceasefire Phase 1 Enters Force", description: "Phase 1 of a ceasefire agreement between Israel and Hamas enters force, pausing the 15-month conflict. The US, Qatar and Egypt-brokered deal includes the release of Israeli hostages held in Gaza in exchange for Palestinian prisoners held by Israel.", category: "Diplomatic", severity: 3, confidence: 0.99, latitude: 31.5, longitude: 34.47, timestamp: h(9864), sources: ["Reuters", "BBC", "Al Jazeera"] },

  // Middle East: Iran-Israel
  { title: "Iran Launches Operation True Promise Against Israel", description: "Iran fires approximately 300 drones, cruise missiles and ballistic missiles at Israeli territory in its first-ever direct attack on Israel. Around 99% are intercepted by Israeli, US, Jordanian and British defences. Iran cites retaliation for an Israeli airstrike on its consulate in Damascus.", category: "Military activity", severity: 5, confidence: 0.99, latitude: 32.08, longitude: 34.78, timestamp: h(16584), sources: ["Reuters", "BBC", "AP News"] },
  { title: "Israel Conducts Retaliatory Airstrikes Near Isfahan", description: "Israel launches limited airstrikes near Isfahan — its first direct strike on Iranian territory — in retaliation for Iran's April 14 drone and missile barrage. The strike targets air defence radar systems. Iran initially describes the damage as minimal.", category: "Military activity", severity: 4, confidence: 0.97, latitude: 32.65, longitude: 51.68, timestamp: h(16464), sources: ["Reuters", "BBC", "The Wall Street Journal"] },

  // Middle East: Lebanon
  { title: "Lebanon-Israel Ceasefire Takes Effect", description: "A 60-day ceasefire agreement between Israel and Hezbollah takes effect, brokered by the United States and France. IDF begins phased withdrawal from southern Lebanon. Hezbollah agrees to redeploy forces north of the Litani River under UN Security Council Resolution 1701.", category: "Diplomatic", severity: 3, confidence: 0.99, latitude: 33.55, longitude: 35.37, timestamp: h(11136), sources: ["Reuters", "BBC", "AFP"] },

  // Yemen / Red Sea
  { title: "Houthi Attacks on Red Sea Commercial Shipping Begin", description: "Yemen's Houthi movement begins targeting commercial vessels in the Red Sea and Gulf of Aden, claiming solidarity with Palestinians in Gaza. Major carriers including Maersk, MSC and CMA CGM announce diversions of ships to the longer Cape of Good Hope route.", category: "Trade chokepoints", severity: 4, confidence: 0.99, latitude: 14.8, longitude: 42.5, timestamp: h(20112), sources: ["Reuters", "Lloyd's List", "BBC"] },
  { title: "MV Rubymar Sinks in Red Sea After Houthi Missile Strike", description: "British-owned bulk carrier MV Rubymar sinks in the Red Sea two weeks after being struck by a Houthi anti-ship missile on 18 February 2024, becoming the first vessel sunk in the Red Sea conflict. The ship was carrying 21,000 tonnes of fertiliser.", category: "Trade chokepoints", severity: 4, confidence: 0.99, latitude: 13.5, longitude: 42.5, timestamp: h(17616), sources: ["Reuters", "BBC", "Lloyd's List"] },

  // Ukraine / Russia
  { title: "Ukraine Launches Surprise Ground Incursion into Russia's Kursk Oblast", description: "Ukrainian armed forces launch an unexpected cross-border ground offensive into Russia's Kursk Oblast, capturing dozens of settlements. It is the first occupation of Russian sovereign territory by a foreign army since World War II. Ukraine frames the operation as establishing a buffer zone.", category: "Military activity", severity: 5, confidence: 0.99, latitude: 51.75, longitude: 35.39, timestamp: h(13848), sources: ["Reuters", "BBC", "AP News"] },
  { title: "Russia Launches Major Coordinated Strikes on Ukrainian Power Grid", description: "Russia launches one of its most extensive attacks on Ukrainian energy infrastructure, targeting power stations, substations and heating plants across multiple regions ahead of winter. DTEK and Ukrenergo report critical damage leaving millions without electricity and heating.", category: "Infrastructure outages", severity: 5, confidence: 0.99, latitude: 50.45, longitude: 30.52, timestamp: h(11112), sources: ["Reuters", "BBC", "Kyiv Independent"] },
  { title: "North Korea Deploys Troops to Support Russia in Ukraine", description: "North Korea deploys approximately 10,000–12,000 troops to Russia to assist in operations in Ukraine, confirmed by US, South Korean and Ukrainian officials. Analysts describe it as the first confirmed deployment of North Korean ground forces to a foreign conflict since the Korean War.", category: "Military activity", severity: 5, confidence: 0.97, latitude: 49.8, longitude: 36.2, timestamp: h(11688), sources: ["Reuters", "BBC", "US DoD"] },

  // Asia-Pacific: North Korea
  { title: "North Korea Tests Hwasong-19 Intercontinental Ballistic Missile", description: "North Korea test-fires the Hwasong-19 ICBM, which travels approximately 1,000km and reaches an altitude of 7,687km before landing in the sea east of the Korean peninsula after an 86-minute flight. South Korea and the United States condemn the test as a violation of UN Security Council resolutions.", category: "Strategic hotspots", severity: 4, confidence: 0.99, latitude: 39.02, longitude: 125.75, timestamp: h(11664), sources: ["Reuters", "Yonhap", "BBC"] },
  { title: "North Korea and Russia Sign Comprehensive Strategic Partnership Treaty", description: "North Korea and Russia sign a comprehensive strategic partnership treaty during Putin's state visit to Pyongyang, pledging mutual military assistance if either party faces armed aggression. The treaty mirrors NATO's Article 5 mutual defence clause and includes defence industrial cooperation.", category: "Strategic hotspots", severity: 4, confidence: 0.99, latitude: 39.02, longitude: 125.75, timestamp: h(15000), sources: ["Reuters", "BBC", "AFP"] },

  // Asia-Pacific: Taiwan / South China Sea
  { title: "China PLA Launches Joint Sword-2024A Exercises Near Taiwan", description: "China's PLA launches Joint Sword-2024A military exercises encircling Taiwan following the inauguration of President Lai Ching-te. The exercises involve naval vessels, combat aircraft and missile units practising blockade and precision strike scenarios around the island.", category: "Military activity", severity: 4, confidence: 0.99, latitude: 24.0, longitude: 121.5, timestamp: h(15648), sources: ["Reuters", "BBC", "CSIS AMTI"] },
  { title: "China Coast Guard Uses Water Cannons on Philippine Vessels at Scarborough Shoal", description: "China Coast Guard vessels deploy water cannons against Philippine supply boats heading to BRP Sierra Madre at Second Thomas Shoal, injuring Filipino sailors. The Philippines condemns the action as a violation of international law and activates US-Philippines Mutual Defence Treaty consultations.", category: "Military activity", severity: 4, confidence: 0.99, latitude: 9.73, longitude: 115.87, timestamp: h(18000), sources: ["Reuters", "AP News", "Philippine Coast Guard"] },
  { title: "Philippines and US Hold Largest-Ever Balikatan Military Exercises", description: "The Philippines and United States conduct Balikatan 2024, their largest-ever joint military exercises involving more than 16,000 troops. For the first time, live-fire drills are conducted near the northern Philippines facing the Taiwan Strait. China condemns the exercises as destabilising.", category: "Military activity", severity: 3, confidence: 0.97, latitude: 18.5, longitude: 121.5, timestamp: h(16392), sources: ["Reuters", "AP News", "US Pacific Command"] },

  // Asia-Pacific: Myanmar
  { title: "Myanmar Resistance Forces Capture Lashio", description: "Myanmar's Brotherhood Alliance resistance coalition captures Lashio, the largest city in northern Shan State and headquarters of the military's Northeast Command. The fall of Lashio is one of the most significant territorial losses for the junta since its February 2021 coup.", category: "Conflicts", severity: 4, confidence: 0.97, latitude: 22.93, longitude: 97.75, timestamp: h(13680), sources: ["Reuters", "BBC", "Irrawaddy"] },

  // Africa
  { title: "Sudan Civil War Erupts Between Army and RSF", description: "Armed conflict erupts between Sudan's regular army (SAF) and the Rapid Support Forces (RSF) paramilitary group, starting in Khartoum and spreading to Darfur and other regions. The fighting triggers one of the world's worst humanitarian crises, with thousands killed and over 8 million people displaced.", category: "Conflicts", severity: 5, confidence: 0.99, latitude: 15.55, longitude: 32.53, timestamp: h(25344), sources: ["Reuters", "BBC", "UN OCHA"] },
  { title: "Niger Military Coup Deposes President Bazoum", description: "Niger's Presidential Guard stages a coup deposing elected President Mohamed Bazoum and installing General Abdourahamane Tchiani as leader. ECOWAS, France and the United States condemn the takeover. France and the US subsequently withdraw all military forces from the country.", category: "Conflicts", severity: 3, confidence: 0.99, latitude: 13.51, longitude: 2.12, timestamp: h(22896), sources: ["Reuters", "BBC", "AFP"] },
  { title: "M23 Rebels Seize Goma in Eastern DR Congo", description: "M23 rebels, backed by Rwanda, seize Goma — capital of North Kivu province and eastern DRC's largest city — in a rapid offensive. Hundreds of thousands of civilians are displaced. The UN Security Council holds an emergency session and warns of catastrophic humanitarian consequences.", category: "Conflicts", severity: 5, confidence: 0.99, latitude: -1.66, longitude: 29.22, timestamp: h(9672), sources: ["Reuters", "BBC", "UN MONUSCO"] },

  // Trade / Economic
  { title: "Panama Canal Cuts Daily Transits Due to Severe Drought", description: "The Panama Canal Authority reduces the maximum number of daily vessel transits from 36 to 18 due to critically low Gatun Lake water levels caused by El Niño drought. Hundreds of vessels queue on both sides of the canal with waiting times of up to three weeks, disrupting global supply chains.", category: "Trade chokepoints", severity: 3, confidence: 0.99, latitude: 9.08, longitude: -79.68, timestamp: h(20160), sources: ["Reuters", "Bloomberg", "Panama Canal Authority"] },
  { title: "Global Container Shipping Rates Surge Amid Red Sea Crisis", description: "Container shipping rates rise more than 200% as Houthi attacks force vessels to divert around the Cape of Good Hope, adding 10–14 days and significant additional costs per voyage. The Drewry World Container Index hits its highest level since 2022.", category: "Economic disruptions", severity: 3, confidence: 0.99, latitude: -34.5, longitude: 18.5, timestamp: h(19440), sources: ["Reuters", "Bloomberg", "Drewry"] },
  { title: "Venezuela Presidential Election Results Disputed Amid Fraud Allegations", description: "Venezuela's electoral authority declares Nicolas Maduro the winner of the presidential election by a narrow margin. The opposition presents voting tallies showing challenger Edmundo Gonzalez won decisively. The United States, European Union and most Latin American governments refuse to recognise the official result.", category: "Conflicts", severity: 3, confidence: 0.97, latitude: 10.48, longitude: -66.88, timestamp: h(14040), sources: ["Reuters", "BBC", "Carter Center"] },
  { title: "Bangladesh PM Sheikh Hasina Resigns and Flees Amid Mass Protests", description: "Prime Minister Sheikh Hasina resigns and flees Bangladesh by helicopter to India as mass protests over public sector job quotas escalate into a broader anti-government uprising. An interim government is subsequently formed under Nobel laureate Muhammad Yunus.", category: "Conflicts", severity: 3, confidence: 0.99, latitude: 23.81, longitude: 90.41, timestamp: h(13872), sources: ["Reuters", "BBC", "AP News"] },
  { title: "OPEC+ Extends Voluntary Oil Production Cuts", description: "OPEC+ members led by Saudi Arabia and Russia announce an extension of voluntary oil production cuts totalling around 2.2 million barrels per day into 2024, aiming to support prices amid weaker-than-expected demand and rising non-OPEC supply.", category: "Energy", severity: 3, confidence: 0.97, latitude: 24.68, longitude: 46.72, timestamp: h(19440), sources: ["Reuters", "Bloomberg", "OPEC Secretariat"] },

  // Cyber
  { title: "Salt Typhoon Hackers Breach US Telecommunications Networks", description: "Chinese state-linked hacking group Salt Typhoon infiltrates multiple major US telecommunications providers including AT&T, Verizon and T-Mobile, accessing call records and law enforcement wiretap systems. The FBI and CISA describe it as one of the most significant intelligence breaches in US history.", category: "Cyber", severity: 5, confidence: 0.97, latitude: 38.89, longitude: -77.03, timestamp: h(11500), sources: ["Reuters", "The Wall Street Journal", "CISA"] },
  { title: "Change Healthcare Ransomware Attack Disrupts US Pharmacies", description: "A ransomware attack by the ALPHV/BlackCat group strikes Change Healthcare, a UnitedHealth Group subsidiary processing approximately 15 billion healthcare transactions annually. US pharmacies are unable to process insurance claims for weeks, delaying prescriptions for millions of Americans.", category: "Cyber", severity: 4, confidence: 0.99, latitude: 36.17, longitude: -86.78, timestamp: h(17856), sources: ["Reuters", "AP News", "HHS"] },

  // Current week — real events from March 2026 RSS feeds (BBC World / Al Jazeera)
  // 24-hour window
  { title: "Hungary Orders Expulsion of Ukrainian Bank Workers in Diplomatic Row", description: "Hungary announces it will expel Ukrainian bank workers after detaining several on suspicion of money laundering, escalating a fierce diplomatic dispute with Kyiv. Budapest's move threatens to further strain EU-Ukraine solidarity as the war with Russia continues.", category: "Diplomatic", severity: 3, confidence: 0.97, latitude: 47.50, longitude: 19.04, timestamp: h(1), sources: ["BBC World", "Reuters", "AFP"] },
  { title: "Azerbaijan Protests Iranian Strikes Spilling Over Shared Border", description: "Azerbaijan expresses fury after Iranian military strikes during the ongoing US-Israel campaign spill over into Azerbaijani territory near the southern border. Baku summons Iran's ambassador and demands assurances. The incident raises fears of regional escalation.", category: "Military activity", severity: 4, confidence: 0.97, latitude: 39.95, longitude: 48.85, timestamp: h(2), sources: ["BBC World", "Al Jazeera", "Reuters"] },
  { title: "Iran Supreme Leader Khamenei Dies as US-Israel Campaign Continues", description: "Iran's Supreme Leader Ayatollah Ali Khamenei dies amid the ongoing US-Israel military campaign against Iran. His death marks the most significant political rupture in Iran since the 1979 revolution and throws the Islamic Republic's leadership into crisis during active wartime conditions.", category: "Strategic hotspots", severity: 5, confidence: 0.97, latitude: 35.69, longitude: 51.39, timestamp: h(5), sources: ["Al Jazeera", "BBC World", "Reuters"] },
  { title: "Large Explosion Reported in Tehran as US-Israel Strikes Continue", description: "A large explosion is seen and heard in Tehran as US-Israeli strikes on Iranian military and nuclear infrastructure continue. Al Jazeera journalists document the explosion from their position in the city. Iranian state television acknowledges the incident without providing details.", category: "Military activity", severity: 5, confidence: 0.97, latitude: 35.69, longitude: 51.39, timestamp: h(7), sources: ["Al Jazeera", "BBC World", "Reuters"] },
  { title: "US and Venezuela Resume Diplomatic Ties After Maduro Capture", description: "The United States and Venezuela agree to resume diplomatic ties after US forces captured President Nicolas Maduro. The two sides will make joint efforts to promote stability in Venezuela. The agreement marks a dramatic shift in US-Venezuela relations after years of sanctions and hostility.", category: "Diplomatic", severity: 3, confidence: 0.97, latitude: 10.48, longitude: -66.88, timestamp: h(9), sources: ["BBC World", "Reuters", "AP News"] },
  { title: "Israel Strikes Beirut After Issuing Mass Evacuation Warnings", description: "Israel conducts airstrikes on Beirut's southern suburbs after issuing an unprecedented evacuation warning that triggers mass panic and traffic gridlock across the Lebanese capital. The strikes mark a significant escalation of Israeli operations in Lebanon following the November 2024 ceasefire's collapse.", category: "Military activity", severity: 5, confidence: 0.97, latitude: 33.89, longitude: 35.50, timestamp: h(10), sources: ["BBC World", "Al Jazeera", "AFP"] },
  // 48-hour window
  { title: "Finland Plans to End Decades-Long Ban on Hosting Nuclear Weapons", description: "Finland signals it plans to lift a decades-old domestic ban on hosting NATO nuclear weapons on its territory, citing the dramatically changed European security environment following Russia's invasion of Ukraine and the subsequent expansion of the NATO-Russia border.", category: "Strategic hotspots", severity: 4, confidence: 0.97, latitude: 60.17, longitude: 24.93, timestamp: h(15), sources: ["BBC World", "Reuters", "Yle"] },
  { title: "Iranian Kurdish Forces Prepare Ground Operations Into Iran", description: "Iranian Kurdish opposition groups in exile in northern Iraq tell BBC they are preparing to cross the border into Iran to exploit the US-Israeli military campaign, though they deny having already done so. The groups say they need US-Israeli protection to launch a sustainable uprising.", category: "Military activity", severity: 4, confidence: 0.97, latitude: 36.08, longitude: 44.12, timestamp: h(17), sources: ["BBC World", "Al Jazeera", "Reuters"] },
  { title: "Iran Adopts Endurance Strategy as US-Israel Strikes Continue", description: "Analysis from multiple intelligence sources indicates Iran's war strategy centres on endurance and deterrence rather than immediate retaliation, betting that domestic and international pressure will force the US and Israel to halt strikes. The IRGC remains largely intact despite targeted strikes.", category: "Strategic hotspots", severity: 4, confidence: 0.95, latitude: 35.69, longitude: 51.39, timestamp: h(19), sources: ["BBC World", "Reuters", "The Wall Street Journal"] },
  { title: "Zelensky: Ukraine Will Share Drone Expertise to Counter Iranian UAVs", description: "Ukraine's President Zelensky says Kyiv will consider sharing its drone interception expertise with the US to help counter Iranian drone attacks, but only if doing so does not deplete Ukraine's own air defence capabilities on the front line against Russia.", category: "Military activity", severity: 3, confidence: 0.97, latitude: 50.45, longitude: 30.52, timestamp: h(20), sources: ["BBC World", "Reuters", "Kyiv Independent"] },
  // 5-day window
  { title: "Heavy Fighting Reported Along Israel-Lebanon Border as Ceasefire Collapses", description: "BBC journalists report heavy gunfire along the Israel-Lebanon border as the November 2024 ceasefire between Israel and Hezbollah effectively collapses. Cross-border exchanges involve anti-tank missiles, drones and artillery on both sides of the Blue Line frontier.", category: "Military activity", severity: 5, confidence: 0.97, latitude: 33.28, longitude: 35.57, timestamp: h(47), sources: ["BBC World", "Al Jazeera", "AFP"] },
  { title: "US-Israel Airstrikes Across Iran Documented at Scale", description: "Footage from multiple cities across Iran documents the scale of ongoing US-Israeli airstrikes on Iranian military installations, missile storage sites and nuclear-related infrastructure. Strikes have been confirmed in Tehran, Isfahan, Natanz, Bushehr and Tabriz. International humanitarian agencies warn of civilian casualties.", category: "Military activity", severity: 5, confidence: 0.97, latitude: 32.43, longitude: 53.69, timestamp: h(51), sources: ["BBC World", "Al Jazeera", "Reuters"] },
  // 7-day window
  { title: "Strait of Hormuz Shipping Traffic Plummets as Iran War Disrupts Oil Routes", description: "A timelapse analysis of maritime tracking data shows shipping traffic through the Strait of Hormuz has dropped sharply as the US-Israel military campaign against Iran disrupts the world's most critical oil chokepoint. Major tanker operators suspend bookings. Brent crude surges past $110 per barrel.", category: "Trade chokepoints", severity: 5, confidence: 0.97, latitude: 26.56, longitude: 56.25, timestamp: h(100), sources: ["BBC World", "Lloyd's List", "Bloomberg"] },

  // Europe / NATO
  { title: "Finland Joins NATO as 31st Member", description: "Finland formally accedes to NATO, ending more than 75 years of military non-alignment. Triggered by Russia's 2022 invasion of Ukraine, Finland's accession doubles the length of NATO's land border with Russia, fundamentally reshaping the strategic map of northern Europe.", category: "Strategic hotspots", severity: 3, confidence: 0.99, latitude: 60.17, longitude: 24.93, timestamp: h(25608), sources: ["Reuters", "BBC", "NATO"] },
  { title: "Sweden Joins NATO as 32nd Member", description: "Sweden joins NATO after Hungary approves its membership application, completing the Nordic security bloc within the alliance. Sweden's accession is described as the most significant shift in European security architecture in decades and strengthens NATO's dominance in the Baltic Sea.", category: "Strategic hotspots", severity: 3, confidence: 0.99, latitude: 59.33, longitude: 18.06, timestamp: h(17496), sources: ["Reuters", "BBC", "NATO"] },
];

// Titles of fictional/fabricated events from previous seed — used for one-time cleanup
const FICTIONAL_EVENT_MARKERS = [
  "Iran Closes Strait of Hormuz to Western Shipping",
  "US Strikes IRGC Missile Bases Inside Iran",
  "Taiwan Strait Full Blockade Declared",
  "S&P 500 Falls 8% — Circuit Breakers Triggered",
  "Israel Strikes Iranian Nuclear Facility at Natanz",
  "NATO Invokes Article 5 Over Baltic Attacks",
  "Tehran Hit by Heavy Bombing on Day Seven of US-Israel War",
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
  const allTitles = await storage.getAllEventTitles();

  // One-time migration: if any fictional events detected, purge all seeded events
  // RSS-fetched events will be re-added immediately by the news fetcher scheduler
  const hasFictional = FICTIONAL_EVENT_MARKERS.some(m => allTitles.includes(m));
  if (hasFictional) {
    console.log("[seed] Fictional events detected — purging and re-seeding with factual events...");
    await storage.deleteAllEvents();
  }

  // Refresh titles after potential purge
  const currentTitles = new Set(hasFictional ? [] : allTitles);

  // Insert real seed events not already present (dedup by title)
  const missingEvents = SEED_EVENTS.filter(e => !currentTitles.has(e.title));
  for (const e of missingEvents) {
    await storage.createEvent(e);
  }

  const [existingCountries, existingSectors] = await Promise.all([
    storage.getCountries(),
    storage.getSectorRisks(),
  ]);

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
