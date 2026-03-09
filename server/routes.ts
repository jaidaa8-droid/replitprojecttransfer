import type { Express } from "express";
import type { Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";
import { fetchAndIngestNews, startNewsFetchScheduler } from "./news-fetcher";
import { events, countries, sectorRisks, aiTrends } from "@shared/schema";
import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

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
  // 5-day window (events ~4–5 days ago, h(96)–h(119))
  { title: "Strait of Hormuz Shipping Traffic Plummets as Iran War Disrupts Oil Routes", description: "A timelapse analysis of maritime tracking data shows shipping traffic through the Strait of Hormuz has dropped sharply as the US-Israel military campaign against Iran disrupts the world's most critical oil chokepoint. Major tanker operators suspend bookings. Brent crude surges past $110 per barrel.", category: "Trade chokepoints", severity: 5, confidence: 0.97, latitude: 26.56, longitude: 56.25, timestamp: h(100), sources: ["BBC World", "Lloyd's List", "Bloomberg"] },
  { title: "Iran Fires Ballistic Missiles at Haifa and Tel Aviv in Opening Retaliation", description: "Iran's IRGC launches a salvo of ballistic missiles targeting Haifa and Tel Aviv in the first Iranian retaliatory strike after the US-Israel campaign began. Israel's Arrow-3 and Iron Dome systems intercept the majority; limited impact reported in Haifa's port district.", category: "Military activity", severity: 5, confidence: 0.97, latitude: 32.08, longitude: 34.78, timestamp: h(108), sources: ["Al Jazeera", "BBC World", "Reuters"] },
  { title: "Operation Epic Fury: US-Israel Launch Opening Strikes on Iran Nuclear Sites", description: "US B-2 stealth bombers and Israeli F-35s conduct coordinated strikes on Iran's nuclear enrichment facilities at Natanz, Fordow and Isfahan in the opening night of what Pentagon officials call Operation Epic Fury. The strikes mark the beginning of an open military campaign against Iran's nuclear programme.", category: "Military activity", severity: 5, confidence: 0.97, latitude: 32.43, longitude: 53.69, timestamp: h(116), sources: ["BBC World", "Al Jazeera", "Reuters"] },
  // 7-day window (events ~5–7 days ago, h(120)–h(167))
  { title: "USS Gerald R. Ford Carrier Strike Group Ordered to Persian Gulf as Iran Standoff Escalates", description: "The US Navy orders the USS Gerald R. Ford carrier strike group to the Persian Gulf as the diplomatic standoff with Iran over its nuclear programme reaches a critical point. The deployment signals Washington's readiness to use military force if negotiations collapse.", category: "Military activity", severity: 4, confidence: 0.97, latitude: 26.5, longitude: 56.0, timestamp: h(130), sources: ["Reuters", "BBC World", "US CENTCOM"] },
  { title: "US Congress Briefed on Imminent Military Action Against Iran's Nuclear Programme", description: "Senior US administration officials brief Congressional leaders in a closed session on plans for military action against Iran's nuclear infrastructure. Lawmakers are informed that diplomatic options have been exhausted and that operational planning with Israel is complete.", category: "Political", severity: 4, confidence: 0.97, latitude: 38.89, longitude: -77.03, timestamp: h(148), sources: ["Reuters", "The Wall Street Journal", "BBC World"] },
  { title: "Iran Vows 'Crushing Response' to Any US-Israeli Military Attack", description: "Iran's Supreme Leader Ali Khamenei warns that any US or Israeli military attack on Iranian soil will be met with a 'crushing and devastating response' targeting the full range of US assets in the Middle East. The statement comes amid a final breakdown in indirect diplomatic contacts.", category: "Strategic hotspots", severity: 5, confidence: 0.97, latitude: 35.69, longitude: 51.39, timestamp: h(158), sources: ["Al Jazeera", "Reuters", "AFP"] },
  { title: "UN Security Council Emergency Session Fails to Prevent US-Iran Military Confrontation", description: "An emergency session of the UN Security Council called by Russia and China to prevent military action against Iran ends without agreement, as the US and UK veto a draft resolution demanding a halt to strike preparations. Diplomatic observers warn a military confrontation is now imminent.", category: "Diplomatic", severity: 4, confidence: 0.97, latitude: 40.75, longitude: -73.98, timestamp: h(165), sources: ["Reuters", "BBC World", "UN News"] },

  // Europe / NATO
  { title: "Finland Joins NATO as 31st Member", description: "Finland formally accedes to NATO, ending more than 75 years of military non-alignment. Triggered by Russia's 2022 invasion of Ukraine, Finland's accession doubles the length of NATO's land border with Russia, fundamentally reshaping the strategic map of northern Europe.", category: "Strategic hotspots", severity: 3, confidence: 0.99, latitude: 60.17, longitude: 24.93, timestamp: h(25608), sources: ["Reuters", "BBC", "NATO"] },
  { title: "Sweden Joins NATO as 32nd Member", description: "Sweden joins NATO after Hungary approves its membership application, completing the Nordic security bloc within the alliance. Sweden's accession is described as the most significant shift in European security architecture in decades and strengthens NATO's dominance in the Baltic Sea.", category: "Strategic hotspots", severity: 3, confidence: 0.99, latitude: 59.33, longitude: 18.06, timestamp: h(17496), sources: ["Reuters", "BBC", "NATO"] },
];

