# Reactive Implications — Replit Agent Guide

## Overview

Reactive Implications is a professional global risk intelligence dashboard web application. It functions as a map-first command center for geopolitical monitoring, strategic risk oversight, and decision support — similar in concept to worldmonitor.app or Palantir-style platforms.

The application displays global events on an interactive map, categorized by severity, filtered by event type and time window, and enriched with AI-generated analysis. It is designed for strategic analysts who need real-time situational awareness across conflicts, military activity, cyber threats, economic disruptions, infrastructure failures, and trade chokepoints.

**Key pages:**
- **Global Situation** (`/`) — Full-screen MapLibre GL map with event markers, clustering, filters, and AI event analysis
- **Intelligence Brief** (`/insights`) — AI-generated strategic briefing synthesis for a selected time window
- **Country Instability** (`/countries`) — Ranked table of nation-state instability scores with momentum indicators
- **Sector Heatmap** (`/sectors`) — Cross-matrix risk scores by industry vertical and geopolitical region
- **Strategic Oversight** (`/oversight`) — Card grid of high-severity events requiring immediate attention

---

## User Preferences

Preferred communication style: Simple, everyday language.

---

## System Architecture

### Frontend Architecture

- **React + Vite + TypeScript** — Single-page application with fast HMR in development
- **Routing** — `wouter` for lightweight client-side routing (no React Router)
- **State & Data Fetching** — `@tanstack/react-query` with a custom `queryClient` configured for no background refetching (`staleTime: Infinity`, `refetchOnWindowFocus: false`)
- **Map** — `React Leaflet v4` with CartoDB Dark Matter tiles (dark_all). Map is full-screen on the Global Situation page with event CircleMarkers.
- **UI Components** — `shadcn/ui` (New York style) built on Radix UI primitives, using Tailwind CSS for styling
- **Animations** — `framer-motion` for panel transitions and event detail overlays
- **Charts** — `recharts` for sector risk heatmaps and trend visualizations
- **Theme** — Custom dark "command center" aesthetic. CSS variables defined in `client/src/index.css`. Primary color: Cyber Cyan (`hsl(189, 94%, 43%)`). Brand accent for nav: `#005C4D`. Fonts: Oxanium (display), Plus Jakarta Sans (body), JetBrains Mono (mono)
- **Responsive Layout** — Mobile (<768px): bottom tab nav bar, map + feed panel stacked vertically with a toggle button; Tablet/Desktop (768px+): left sidebar rail (hidden md:flex), full side-by-side map and feed panel
- **Path aliases:**
  - `@/*` → `client/src/*`
  - `@shared/*` → `shared/*`
  - `@assets/*` → `attached_assets/*`

### Backend Architecture

- **Node.js + Express 5** — REST API server, also serves the Vite-built static client in production
- **Development** — Vite dev server runs as Express middleware via `server/vite.ts`, enabling HMR
- **Production** — Client built to `dist/public/`, served as static files by Express
- **Build** — Custom `script/build.ts` using esbuild for server bundling and Vite for client bundling. Server deps in an allowlist are bundled together to reduce cold-start overhead.
- **API routes** — Registered in `server/routes.ts`. Route paths and Zod response schemas are defined in `shared/routes.ts`, shared between client and server for type-safe fetching.
- **Logging** — Simple request logger in `server/index.ts` that logs method, path, status, and duration for all `/api` calls.

### Shared Schema Layer

- `shared/schema.ts` — Drizzle table definitions + Zod insert schemas for `events`, `countries`, `sectorRisks`, `conversations`, `messages`
- `shared/routes.ts` — Centralized API route registry with input/output Zod schemas. Client hooks import route paths and schemas from here, not from hardcoded strings.
- `shared/models/chat.ts` — Drizzle table definitions for conversation/message persistence

### Data Storage

