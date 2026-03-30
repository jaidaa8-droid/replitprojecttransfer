# Reactive Implications

A professional global risk intelligence dashboard that ingests live geopolitical news via RSS feeds, classifies events using AI, and displays them on an interactive world map.

---

## Features

- Live news ingestion from Al Jazeera, BBC, Sky News, The Guardian, and DW
- AI-powered event classification and geopolitical analysis (via Groq)
- Interactive world map with event markers
- Sovereign wealth fund strategic briefings per event
- PostgreSQL database with automatic deduplication
- Auto-refreshes every 15 minutes

---

## Prerequisites

Make sure you have the following installed on your machine:

- [Node.js](https://nodejs.org/) v20 or later
- [npm](https://www.npmjs.com/) v10 or later
- [PostgreSQL](https://www.postgresql.org/) v14 or later (running locally)

---

## Local Setup

### 1. Download the code

Download the project from Replit using the three-dot menu → **Download as zip**, then unzip it. Or clone it if you have Git access:

```bash
git clone <your-repo-url>
cd <project-folder>
```

### 2. Install dependencies

```bash
npm install
```

### 3. Create a `.env` file

Create a file named `.env` in the root of the project with the following values:

```env
# PostgreSQL connection string
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/your_database_name

# Groq API key — get one free at https://console.groq.com
GROQ_API_KEY=your_groq_api_key_here
```

Replace the values with your actual PostgreSQL credentials and Groq API key.

> **Note:** The app will run without `GROQ_API_KEY` but AI features (news classification and strategic analysis) will not work until the key is provided.

### 4. Set up the database

Make sure your PostgreSQL server is running and the database exists, then push the schema:

```bash
npm run db:push
```

This creates all the necessary tables automatically.

### 5. Start the app

```bash
npm run dev
```

The app will be available at [http://localhost:5000](http://localhost:5000).

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `GROQ_API_KEY` | For AI features | API key from [console.groq.com](https://console.groq.com) |

---

## AI Configuration

The AI model and API settings are centralised in `server/config.ts`. To switch models or update the API key location, edit that file:

```ts
const GROQ_MODEL = "llama-3.3-70b-versatile"; // change model here
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
```

---

## Available Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start the development server |
| `npm run build` | Build for production |
| `npm run start` | Run the production build |
| `npm run db:push` | Push schema changes to the database |
| `npm run check` | Run TypeScript type checking |

---

## Project Structure

```
├── client/          # React frontend
├── server/          # Express backend
│   ├── config.ts    # AI model and API configuration
│   ├── news-fetcher.ts  # RSS ingestion and AI classification
│   ├── routes.ts    # API routes and AI analysis endpoints
│   ├── storage.ts   # Database access layer
│   └── index.ts     # Server entry point
├── shared/          # Shared types and schema (Drizzle ORM)
└── script/          # Build scripts
```

---

## Getting a Groq API Key

1. Go to [console.groq.com](https://console.groq.com)
2. Sign up for a free account
3. Navigate to **API Keys** and create a new key
4. Copy the key into your `.env` file as `GROQ_API_KEY`

Groq offers a generous free tier that is more than sufficient for running this app.