// Titles of fictional/fabricated events from previous seed — used for one-time cleanup
const FICTIONAL_EVENT_MARKERS = [
  // v1 fictional seed markers
  "Iran Closes Strait of Hormuz to Western Shipping",
  "US Strikes IRGC Missile Bases Inside Iran",
  "Taiwan Strait Full Blockade Declared",
  "S&P 500 Falls 8% — Circuit Breakers Triggered",
  "Israel Strikes Iranian Nuclear Facility at Natanz",
  "NATO Invokes Article 5 Over Baltic Attacks",
  "Tehran Hit by Heavy Bombing on Day Seven of US-Israel War",
  // v2 old stub/low-quality seed markers (present in production)
  "Energy Price Spike",
  "Iran Uranium Enrichment Milestone",
  "Myanmar Civil War Escalation",
  "Trump Halts All Ukraine Military Aid",
  "Russia Seizes Kharkiv in Overnight Advance",
  // v3 unverified Saudi/Gulf events removed per editorial policy
  "Saudi Arabia Convenes Emergency GCC Summit Over Iran War",
  "Saudi Aramco Raises Security Readiness at Gulf Facilities Amid Iran War",
  "Saudi Arabia Distances Itself From US-Israel Campaign, Calls for Ceasefire",
  "OPEC+ Calls Emergency Session as Iran War Disrupts Gulf Oil Markets",
  "Saudi Arabia and UAE Deploy Naval Patrols to Secure Arabian Gulf Shipping Lanes",
  "Saudi Arabia Summons US Ambassador Over Iran Strikes, Warns of Gulf Spillover",
  "GCC Leaders Issue Emergency Declaration as Iran Conflict Spreads to Gulf",
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
  { code: "ARE", name: "UAE", instabilityScore: 64, momentumChange: "+9", primaryDrivers: ["Iran war disrupts Dubai air and maritime hub", "Strait of Hormuz oil shipping under direct threat", "Regional escalation forces diplomatic repositioning"], confidenceLevel: "High" },
  { code: "QAT", name: "Qatar", instabilityScore: 61, momentumChange: "+7", primaryDrivers: ["US Al-Udeid Air Base at centre of Iran war operations", "Iran war threatens LNG export shipping routes", "Hamas-Israel mediation under severe strain"], confidenceLevel: "High" },
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

async function applyDevSnapshot() {
  const snapshotPath = path.join(process.cwd(), "server", "migrations", "dev-snapshot.json");
  if (!fs.existsSync(snapshotPath)) return;

  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, "utf8"));
  const snapshotEvents: any[] = snapshot.events || [];
  const snapshotCountries: any[] = snapshot.countries || [];
  const snapshotVersion: string = snapshot.exportedAt || "";

  // Ensure the settings table exists to track which snapshot version has been applied
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS app_settings (
      key varchar(255) PRIMARY KEY,
      value text NOT NULL
    )
  `);

  const versionResult = await db.execute(sql`
    SELECT value FROM app_settings WHERE key = 'snapshot_version'
  `) as any;
  const storedVersion: string = versionResult?.rows?.[0]?.value ?? versionResult?.[0]?.value ?? "";

  if (storedVersion === snapshotVersion) {
    console.log(`[snapshot] Already at version ${snapshotVersion} — no sync needed`);
    return;
  }

  console.log(`[snapshot] Snapshot version changed (${storedVersion || "none"} → ${snapshotVersion}) — applying ${snapshotEvents.length} events...`);

  // Clear existing data and repopulate from snapshot
  await db.execute(sql`DELETE FROM events`);
  await db.execute(sql`DELETE FROM countries`);

  // Insert events in batches of 50
  for (let i = 0; i < snapshotEvents.length; i += 50) {
    const batch = snapshotEvents.slice(i, i + 50);
    for (const e of batch) {
      const urls = e.source_urls || e.sourceUrls || (e.source_url ? [e.source_url] : null);
      await db.execute(sql`
        INSERT INTO events (title, description, category, severity, confidence, latitude, longitude, timestamp, sources, source_urls)
        VALUES (${e.title}, ${e.description}, ${e.category}, ${e.severity}, ${e.confidence},
                ${e.latitude}, ${e.longitude}, ${new Date(e.timestamp).toISOString()}, ${JSON.stringify(e.sources)},
                ${urls ? JSON.stringify(urls) : null})
      `);
    }
  }

  // Insert countries from snapshot
  for (const c of snapshotCountries) {
    await db.execute(sql`
      INSERT INTO countries (code, name, instability_score, momentum_change, primary_drivers, confidence_level)
      VALUES (${c.code}, ${c.name}, ${c.instability_score}, ${c.momentum_change}, ${JSON.stringify(c.primary_drivers)}, ${c.confidence_level})
    `);
  }

  // Store the applied snapshot version so future restarts skip re-sync
  await db.execute(sql`
    INSERT INTO app_settings (key, value) VALUES ('snapshot_version', ${snapshotVersion})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
  `);

  console.log(`[snapshot] Applied ${snapshotEvents.length} events and ${snapshotCountries.length} countries from dev snapshot`);
}

async function seedDatabase() {
  // Re-geocode any events mistakenly placed at Saudi Arabia/Riyadh coords → UAE/Dubai
  await db.execute(
    sql`UPDATE events SET latitude = 25.20, longitude = 55.27 WHERE latitude BETWEEN 24.6 AND 24.8 AND longitude BETWEEN 46.6 AND 46.9`
  );

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
  console.log(`[seed] inserting ${missingEvents.length} missing events (${SEED_EVENTS.length} total seeds, ${currentTitles.size} already in DB)`);
  for (const e of missingEvents) {
    try {
      await storage.createEvent(e);
    } catch (err) {
      console.error(`[seed] failed to insert "${e.title}":`, err);
    }
  }

  const [existingCountries, existingSectors] = await Promise.all([
    storage.getCountries(),
    storage.getSectorRisks(),
  ]);

  // Rebuild countries from seed: delete all existing, then re-insert current seeds
  for (const existing of existingCountries) {
    await storage.deleteCountry(existing.code);
  }
  for (const c of SEED_COUNTRIES) {
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
  
  // Apply dev snapshot first (syncs production DB with dev data), then seed
  applyDevSnapshot()
    .then(() => seedDatabase())
    .catch(console.error);

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

  app.get("/api/ai-trends", async (req, res) => {
    try {
      const { region, category, sector } = req.query as Record<string, string>;
      const trends = await storage.getAiTrends({ region, category, sector });
      res.json(trends);
    } catch {
      res.status(500).json({ message: "Internal Error" });
    }
  });

  seedAiTrends().catch(console.error);
  startNewsFetchScheduler();

  return httpServer;
}

const AI_TREND_SEEDS = [
  // ── INVESTMENT / FUNDING ──────────────────────────────────────────────────
  {
    category: "Investment", title: "Microsoft commits $13 billion cumulative investment in OpenAI",
    description: "Microsoft has confirmed cumulative investment of approximately $13 billion in OpenAI across multiple tranches since 2019, cementing a long-term commercial and research partnership that includes exclusive Azure cloud hosting rights and a proportional profit-sharing structure.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 13.0, investmentType: "Funding Round",
    entities: ["Microsoft", "OpenAI"], sourceName: "Microsoft Investor Relations", sourceType: "Investor Relations",
    sourceUrl: "https://www.microsoft.com/en-us/investor", publicationDate: new Date("2023-01-23"),
    updatedAt: new Date("2024-04-01"), significance: 5, tags: ["LLM", "Cloud", "Partnership"],
    strategicImplication: "Cements US hyperscaler dominance in frontier AI; sovereign wealth funds should weight Azure and MSFT enterprise exposure as a direct AI infrastructure proxy.",
  },
  {
    category: "Investment", title: "Amazon invests $4 billion in Anthropic",
    description: "Amazon committed up to $4 billion to Anthropic, securing rights to use Anthropic models in AWS products and establishing AWS as Anthropic's primary cloud provider. The deal gives Amazon a meaningful equity stake in one of the two leading frontier AI safety labs.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 4.0, investmentType: "Funding Round",
    entities: ["Amazon", "Anthropic", "AWS"], sourceName: "Amazon.com Inc. Press Release", sourceType: "Investor Relations",
    sourceUrl: "https://ir.aboutamazon.com", publicationDate: new Date("2023-09-25"),
    updatedAt: new Date("2024-03-01"), significance: 5, tags: ["LLM", "Cloud", "Safety"],
    strategicImplication: "AWS–Anthropic axis positions Amazon as the enterprise-safe AI cloud; indicative of hyperscaler race to lock in frontier model access ahead of anticipated demand surge.",
  },
  {
    category: "Investment", title: "Google commits $2 billion investment in Anthropic",
    description: "Google deepened its stake in Anthropic with a $2 billion commitment following Amazon's lead investment, underscoring competitive pressure to secure access to frontier AI capabilities outside of Google's own DeepMind division.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 2.0, investmentType: "Funding Round",
    entities: ["Google", "Alphabet", "Anthropic"], sourceName: "Anthropic Press Release", sourceType: "Investor Relations",
    sourceUrl: "https://www.anthropic.com", publicationDate: new Date("2024-02-03"),
    updatedAt: new Date("2024-04-01"), significance: 4, tags: ["LLM", "Cloud", "Competition"],
    strategicImplication: "Dual hyperscaler backing of Anthropic is unprecedented; creates alignment risk and may draw regulatory scrutiny on concentrated AI investment by Big Tech.",
  },
  {
    category: "Investment", title: "xAI raises $6 billion Series B",
    description: "Elon Musk's xAI closed a $6 billion Series B round from a syndicate of institutional investors including Valor Equity Partners and Andreessen Horowitz, valuing the company at $24 billion. Proceeds fund Grok model development and the Memphis Colossus supercluster.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 6.0, investmentType: "Funding Round",
    entities: ["xAI", "Elon Musk", "Andreessen Horowitz"], sourceName: "xAI Official Press Release", sourceType: "Investor Relations",
    sourceUrl: "https://x.ai", publicationDate: new Date("2024-05-26"),
    updatedAt: new Date("2024-06-01"), significance: 4, tags: ["LLM", "Compute", "Grok"],
    strategicImplication: "Third major US frontier AI lab now well-capitalised; competition for GPU supply and talent intensifies, supporting semiconductor sector overweight thesis.",
  },
  {
    category: "Partnership", title: "Microsoft invests $1.5 billion in UAE's G42",
    description: "Microsoft announced a $1.5 billion strategic investment in G42, Abu Dhabi's state-linked AI conglomerate, gaining an equity stake while committing to bring advanced AI and cloud services to the UAE. The deal was brokered with US government awareness and included governance commitments on technology access.",
    region: "Middle East", sector: "Artificial Intelligence", amountUsd: 1.5, investmentType: "Partnership",
    entities: ["Microsoft", "G42", "UAE", "Abu Dhabi"], sourceName: "Microsoft Official Blog", sourceType: "Investor Relations",
    sourceUrl: "https://blogs.microsoft.com", publicationDate: new Date("2024-05-01"),
    updatedAt: new Date("2024-05-15"), significance: 5, tags: ["Sovereign AI", "Gulf", "Geopolitics"],
    strategicImplication: "US–Gulf AI technology corridor emerging; SWF executives should monitor G42 as a bellwether for state-aligned AI investment in the Middle East and its regulatory/export-control dimensions.",
  },
  {
    category: "Investment", title: "Scale AI raises $1 billion Series F at $13.8 billion valuation",
    description: "Scale AI closed a $1 billion Series F led by Accel and including Amazon and Meta, valuing the data-labelling and AI infrastructure company at $13.8 billion. Scale provides critical training data pipelines for US Department of Defense and major frontier AI labs.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 1.0, investmentType: "Funding Round",
    entities: ["Scale AI", "Accel", "Amazon", "Meta"], sourceName: "Scale AI Press Release", sourceType: "Investor Relations",
    sourceUrl: "https://scale.com", publicationDate: new Date("2024-05-21"),
    updatedAt: new Date("2024-06-01"), significance: 4, tags: ["Data", "Defense", "Infrastructure"],
    strategicImplication: "Data annotation and AI evaluation infrastructure increasingly strategic; dual-use civilian-defence angle warrants attention from sovereign defence-technology allocators.",
  },
  {
    category: "Investment", title: "Mistral AI raises $1.1 billion Series B",
    description: "Paris-based Mistral AI raised €1.04 billion (~$1.1B) in a Series B round valuing the company at €5.8 billion, with investors including General Catalyst and BNP Paribas. Mistral is the leading European frontier model company and a central asset in EU AI sovereignty strategy.",
    region: "Europe", sector: "Artificial Intelligence", amountUsd: 1.1, investmentType: "Funding Round",
    entities: ["Mistral AI", "General Catalyst", "BNP Paribas"], sourceName: "Mistral AI Press Release", sourceType: "Investor Relations",
    sourceUrl: "https://mistral.ai", publicationDate: new Date("2024-06-11"),
    updatedAt: new Date("2024-07-01"), significance: 4, tags: ["Open Source", "Europe", "Sovereignty"],
    strategicImplication: "Mistral is Europe's best-capitalised native frontier AI asset; relevant to EU sovereign tech mandates and any allocator seeking non-US AI model exposure.",
  },
  {
    category: "Investment", title: "Autonomous vehicle AI firm Wayve raises $1.05 billion",
    description: "UK-based Wayve closed a $1.05 billion Series C co-led by SoftBank, NVIDIA, and Microsoft, becoming one of the best-funded European autonomous vehicle AI companies. Wayve's embodied AI approach is distinct from sensor-heavy competitors.",
    region: "Europe", sector: "Transportation", amountUsd: 1.05, investmentType: "Funding Round",
    entities: ["Wayve", "SoftBank", "NVIDIA", "Microsoft"], sourceName: "Wayve Press Release / SoftBank IR", sourceType: "Investor Relations",
    sourceUrl: "https://wayve.ai", publicationDate: new Date("2024-05-07"),
    updatedAt: new Date("2024-06-01"), significance: 3, tags: ["Autonomous Vehicles", "Embodied AI", "UK"],
    strategicImplication: "Deep-learning-centric AV approach gaining institutional validation; NVIDIA's involvement underlines GPU-centric value chain dominance across mobility AI.",
  },
  {
    category: "Investment", title: "France commits €2.5 billion national AI investment plan",
    description: "French President Macron announced a €2.5 billion national AI plan focused on sovereign compute capacity, AI in public services, and support for AI startups. The plan includes direct subsidies for GPU cluster infrastructure and R&D partnerships with French universities.",
    region: "Europe", sector: "Artificial Intelligence", amountUsd: 2.7, investmentType: "Government",
    entities: ["France", "Élysée", "Bpifrance"], sourceName: "Élysée Palace Official Statement", sourceType: "Government",
    sourceUrl: "https://www.elysee.fr", publicationDate: new Date("2024-02-23"),
    updatedAt: new Date("2024-04-01"), significance: 4, tags: ["Sovereign AI", "EU", "Compute"],
    strategicImplication: "European state AI capital deployment accelerating; follow-on allocation opportunities in French AI infrastructure and public-sector AI services providers.",
  },
  {
    category: "Investment", title: "Singapore launches S$1 billion National AI Strategy 2.0 compute investment",
    description: "Singapore's Smart Nation initiative under IMDA committed over S$1 billion (~$750M USD) to AI compute infrastructure, model development, and talent as part of its National AI Strategy 2.0, positioning Singapore as the premier AI hub in Southeast Asia.",
    region: "Asia Pacific", sector: "Artificial Intelligence", amountUsd: 0.75, investmentType: "Government",
    entities: ["Singapore", "IMDA", "Smart Nation"], sourceName: "Singapore IMDA / Smart Nation", sourceType: "Government",
    sourceUrl: "https://www.imda.gov.sg", publicationDate: new Date("2023-12-04"),
    updatedAt: new Date("2024-03-01"), significance: 4, tags: ["Sovereign AI", "Southeast Asia", "Compute"],
    strategicImplication: "Singapore's compute infrastructure position creates opportunity for SWF co-investment in AI-adjacent data centre and technology real estate in the region.",
  },
  {
    category: "Investment", title: "India approves ₹10,372 crore India AI Mission for sovereign compute",
    description: "The Indian Cabinet approved the India AI Mission with a ₹10,372 crore (~$1.25B USD) outlay to build 10,000+ GPU public compute capacity, develop AI datasets, and create an AI startup ecosystem. Execution is led by MeitY and the newly created IndiaAI mission.",
    region: "Asia Pacific", sector: "Artificial Intelligence", amountUsd: 1.25, investmentType: "Government",
    entities: ["India", "MeitY", "IndiaAI"], sourceName: "Ministry of Electronics & Information Technology (MeitY)", sourceType: "Government",
    sourceUrl: "https://www.meity.gov.in", publicationDate: new Date("2024-03-07"),
    updatedAt: new Date("2024-04-01"), significance: 5, tags: ["Sovereign AI", "South Asia", "Compute"],
    strategicImplication: "India's sovereign AI compute ambition positions it as a strategic partner for GPU supply chains and AI model development at national scale; relevant for SWF India tech allocations.",
  },
  {
    category: "Investment", title: "Saudi Arabia launches HUMAIN AI company with $100 billion commitment",
    description: "Saudi Arabia's Crown Prince launched HUMAIN, a state AI company under PIF, with an initial $1 billion capital and ambitions to deploy up to $100 billion in AI infrastructure, model development, and data centre investment as part of Vision 2030's digital economy agenda.",
    region: "Middle East", sector: "Artificial Intelligence", amountUsd: 100.0, investmentType: "Government",
    entities: ["Saudi Arabia", "PIF", "HUMAIN", "SDAIA"], sourceName: "Saudi Press Agency", sourceType: "Government",
    sourceUrl: "https://www.spa.gov.sa", publicationDate: new Date("2024-10-01"),
    updatedAt: new Date("2025-01-01"), significance: 5, tags: ["Sovereign AI", "Gulf", "PIF", "Vision 2030"],
    strategicImplication: "Saudi Arabia's HUMAIN creates a direct SWF-owned AI vehicle; co-investment and partnership opportunities for institutional peers, particularly in GPU procurement and data centre real estate.",
  },
  // ── M&A ──────────────────────────────────────────────────────────────────
  {
    category: "M&A", title: "Google acquires non-exclusive Character.AI licence in $2.7 billion deal",
    description: "Google secured a non-exclusive licence to Character.AI's technology and hired Character.AI's founders Noam Shazeer and Daniel De Freitas for approximately $2.7 billion, in what regulators and commentators called a 'soft acquisition' designed to circumvent merger review thresholds.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 2.7, investmentType: "M&A",
    entities: ["Google", "Alphabet", "Character.AI"], sourceName: "Bloomberg / Character.AI statement", sourceType: "News Wire",
    sourceUrl: "https://www.bloomberg.com", publicationDate: new Date("2024-08-02"),
    updatedAt: new Date("2024-09-01"), significance: 4, tags: ["M&A", "Talent", "Regulatory Arbitrage"],
    strategicImplication: "Talent-acquisition structures sidestepping merger review are an emerging pattern; expect regulatory scrutiny to tighten on AI acqui-hire transactions globally.",
  },
  {
    category: "M&A", title: "Amazon hires Adept AI core team in $500 million asset acquisition",
    description: "Amazon hired the founding team and key staff of AI research lab Adept AI and acquired a non-exclusive licence to Adept's models and technology for approximately $500 million, following a similar pattern to Microsoft's Inflection AI acqui-hire.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 0.5, investmentType: "M&A",
    entities: ["Amazon", "Adept AI", "AWS"], sourceName: "Adept AI Press Release / Bloomberg", sourceType: "News Wire",
    sourceUrl: "https://www.adept.ai", publicationDate: new Date("2024-06-27"),
    updatedAt: new Date("2024-07-01"), significance: 3, tags: ["M&A", "Talent", "Cloud"],
    strategicImplication: "AI talent concentration in hyperscalers deepening; independent AI lab valuations increasingly tied to strategic acqui-hire optionality.",
  },
  // ── IPO ──────────────────────────────────────────────────────────────────
  {
    category: "IPO", title: "CoreWeave files for IPO targeting $19 billion valuation",
    description: "CoreWeave, the GPU cloud provider backed by NVIDIA and Magnetar, filed an S-1 with the SEC targeting a valuation of approximately $19 billion. The company provides specialised NVIDIA GPU clusters for AI training and inference workloads to enterprise clients.",
    region: "North America", sector: "Infrastructure", amountUsd: 19.0, investmentType: "IPO",
    entities: ["CoreWeave", "NVIDIA", "SEC"], sourceName: "SEC S-1 Filing — CoreWeave", sourceType: "Regulatory",
    sourceUrl: "https://www.sec.gov", publicationDate: new Date("2024-11-01"),
    updatedAt: new Date("2025-03-01"), significance: 4, tags: ["IPO", "GPU Cloud", "Infrastructure"],
    strategicImplication: "CoreWeave IPO is a bellwether for AI infrastructure equity markets; public-market pricing of GPU compute capacity will set benchmarks for private data centre valuations.",
  },
  // ── POLICY ───────────────────────────────────────────────────────────────
  {
    category: "Policy", title: "EU AI Act adopted — world's first comprehensive AI regulatory framework",
    description: "The European Parliament passed the EU AI Act with 523 votes in favour, establishing a risk-based regulatory framework for AI systems across the EU. It bans certain AI applications outright, imposes strict obligations on high-risk AI, and requires transparency for general-purpose AI models above compute thresholds.",
    region: "Europe", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["European Union", "European Parliament"], sourceName: "European Parliament Official Record", sourceType: "Regulatory",
    sourceUrl: "https://www.europarl.europa.eu", publicationDate: new Date("2024-03-13"),
    updatedAt: new Date("2024-08-01"), significance: 5, tags: ["Regulation", "AI Act", "Compliance"],
    strategicImplication: "EU AI Act compliance obligations reshape the AI product and deployment landscape globally; portfolio companies with EU operations require AI governance investment.",
  },
  {
    category: "Policy", title: "US Executive Order 14110: Safe, Secure, and Trustworthy AI",
    description: "President Biden signed Executive Order 14110 directing federal agencies to establish AI safety standards, requiring frontier model developers to share safety test results with the government before public deployment, and initiating a national AI talent pipeline strategy.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["US Government", "White House", "NIST"], sourceName: "White House — Federal Register", sourceType: "Government",
    sourceUrl: "https://www.whitehouse.gov/briefing-room/presidential-actions", publicationDate: new Date("2023-10-30"),
    updatedAt: new Date("2024-01-01"), significance: 5, tags: ["Regulation", "Safety", "US Policy"],
    strategicImplication: "Pre-deployment safety reporting requirement creates compliance infrastructure market; also signals US intent to maintain AI leadership through regulatory standard-setting.",
  },
  {
    category: "Policy", title: "China's CAC implements Interim Measures for Generative AI Services",
    description: "China's Cyberspace Administration (CAC) brought into force the Interim Measures for the Management of Generative AI Services, requiring providers to register with regulators, conduct security assessments, and ensure outputs align with 'socialist core values'. The framework applies to all generative AI services available to users in China.",
    region: "Asia Pacific", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["China", "CAC", "Cyberspace Administration of China"], sourceName: "Cyberspace Administration of China (CAC)", sourceType: "Regulatory",
    sourceUrl: "https://www.cac.gov.cn", publicationDate: new Date("2023-08-15"),
    updatedAt: new Date("2024-01-01"), significance: 5, tags: ["Regulation", "China", "Generative AI"],
    strategicImplication: "China's generative AI regulation creates a distinct domestic AI product market; foreign AI providers face material barriers, favouring domestic champions such as Baidu Ernie and Alibaba Qwen.",
  },
  {
    category: "Policy", title: "UK establishes world's first AI Safety Institute",
    description: "The UK Department for Science, Innovation and Technology (DSIT) launched the AI Safety Institute (AISI) at Bletchley Park, tasked with evaluating frontier AI models for safety risks. AISI is the first government body dedicated to advanced AI system evaluation and became an international standard-setter.",
    region: "Europe", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["UK Government", "DSIT", "AI Safety Institute"], sourceName: "UK DSIT Official Announcement", sourceType: "Government",
    sourceUrl: "https://www.gov.uk/dsit", publicationDate: new Date("2023-11-01"),
    updatedAt: new Date("2024-06-01"), significance: 4, tags: ["AI Safety", "UK", "Governance"],
    strategicImplication: "AISI model evaluation framework positions UK as international AI governance leader; evaluation methodology likely to influence procurement and liability standards globally.",
  },
  {
    category: "Policy", title: "UAE National AI Strategy 2031 targets top-tier global AI hub status",
    description: "The UAE's Office of AI under Minister of State for AI Omar Al Olama updated its national AI strategy targeting the UAE as a top global AI economy by 2031, with focus areas including AI-powered government services, private sector AI adoption, and international AI governance leadership.",
    region: "Middle East", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["UAE", "Office of AI", "TDRA"], sourceName: "UAE Office of AI — Official Strategy Document", sourceType: "Government",
    sourceUrl: "https://ai.gov.ae", publicationDate: new Date("2023-06-01"),
    updatedAt: new Date("2024-01-01"), significance: 4, tags: ["Sovereign AI", "UAE", "Strategy"],
    strategicImplication: "UAE AI strategy creates a regulated, investment-friendly AI environment; Abu Dhabi and Dubai are emerging co-location hubs for global AI companies seeking Gulf market access.",
  },
  {
    category: "Policy", title: "G7 Hiroshima AI Process establishes international AI governance code",
    description: "G7 leaders endorsed the Hiroshima Process International Code of Conduct for AI developers, a voluntary framework for responsible advanced AI development covering safety testing, incident reporting, and content provenance. The code was developed under Japan's G7 presidency.",
    region: "Global", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["G7", "Japan", "EU", "US", "UK"], sourceName: "G7 Hiroshima Leaders' Communiqué", sourceType: "International Organisation",
    sourceUrl: "https://www.g7hiroshima.go.jp", publicationDate: new Date("2023-11-01"),
    updatedAt: new Date("2024-01-01"), significance: 4, tags: ["Governance", "International", "Safety"],
    strategicImplication: "G7 code provides a preview of binding multilateral AI norms; companies with G7 market exposure should align governance practices proactively.",
  },
  {
    category: "Policy", title: "UN Secretary-General convenes International AI Advisory Body",
    description: "UN Secretary-General António Guterres established a 39-member International AI Advisory Body bringing together governments, civil society, and private sector to develop global AI governance recommendations, with a final report due at the UN Summit of the Future in 2024.",
    region: "Global", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["United Nations", "Secretary-General"], sourceName: "United Nations — Secretary-General's Announcement", sourceType: "International Organisation",
    sourceUrl: "https://www.un.org/en/ai-advisory-body", publicationDate: new Date("2023-10-26"),
    updatedAt: new Date("2024-09-01"), significance: 3, tags: ["Governance", "UN", "Multilateral"],
    strategicImplication: "UN-level AI governance acceleration may produce binding resolutions affecting AI deployment in emerging markets; monitor for cross-border data sovereignty implications.",
  },
  // ── INFRASTRUCTURE ───────────────────────────────────────────────────────
  {
    category: "Infrastructure", title: "Microsoft plans $80 billion AI data centre investment in FY2025",
    description: "Microsoft announced plans to invest $80 billion in AI-enabled data centre infrastructure in FY2025, with more than half the investment earmarked for the United States. The plan covers GPU cluster build-out, power infrastructure, and AI supercomputing capacity for Azure and OpenAI workloads.",
    region: "North America", sector: "Infrastructure", amountUsd: 80.0, investmentType: "Government",
    entities: ["Microsoft", "Azure", "OpenAI"], sourceName: "Microsoft Official Blog (Brad Smith)", sourceType: "Investor Relations",
    sourceUrl: "https://blogs.microsoft.com", publicationDate: new Date("2025-01-13"),
    updatedAt: new Date("2025-02-01"), significance: 5, tags: ["Data Centre", "Compute", "Power"],
    strategicImplication: "Microsoft's $80B commitment validates hyperscale AI infrastructure as a 10-year capital cycle; creates investment opportunities in power, cooling, construction, and networking.",
  },
  {
    category: "Infrastructure", title: "IEA: AI data centres to double global electricity demand by 2026",
    description: "The International Energy Agency's Electricity 2024 report projects that global data centre electricity demand will double from 2022 to 2026, driven primarily by AI workloads. US data centres alone could consume more electricity than all of France by 2026 under high-case scenarios.",
    region: "Global", sector: "Energy", amountUsd: null, investmentType: null,
    entities: ["IEA", "International Energy Agency"], sourceName: "International Energy Agency — Electricity 2024", sourceType: "International Organisation",
    sourceUrl: "https://www.iea.org/reports/electricity-2024", publicationDate: new Date("2024-01-24"),
    updatedAt: new Date("2024-04-01"), significance: 5, tags: ["Energy", "Data Centre", "Power Demand"],
    strategicImplication: "AI-driven power demand is a structural tailwind for energy infrastructure investors; renewable energy co-location, grid balancing, and nuclear power are priority themes.",
  },
  {
    category: "Infrastructure", title: "US CHIPS and Science Act awards $52.7 billion for semiconductor manufacturing",
    description: "The US Department of Commerce commenced disbursement of CHIPS Act funds with major awards to TSMC ($6.6B), Intel ($8.5B), Samsung ($6.4B), and Micron ($6.1B) for US-based semiconductor fabrication capacity. The programme aims to produce at least 20% of leading-edge chips in the US by 2030.",
    region: "North America", sector: "Semiconductors", amountUsd: 52.7, investmentType: "Government",
    entities: ["US Government", "TSMC", "Intel", "Samsung", "Micron"], sourceName: "US Department of Commerce — CHIPS Program Office", sourceType: "Government",
    sourceUrl: "https://www.chips.gov", publicationDate: new Date("2024-03-01"),
    updatedAt: new Date("2024-10-01"), significance: 5, tags: ["Semiconductors", "Supply Chain", "CHIPS Act"],
    strategicImplication: "CHIPS Act reshapes global semiconductor geography; long-horizon investment in US fab real estate, tooling supply chains, and advanced packaging is supported by policy.",
  },
  {
    category: "Infrastructure", title: "NVIDIA launches Blackwell GPU architecture — 2.5× inference throughput vs Hopper",
    description: "NVIDIA unveiled the Blackwell GPU architecture at GTC 2024, delivering up to 2.5× inference throughput and 25× energy efficiency improvement over the H100 Hopper generation. The GB200 NVL72 rack system integrates 72 Blackwell GPUs in a liquid-cooled unit targeting hyperscale AI inference deployment.",
    region: "North America", sector: "Semiconductors", amountUsd: null, investmentType: null,
    entities: ["NVIDIA", "Blackwell", "GB200"], sourceName: "NVIDIA Investor Relations — GTC 2024", sourceType: "Investor Relations",
    sourceUrl: "https://nvidianews.nvidia.com", publicationDate: new Date("2024-03-18"),
    updatedAt: new Date("2024-06-01"), significance: 4, tags: ["GPU", "Compute", "NVIDIA", "Inference"],
    strategicImplication: "Blackwell architecture sustains NVIDIA's compute moat; short-term supply constraints support premium GPU pricing; competitors AMD and Intel remain 1–2 generations behind.",
  },
  {
    category: "Infrastructure", title: "EU AI Factories programme allocates €10 billion for supercomputer infrastructure",
    description: "The European Commission and EuroHPC Joint Undertaking launched the AI Factories initiative allocating approximately €10 billion across member state AI supercomputing sites. Sites in Finland, Luxembourg, Germany, Spain, Italy, and others are designated to host AI-capable supercomputers accessible to European researchers and SMEs.",
    region: "Europe", sector: "Infrastructure", amountUsd: 10.8, investmentType: "Government",
    entities: ["European Commission", "EuroHPC", "EU"], sourceName: "European Commission — EuroHPC Joint Undertaking", sourceType: "Government",
    sourceUrl: "https://eurohpc-ju.europa.eu", publicationDate: new Date("2024-01-01"),
    updatedAt: new Date("2024-06-01"), significance: 4, tags: ["Compute", "Sovereignty", "Europe"],
    strategicImplication: "EU AI Factories underpin European AI sovereignty agenda; creates procurement opportunity for GPU suppliers and cooling/power infrastructure providers within the EU.",
  },
  // ── RESEARCH ─────────────────────────────────────────────────────────────
  {
    category: "Research", title: "Stanford AI Index 2024: global AI investment reaches $91.9 billion",
    description: "The Stanford Human-Centered AI (HAI) AI Index 2024 report documented global AI private investment of $91.9 billion in 2023, a 20% year-on-year decline from 2022 peaks but remaining above pre-2020 levels. US investment of $67.2 billion comprised 73% of global totals. China and the UK were second and third respectively.",
    region: "Global", sector: "Artificial Intelligence", amountUsd: 91.9, investmentType: null,
    entities: ["Stanford HAI"], sourceName: "Stanford HAI — AI Index Report 2024", sourceType: "Academic Research",
    sourceUrl: "https://aiindex.stanford.edu", publicationDate: new Date("2024-04-15"),
    updatedAt: new Date("2024-04-15"), significance: 5, tags: ["Global Investment", "Data", "Benchmark"],
    strategicImplication: "US retains commanding lead in AI private investment; allocators should benchmark portfolio AI exposure against country-level investment flows as a leading indicator.",
  },
  {
    category: "Research", title: "OECD: 27% of jobs face high exposure to AI automation risk",
    description: "The OECD Employment Outlook 2023 estimated that 27% of jobs in OECD economies are in occupations with high exposure to AI automation. Knowledge-intensive service roles face higher replacement risk than previously modelled; however, job transformation rather than elimination is the dominant near-term scenario.",
    region: "Global", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["OECD"], sourceName: "OECD Employment Outlook 2023", sourceType: "International Organisation",
    sourceUrl: "https://www.oecd.org/en/publications/oecd-employment-outlook-2023_08785bba-en.html", publicationDate: new Date("2023-07-11"),
    updatedAt: new Date("2024-01-01"), significance: 4, tags: ["Labour", "Automation", "Policy Risk"],
    strategicImplication: "AI-driven labour displacement creates political risk and regulatory pressure in advanced economies; portfolio companies with high-automation exposure should factor policy risk into scenario planning.",
  },
  {
    category: "Research", title: "WIPO: China files most AI patents globally — 188,000+ AI filings in 2022",
    description: "WIPO's 2023 Technology Trends report recorded over 188,000 AI-related patent filings in 2022, with China accounting for the largest national share at 38.8%, followed by the United States at 17.5%. Machine learning and computer vision dominated filing categories. AI patent growth outpaces all other technology sectors.",
    region: "Global", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["WIPO", "China", "USPTO"], sourceName: "WIPO Technology Trends: AI Report 2023", sourceType: "International Organisation",
    sourceUrl: "https://www.wipo.int/tech_trends/en/artificial_intelligence", publicationDate: new Date("2023-01-01"),
    updatedAt: new Date("2024-01-01"), significance: 3, tags: ["IP", "China", "Innovation"],
    strategicImplication: "China's IP leadership in AI is a lagging indicator of applied AI capability; relevant to long-run competitive positioning analysis across tech and manufacturing sectors.",
  },
  {
    category: "Research", title: "IMF: AI could affect 40% of jobs globally and widen inequality between nations",
    description: "IMF research published in January 2024 estimated that AI could affect 40% of jobs globally, with advanced economies (60% exposure) far more vulnerable than low-income countries (26%). The IMF warned that without proactive policy, AI could exacerbate income inequality within and between nations.",
    region: "Global", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["IMF", "International Monetary Fund"], sourceName: "IMF Staff Discussion Note: Gen AI — Jan 2024", sourceType: "International Organisation",
    sourceUrl: "https://www.imf.org/en/Publications/Staff-Discussion-Notes", publicationDate: new Date("2024-01-14"),
    updatedAt: new Date("2024-04-01"), significance: 5, tags: ["Macro", "Labour", "Inequality"],
    strategicImplication: "IMF framing positions AI as a macro-level inequality driver; sovereign wealth funds with development mandates should factor AI policy alignment into LP relations and ESG frameworks.",
  },
  {
    category: "Research", title: "DeepSeek R1: Open-source Chinese model matches frontier performance at fraction of cost",
    description: "DeepSeek released R1 in January 2025 — a 671B parameter mixture-of-experts model trained at an estimated cost of $5–6 million, compared to hundreds of millions for comparable US frontier models. R1 achieved benchmark parity with OpenAI o1 on coding, mathematics, and reasoning tasks. The release triggered a 17% single-day decline in NVIDIA's share price and prompted an emergency reassessment of compute infrastructure assumptions across institutional AI portfolios.",
    region: "Asia Pacific", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["DeepSeek", "High-Flyer Capital"], sourceName: "DeepSeek R1 Technical Report — January 2025", sourceType: "Academic Research",
    sourceUrl: "https://arxiv.org/abs/2501.12948", publicationDate: new Date("2025-01-20"),
    updatedAt: new Date("2025-01-22"), significance: 5, tags: ["Open Source", "China", "Efficiency", "Compute"],
    strategicImplication: "DeepSeek R1 invalidates the prevailing thesis that frontier AI requires massive proprietary compute spend; investors should reassess GPU-centric infrastructure positions and weight model efficiency plays as a structural hedge.",
  },
  {
    category: "Investment", title: "OpenAI closes $40 billion Series D at $300 billion valuation",
    description: "OpenAI completed a $40 billion funding round in March 2025 led by SoftBank Group, valuing the company at $300 billion — the highest private company valuation in history. The round includes $10 billion from SoftBank as the lead anchor, with participation from UAE sovereign wealth vehicle MGX, Coatue, Altimeter, and others. Proceeds are designated for compute buildout, model development, and global market expansion including the SoftBank-backed 'Stargate' AI infrastructure programme in the United States.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 40.0, investmentType: "Funding Round",
    entities: ["OpenAI", "SoftBank Group", "MGX", "Coatue", "Altimeter"], sourceName: "OpenAI Official Announcement — March 2025", sourceType: "Government / Official",
    sourceUrl: "https://openai.com/index/openai-announces-40-billion-funding-round", publicationDate: new Date("2025-03-31"),
    updatedAt: new Date("2025-03-31"), significance: 5, tags: ["LLM", "Sovereign Capital", "Hyperscale", "Stargate"],
    strategicImplication: "A $300B private valuation for OpenAI compresses the available return window for new LP entrants; SWFs gaining exposure should evaluate secondary market pricing and Stargate infrastructure co-investment as more favourable entry vectors.",
  },
  {
    category: "Infrastructure", title: "NVIDIA Blackwell GPUs generate $11 billion revenue in Q4 FY2025",
    description: "NVIDIA reported Q4 FY2025 earnings in February 2025, with data centre revenue reaching $35.6 billion — up 93% year-over-year. Blackwell GPU architecture alone generated $11 billion in its first quarter of production ramp. CEO Jensen Huang described demand as 'staggering', with hyperscaler backlog orders extending well into 2025 and 2026.",
    region: "North America", sector: "Semiconductors", amountUsd: 35.6, investmentType: null,
    entities: ["NVIDIA"], sourceName: "NVIDIA Q4 FY2025 Earnings — February 2025", sourceType: "Investor Relations",
    sourceUrl: "https://investor.nvidia.com", publicationDate: new Date("2025-02-26"),
    updatedAt: new Date("2025-02-26"), significance: 5, tags: ["Semiconductors", "GPU", "Blackwell", "Data Centre"],
    strategicImplication: "NVIDIA Blackwell ramp confirms AI infrastructure spend is accelerating not plateauing; allocators should sustain overweight positions in the semiconductor supply chain while monitoring China export controls as the primary tail risk.",
  },
  {
    category: "IPO", title: "CoreWeave raises $1.5 billion at $23 billion valuation in NASDAQ IPO",
    description: "CoreWeave, the AI-focused GPU cloud provider backed by NVIDIA and Magnetar Capital, priced its IPO on the NASDAQ at $40 per share in March 2025, raising $1.5 billion and valuing the company at approximately $23 billion. CoreWeave is one of the largest AI infrastructure IPOs in US history and a primary infrastructure provider for Microsoft, META, and OpenAI. The IPO was oversubscribed and represents a landmark test of public market appetite for dedicated AI cloud infrastructure.",
    region: "North America", sector: "Cloud Infrastructure", amountUsd: 1.5, investmentType: "IPO",
    entities: ["CoreWeave", "NVIDIA", "Magnetar Capital", "Microsoft"], sourceName: "CoreWeave S-1 / NASDAQ Listing — March 2025", sourceType: "Investor Relations",
    sourceUrl: "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=coreweave", publicationDate: new Date("2025-03-28"),
    updatedAt: new Date("2025-03-28"), significance: 4, tags: ["GPU Cloud", "IPO", "AI Infrastructure", "NASDAQ"],
    strategicImplication: "CoreWeave's public listing creates a liquid benchmark for AI infrastructure valuation; public market pricing will serve as a reference point for pre-IPO secondary transactions in comparable GPU cloud companies globally.",
  },
  {
    category: "Investment", title: "Anthropic raises $2.75 billion Series E at $18.4 billion valuation",
    description: "Anthropic closed a $2.75 billion Series E round in October 2024 led by Google, with additional investment from Spark Capital, Menlo Ventures, and existing backers. The round values Anthropic at $18.4 billion. Total capital raised by Anthropic since founding now exceeds $7.6 billion. The company has deployed Claude 3.5 Sonnet and Haiku as state-of-the-art enterprise models and announced plans to scale its Responsible Scaling Policy framework globally.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 2.75, investmentType: "Funding Round",
    entities: ["Anthropic", "Google", "Spark Capital", "Menlo Ventures"], sourceName: "Anthropic Press Release — October 2024", sourceType: "Government / Official",
    sourceUrl: "https://www.anthropic.com/news/anthropic-raises-series-e", publicationDate: new Date("2024-10-01"),
    updatedAt: new Date("2024-10-01"), significance: 4, tags: ["LLM", "Safety", "Enterprise", "Google"],
    strategicImplication: "Anthropic's $18.4B valuation reflects the market premium on safety-first frontier AI development; enterprise SWFs with regulated sector exposure (financial services, healthcare, defence) should weight Anthropic as the institutional-grade model provider.",
  },
  {
    category: "Policy", title: "UK publishes AI Opportunities Action Plan with £14 billion private investment commitments",
    description: "The UK government released its AI Opportunities Action Plan in January 2025, co-authored by Matt Clifford (Entrepreneur First). The plan outlines five priority areas: AI infrastructure, adoption in public services, skills, international positioning, and AI safety. Alongside the plan, the government announced £14 billion in private sector investment commitments including data centre expansion, model development, and AI adoption programmes. The UK AISI (AI Safety Institute) is to be expanded and renamed the AI Security Institute.",
    region: "Europe", sector: "Artificial Intelligence", amountUsd: 14.0, investmentType: null,
    entities: ["UK Government", "DSIT", "AISI", "Matt Clifford"], sourceName: "UK AI Opportunities Action Plan — January 2025", sourceType: "Government / Official",
    sourceUrl: "https://www.gov.uk/government/publications/ai-opportunities-action-plan", publicationDate: new Date("2025-01-13"),
    updatedAt: new Date("2025-01-13"), significance: 4, tags: ["UK", "Policy", "Infrastructure", "Safety"],
    strategicImplication: "The UK's £14B commitment signals Europe's most aggressive national AI industrial policy; investors should track UK data centre planning deregulation and AISI standards as early indicators of the EU regulatory trajectory.",
  },
  {
    category: "Policy", title: "EU AI Act enters full enforcement — prohibited AI systems banned from August 2024",
    description: "The European Union AI Act's first enforcement milestone took effect in August 2024, prohibiting the deployment of AI systems classified as 'unacceptable risk' — including real-time biometric surveillance in public spaces, social scoring, and subliminal manipulation systems. The full framework reaches complete enforcement in August 2026. The EU AI Office has been established as the primary supervisory authority, coordinating with national competent authorities across all 27 member states.",
    region: "Europe", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["European Commission", "EU AI Office"], sourceName: "EU AI Act Official Journal — August 2024", sourceType: "Government / Official",
    sourceUrl: "https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai", publicationDate: new Date("2024-08-01"),
    updatedAt: new Date("2024-08-01"), significance: 5, tags: ["EU", "Regulation", "Compliance", "Enforcement"],
    strategicImplication: "EU AI Act prohibited use categories create immediate compliance obligations for European and US AI deployments in the EU market; SWFs with portfolio exposure to AI systems in Europe should conduct mandatory prohibited-use gap assessments.",
  },
  {
    category: "Research", title: "Meta releases Llama 3.1 405B — largest open-source frontier model",
    description: "Meta AI released Llama 3.1 in July 2024, including the 405B parameter flagship model that matched or exceeded proprietary models from OpenAI and Anthropic on a range of benchmarks. The open-weights release under a commercial licence allows derivative use for products with fewer than 700 million monthly active users. The release catalysed a wave of enterprise fine-tuning activity and positioned open-source AI as a credible alternative to closed API models for cost-sensitive deployments.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["Meta AI", "Meta Platforms"], sourceName: "Meta AI Blog — Llama 3.1 Release, July 2024", sourceType: "Government / Official",
    sourceUrl: "https://ai.meta.com/blog/meta-llama-3-1", publicationDate: new Date("2024-07-23"),
    updatedAt: new Date("2024-07-23"), significance: 4, tags: ["Open Source", "LLM", "Enterprise", "Llama"],
    strategicImplication: "Meta's open-source frontier strategy undermines closed-API moats; allocators in proprietary LLM API businesses should model accelerating commoditisation pressure and weight infrastructure and specialised application layers over pure foundation model plays.",
  },
  // ── 2025 ──────────────────────────────────────────────────────────────────
  {
    category: "Investment", title: "xAI raises $20 billion Series E — $500 billion valuation",
    description: "xAI, Elon Musk's artificial intelligence company, completed a $20 billion Series E funding round in January 2026, valuing the company at approximately $500 billion. Lead investors include Valor Equity Partners, Fidelity, and the Qatar Investment Authority. The round will fund xAI's Colossus supercomputer expansion (targeting 1.5 million NVIDIA GPUs), development of Grok 5, and international partnerships including the HUMAIN programme in Saudi Arabia and a US Department of Defense agreement for Grok deployment on the GenAI.mil platform.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 20.0, investmentType: "Funding Round",
    entities: ["xAI", "Elon Musk", "Valor Equity Partners", "Fidelity", "Qatar Investment Authority"], sourceName: "Bloomberg — xAI Series E, January 2026", sourceType: "Investor Relations",
    sourceUrl: "https://www.bloomberg.com/news/articles/2026-01-06/elon-musk-xai-raises-6-billion-in-series-c-funding", publicationDate: new Date("2026-01-06"),
    updatedAt: new Date("2026-01-06"), significance: 4, tags: ["LLM", "Sovereign Capital", "Defence", "Grok"],
    strategicImplication: "Qatar Investment Authority's anchor role in xAI's $500B round signals Gulf SWF conviction in frontier AI; the DoD–Grok deployment creates a dual-use revenue stream with strategic moat characteristics unavailable to civilian-only competitors.",
  },
  {
    category: "Infrastructure", title: "Stargate AI: $500 billion US infrastructure programme — 7 GW planned, Abilene operational",
    description: "The Stargate joint venture (OpenAI, SoftBank, Oracle, MGX) has committed over $400 billion toward a 10-gigawatt AI infrastructure programme across five new US campuses. The flagship Abilene, Texas site became operational in mid-2025, running on Oracle Cloud Infrastructure with over 450,000 NVIDIA GB200 GPUs deployed under a 15-year lease consuming 1.2 GW of power by mid-2026. Additional sites in New Mexico, Wisconsin, Ohio, and Michigan bring total planned capacity to nearly 7 GW. The Stargate Michigan campus (Saline Township) — a $7 billion, 1 GW facility — began construction in early 2026 with 2,500+ union jobs.",
    region: "North America", sector: "Cloud Infrastructure", amountUsd: 500.0, investmentType: null,
    entities: ["OpenAI", "SoftBank", "Oracle", "MGX", "NVIDIA"], sourceName: "Stargate Announcement / Oracle IR — January–March 2026", sourceType: "Investor Relations",
    sourceUrl: "https://openai.com/index/announcing-the-stargate-project", publicationDate: new Date("2025-01-21"),
    updatedAt: new Date("2026-03-01"), significance: 5, tags: ["Compute", "Data Centre", "US", "Stargate"],
    strategicImplication: "Stargate is the largest single AI infrastructure commitment in history; allocators should track Oracle cloud revenue ramp and power utility contracts along corridor sites as direct financial proxies for programme execution.",
  },
  {
    category: "Infrastructure", title: "Big Tech AI capex reaches $650 billion in 2026 — Amazon, Google, Microsoft, Meta",
    description: "The four largest US technology companies have committed a combined $635–$665 billion in capital expenditure for 2026, representing a 67–74% year-over-year increase driven almost entirely by AI infrastructure: Amazon ($200B), Google/Alphabet ($175–185B), Microsoft ($145B), and Meta ($115–135B). Goldman Sachs projects total hyperscaler AI capex — including second-tier cloud providers — will exceed $700 billion globally in 2026. The surge reflects long-lead-time GPU orders, data centre land acquisition, power interconnection agreements, and cooling infrastructure for liquid-cooled GB200 systems drawing up to 120 kW per rack.",
    region: "North America", sector: "Cloud Infrastructure", amountUsd: 650.0, investmentType: null,
    entities: ["Amazon", "Google", "Microsoft", "Meta", "Goldman Sachs"], sourceName: "Goldman Sachs AI Capex Report & Company Q4 2025 Earnings", sourceType: "Investor Relations",
    sourceUrl: "https://www.goldmansachs.com/insights/articles/why-ai-companies-may-invest-more-than-500-billion-in-2026", publicationDate: new Date("2026-01-30"),
    updatedAt: new Date("2026-02-15"), significance: 5, tags: ["Hyperscalers", "Data Centre", "Capex", "Power"],
    strategicImplication: "A $700B hyperscaler capex cycle creates generational infrastructure tailwinds across power utilities, liquid cooling, fibre, and specialised construction; SWF capital should consider infrastructure co-investment vehicles as a lower-risk exposure to the AI buildout.",
  },
  {
    category: "Investment", title: "Anthropic closes $30 billion Series G at $380 billion valuation",
    description: "Anthropic secured $30 billion in its Series G round in February 2026, valuing the company at $380 billion. The round was led by Founders Fund and Coatue, with participation from NVIDIA and more than 30 institutional investors. Total funding raised by Anthropic now exceeds $40 billion since its 2021 founding. The capital is designated for compute infrastructure, international market expansion, and the continued development of the Claude model family — including Claude 3.7 Sonnet and the forthcoming Claude 4 series targeting enterprise and regulated-sector deployments.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 30.0, investmentType: "Funding Round",
    entities: ["Anthropic", "Founders Fund", "Coatue", "NVIDIA"], sourceName: "TechCrunch / Bloomberg — Anthropic Series G, February 2026", sourceType: "Investor Relations",
    sourceUrl: "https://techcrunch.com/2026/02/12/anthropic-raises-30-billion-series-g", publicationDate: new Date("2026-02-12"),
    updatedAt: new Date("2026-02-12"), significance: 5, tags: ["LLM", "Safety", "Enterprise", "Frontier"],
    strategicImplication: "Anthropic's $380B valuation — 3× its October 2024 mark — reflects the market's conclusion that safety-aligned frontier AI commands a regulatory premium; enterprise SWFs with regulated sector exposure should treat Anthropic as a strategic anchor holding.",
  },
  {
    category: "Investment", title: "OpenAI raises $110 billion at $730 billion valuation — largest private funding in history",
    description: "OpenAI finalised a $110 billion funding round on February 27, 2026, valuing the company at $730 billion pre-money (approximately $840 billion post-money) — the highest valuation ever achieved by a private company. The round was anchored by Amazon ($50 billion), NVIDIA ($30 billion), and SoftBank ($30 billion). Additional participants include institutional investors and sovereign vehicles. Total OpenAI capital raised now exceeds $150 billion. Proceeds will fund the Stargate compute programme, next-generation model development, and international expansion including in Asia, the Middle East, and Europe.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 110.0, investmentType: "Funding Round",
    entities: ["OpenAI", "Amazon", "NVIDIA", "SoftBank"], sourceName: "Bloomberg — OpenAI $110B Funding, February 2026", sourceType: "Investor Relations",
    sourceUrl: "https://www.bloomberg.com/news/articles/2026-02-27/openai-finalizes-110-billion-funding-at-730-billion-valuation", publicationDate: new Date("2026-02-27"),
    updatedAt: new Date("2026-02-27"), significance: 5, tags: ["LLM", "Hyperscale", "Record", "Stargate"],
    strategicImplication: "At $840B post-money, OpenAI is priced like sovereign digital infrastructure; only secondary-market entry or Stargate co-investment structures now offer SWF-appropriate risk/return profiles — direct primary LP positions are no longer available to new investors.",
  },
  {
    category: "Policy", title: "Trump Executive Order establishes federal AI framework and preempts state laws — December 2025",
    description: "President Trump signed 'Ensuring a National Policy Framework for Artificial Intelligence' on December 11, 2025, establishing a uniform federal AI governance structure designed to preempt state-level AI regulations deemed inconsistent with national policy. The order created an AI Litigation Task Force within the DOJ, directed the FTC to classify state-mandated AI bias mitigation requirements as deceptive trade practices, and conditioned $42 billion in BEAD broadband funding on repeal of designated state AI laws. By March 2026, the Secretary of Commerce must publish a review identifying burdensome state AI laws for potential federal challenge — signalling a centralised, pro-deployment regulatory posture in contrast to the EU AI Act.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["White House", "DOJ", "FTC", "Department of Commerce"], sourceName: "White House Executive Order — December 11, 2025", sourceType: "Government / Official",
    sourceUrl: "https://www.whitehouse.gov/presidential-actions/2025/12/ensuring-a-national-policy-framework-for-artificial-intelligence", publicationDate: new Date("2025-12-11"),
    updatedAt: new Date("2026-01-10"), significance: 5, tags: ["US Policy", "Preemption", "Regulation", "Federal"],
    strategicImplication: "The US federal AI preemption posture creates a regulatory divergence from EU and state-level approaches; portfolio companies operating across jurisdictions face compliance bifurcation risk — model governance architecture must now accommodate two materially different regulatory regimes.",
  },
  {
    category: "Investment", title: "February 2026 sets all-time startup funding record — $189 billion raised, 90% to AI",
    description: "February 2026 became the largest single month for global startup funding in recorded history, with $189–$195 billion raised across approximately 3,400 transactions. AI companies captured 90% of all venture capital deployed globally ($171 billion), with 83% concentrated in three mega-rounds: OpenAI ($110B), Anthropic ($30B), and Waymo ($16B). Crunchbase data shows 17 US-based AI companies raised $100 million or more in the first six weeks of 2026. US AI companies captured 92% of global venture funding in February, reflecting an extreme geographic concentration not seen since the 2000 dot-com peak.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: 189.0, investmentType: "Funding Round",
    entities: ["OpenAI", "Anthropic", "Waymo", "Crunchbase"], sourceName: "Crunchbase Venture Report — February 2026", sourceType: "Academic Research",
    sourceUrl: "https://news.crunchbase.com/venture/record-setting-global-funding-february-2026-openai-anthropic", publicationDate: new Date("2026-03-03"),
    updatedAt: new Date("2026-03-03"), significance: 5, tags: ["VC", "Record", "AI Dominance", "Concentration"],
    strategicImplication: "AI's 90% share of global venture capital in February 2026 signals a structural reallocation of institutional risk capital; SWF technology allocators must now treat all-sector and all-geography diversification assumptions as obsolete — AI-adjacent positions are the market, not a segment of it.",
  },
  {
    category: "Investment", title: "Middle East SWFs deploy $22.9 billion into AI in 2025 — Mubadala leads at $12.9 billion",
    description: "Gulf sovereign wealth funds deployed a combined $22.9 billion into AI and digital infrastructure in 2025, making the Middle East the most active non-US source of institutional AI capital globally. Mubadala (Abu Dhabi) led with $12.9 billion across positions including Anthropic, MGX (the $100 billion joint AI fund co-sponsored with BlackRock), and data centre partnerships. Kuwait Investment Authority deployed $6 billion and Qatar Investment Authority $4 billion including its anchor position in xAI's Series E. Middle Eastern SWFs now account for 43% of global sovereign-directed AI investment, with US AI technology the dominant destination ($131.8 billion of total Gulf SWF capital flowing to US assets in 2025, up 92% year-over-year).",
    region: "Middle East", sector: "Artificial Intelligence", amountUsd: 22.9, investmentType: "Funding Round",
    entities: ["Mubadala", "MGX", "Kuwait Investment Authority", "Qatar Investment Authority", "ADIA"], sourceName: "Global SWF Annual Report 2025 / IFSWF Data", sourceType: "International Organisation",
    sourceUrl: "https://globalswf.com/reports/2025-annual-report", publicationDate: new Date("2026-01-15"),
    updatedAt: new Date("2026-01-15"), significance: 5, tags: ["SWF", "Middle East", "Gulf Capital", "Infrastructure"],
    strategicImplication: "Gulf SWFs have become the marginal price-setter in frontier AI funding rounds; LP relations with Mubadala, KIA, and QIA are now a prerequisite for access to the most competitively restricted co-investment allocations in AI infrastructure and foundation models.",
  },
  {
    category: "Research", title: "xAI Grok 4 declared 'most intelligent model' — Grok 5 at 6 trillion parameters planned for Q1 2026",
    description: "xAI released Grok 4 in July 2025, with Elon Musk describing it as 'the most intelligent model in the world' at launch. Grok 4.1, released November 19, 2025, scored 1,483 Elo on LMArena in thinking mode and reduced hallucination rates by 65% relative to prior versions. Grok 5, planned for Q1 2026, is reported to use 6 trillion parameters with native video understanding. xAI's Colossus supercomputer has surpassed 200,000 NVIDIA GPUs and is targeting 1.5 million units. Grok is being deployed on the US Department of Defense's GenAI.mil platform, marking the first frontier AI model integration into active US military infrastructure.",
    region: "North America", sector: "Artificial Intelligence", amountUsd: null, investmentType: null,
    entities: ["xAI", "Elon Musk"], sourceName: "xAI Blog / DoD GenAI.mil Announcement — 2025–2026", sourceType: "Government / Official",
    sourceUrl: "https://x.ai/blog", publicationDate: new Date("2025-11-19"),
    updatedAt: new Date("2026-01-10"), significance: 4, tags: ["LLM", "Defence", "Reasoning", "Grok"],
    strategicImplication: "DoD adoption of Grok via GenAI.mil sets a precedent for frontier commercial AI in active defence infrastructure; SWFs with defence mandate allocations should treat xAI's government pipeline as a durable revenue moat that civilian competitors cannot replicate.",
  },
];

async function seedAiTrends() {
  const existing = await storage.getAiTrends();
  if (existing.length >= AI_TREND_SEEDS.length - 3) {
    console.log(`[ai-trends] Already have ${existing.length} records — skipping seed`);
    return;
  }
  await storage.deleteAllAiTrends();
  for (const t of AI_TREND_SEEDS) {
    await storage.createAiTrend(t as any);
  }
  console.log(`[ai-trends] Seeded ${AI_TREND_SEEDS.length} AI trend records`);
}