- **PostgreSQL** via `drizzle-orm/node-postgres` with a `pg.Pool`
- **Drizzle ORM** — Schema-first, type-safe query builder. Migrations in `./migrations/`, schema in `shared/schema.ts`
- **`DatabaseStorage` class** (`server/storage.ts`) — Implements `IStorage` interface for events, countries, and sector risks. Time-window filtering is done with a `gte` clause on `events.timestamp`.
- **Seed data** — `SEED_EVENTS` array in `server/routes.ts` contains 29 confirmed real-world geopolitical events from 2023–2025 (Hamas Oct 7 attack, Gaza ceasefire, Houthi Red Sea attacks, Ukraine Kursk incursion, NK ICBM tests, China-Taiwan drills, Sudan civil war, Niger coup, DRC M23, Salt Typhoon hack, Change Healthcare ransomware, Finland/Sweden NATO accessions, etc.). All events use trusted sources only (Reuters, BBC, AP News, etc.).
- **One-time fictional event migration** — On startup, `seedDatabase()` checks for fictional marker titles (e.g. "Iran Closes Strait of Hormuz"). If found, calls `deleteAllEvents()` then re-seeds with factual events. This auto-runs on both dev and production to purge old fabricated seed data.
- **Time window filter** — Default is "ALL" (no filter) showing all historical events. Options: ALL, 24h, 48h, 5d, 7d. Backend `getEvents(timeWindow?)` adds `WHERE timestamp >= now() - interval` only when a window is specified.
- **Confidence filter** — `gte(events.confidence, 0.85)` applied in all `getEvents()` queries. All seed events have confidence ≥ 0.97.
- **DATABASE_URL** env var required. Will throw on startup if missing.

### News Fetcher (`server/news-fetcher.ts`)

- **4 RSS sources**: Al Jazeera (`all.xml`), BBC World, BBC Middle East, France 24 Middle East
- **Runs on startup + every 30 min** via `startNewsFetchScheduler()` in `server/routes.ts`
- **GPT batch size**: 20 headlines per call (model: `gpt-5.1`, `max_completion_tokens: 4000`)
- **Gulf priority sort**: Gulf/Saudi/Arabian Peninsula keywords bubble to top of queue before batch limit is applied so they are never pushed out
- **Dedup logic**: Word-overlap filter (3+ words > 4 chars) against existing event titles to avoid duplicates
- **Geocoding prompt rules**: (1) Specific named country → exact coordinates; (2) "Gulf states" collectively → Saudi Arabia (24.69, 46.72); (3) Houthis/Yemen → 15.37, 44.19; (4) Hormuz/Red Sea → exact chokepoint coordinates
- **`max_completion_tokens`** must be used (not `max_tokens`) for `gpt-5.1` — using `max_tokens` silently returns HTTP 400

### AI Integration

- **OpenAI SDK** — Used for two primary features:
  1. **Event Analysis** (`POST /api/ai/analyze`) — Deep analysis of a selected event: historical analogues, causal chain, live indicators, portfolio impact
  2. **Insights Generation** (`POST /api/ai/insights`) — Generates a structured strategic intelligence brief for a given time window
- **API key** from env var `AI_INTEGRATIONS_OPENAI_API_KEY`; base URL from `AI_INTEGRATIONS_OPENAI_BASE_URL` (supports Replit AI Integration routing)
- **Replit integration modules** in `server/replit_integrations/` — Pre-built routes and utilities for chat, audio (voice chat with SSE streaming, PCM16 playback, speech-to-text), image generation, and batch processing. These are optional add-ons not yet wired into main routes.

### Authentication

- No user authentication is currently implemented. All API endpoints are open.
- `connect-pg-simple` and `express-session` are in dependencies, suggesting session-based auth may be added later.

---

## External Dependencies

### Required Environment Variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string (required at startup) |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | OpenAI API key for AI analysis and insights |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | OpenAI base URL (Replit AI proxy routing) |

### Map Tiles

- **CartoDB Dark Matter** — Free tile service, no API key needed. Used directly in MapLibre GL JS style URL.

### Key NPM Dependencies

| Package | Role |
|---|---|
| `maplibre-gl` / `react-map-gl` | Interactive world map |
| `drizzle-orm` + `pg` | PostgreSQL ORM |
| `drizzle-zod` | Auto-generate Zod schemas from Drizzle tables |
| `openai` | AI analysis and insights generation |
| `@tanstack/react-query` | Server state management on frontend |
| `framer-motion` | Animations and panel transitions |
| `recharts` | Data visualization (heatmaps, charts) |
| `date-fns` | Date formatting for event timestamps |
| `wouter` | Lightweight client-side routing |
| `zod` | Schema validation (shared client/server) |
| `shadcn/ui` + Radix UI | Accessible UI component primitives |
| `tailwindcss` | Utility-first CSS |
| `express` v5 | HTTP server |
| `connect-pg-simple` | Postgres session store (not yet active) |
| `p-limit` / `p-retry` | Batch processing with rate limiting in AI integration utilities |

### Replit-Specific

- `@replit/vite-plugin-runtime-error-modal` — Shows runtime errors as overlay in dev
- `@replit/vite-plugin-cartographer` — Replit file mapping (dev only)
- `@replit/vite-plugin-dev-banner` — Dev environment banner (dev only)