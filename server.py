import os
import json
from datetime import datetime
from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import JSONResponse, FileResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import psycopg2
import psycopg2.extras
from openai import OpenAI

DATABASE_URL = os.environ.get("DATABASE_URL")
OPENAI_API_KEY = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY")
OPENAI_BASE_URL = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
NODE_ENV = os.environ.get("NODE_ENV", "development")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be set.")

openai_client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(HTTPException)
async def http_exception_handler(request, exc):
    return JSONResponse(status_code=exc.status_code, content={"message": exc.detail})


def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=psycopg2.extras.RealDictCursor)


def row_to_event(row):
    ts = row["timestamp"]
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "category": row["category"],
        "severity": row["severity"],
        "confidence": float(row["confidence"]),
        "latitude": float(row["latitude"]),
        "longitude": float(row["longitude"]),
        "timestamp": ts.isoformat() + "Z" if isinstance(ts, datetime) else str(ts),
        "sources": row["sources"] if isinstance(row["sources"], list) else json.loads(row["sources"]),
    }


def row_to_country(row):
    drivers = row["primary_drivers"]
    return {
        "id": row["id"],
        "code": row["code"],
        "name": row["name"],
        "instabilityScore": row["instability_score"],
        "momentumChange": row["momentum_change"],
        "primaryDrivers": drivers if isinstance(drivers, list) else json.loads(drivers),
        "confidenceLevel": row["confidence_level"],
    }


def row_to_sector(row):
    return {
        "id": row["id"],
        "sector": row["sector"],
        "region": row["region"],
        "riskScore": row["risk_score"],
    }


@app.get("/api/events")
def list_events(timeWindow: Optional[str] = Query(None)):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if timeWindow:
                hours_map = {"24h": 24, "48h": 48, "5d": 120, "7d": 168}
                hours = hours_map.get(timeWindow, 24)
                cur.execute(
                    "SELECT * FROM events WHERE timestamp >= NOW() - %s * INTERVAL '1 hour' ORDER BY timestamp DESC",
                    (hours,),
                )
            else:
                cur.execute("SELECT * FROM events ORDER BY timestamp DESC")
            rows = cur.fetchall()
    finally:
        conn.close()
    return [row_to_event(r) for r in rows]


@app.get("/api/events/{event_id}")
def get_event(event_id: int):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM events WHERE id = %s", (event_id,))
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    return row_to_event(row)


@app.get("/api/countries")
def list_countries():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM countries ORDER BY instability_score DESC")
            rows = cur.fetchall()
    finally:
        conn.close()
    return [row_to_country(r) for r in rows]


@app.get("/api/sectors")
def list_sectors():
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM sector_risks")
            rows = cur.fetchall()
    finally:
        conn.close()
    return [row_to_sector(r) for r in rows]


class AnalyzeRequest(BaseModel):
    event_id: int
    portfolio_context: Optional[str] = None


@app.post("/api/ai/analyze")
def analyze_event(body: AnalyzeRequest):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT * FROM events WHERE id = %s", (body.event_id,))
            row = cur.fetchone()
    finally:
        conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="Event not found")
    event = row_to_event(row)

    try:
        response = openai_client.chat.completions.create(
            model="gpt-5.1",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert geopolitical and strategic risk analyst.\n"
                        "Generate a JSON response analyzing the following event.\n"
                        "Your response MUST exactly match this JSON schema:\n"
                        "{\n"
                        '  "historical_analogues": [{"title": "string", "year": 2000, "similarity_score": 0.0, "rationale": "string"}],\n'
                        '  "causal_chain": [{"order": 1, "claim": "string", "probability": "string", "time_horizon": "string", "evidence_signals": ["string"]}],\n'
                        '  "live_indicators": [{"indicator_name": "string", "status": "string", "threshold": "string", "note": "string"}],\n'
                        '  "portfolio_impact": [{"asset_or_business": "string", "impact_type": "string", "magnitude": "string", "pathway": "string"}],\n'
                        '  "action_framework": {\n'
                        '    "no_regrets": [{"action": "string", "tag": "opportunity", "owner_role": "string", "deadline": "string"}],\n'
                        '    "study_now": [{"action": "string", "tag": "opportunity", "owner_role": "string", "deadline": "string"}],\n'
                        '    "monitor": [{"action": "string", "tag": "opportunity", "owner_role": "string", "deadline": "string", "trigger": "string"}]\n'
                        "  },\n"
                        '  "preemptive_playbook": [{"pre_event_action": "string", "cost_complexity": "string", "counterfactual_outcome": "string"}]\n'
                        "}"
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Event: {event['title']}\n"
                        f"Description: {event['description']}\n"
                        f"Category: {event['category']}\n"
                        f"Portfolio Context: {body.portfolio_context or 'General'}"
                    ),
                },
            ],
        )
        return json.loads(response.choices[0].message.content or "{}")
    except Exception as e:
        print(f"OpenAI error: {e}")
        raise HTTPException(status_code=500, detail="Internal Error")


class InsightsRequest(BaseModel):
    timeWindow: Optional[str] = None


@app.post("/api/insights/generate")
def generate_insights(body: InsightsRequest):
    conn = get_conn()
    try:
        with conn.cursor() as cur:
            if body.timeWindow:
                hours_map = {"24h": 24, "48h": 48, "5d": 120, "7d": 168}
                hours = hours_map.get(body.timeWindow, 24)
                cur.execute(
                    "SELECT * FROM events WHERE timestamp >= NOW() - %s * INTERVAL '1 hour' ORDER BY timestamp DESC",
                    (hours,),
                )
            else:
                cur.execute("SELECT * FROM events ORDER BY timestamp DESC")
            rows = cur.fetchall()
    finally:
        conn.close()

    events_list = [row_to_event(r) for r in rows]
    events_summary = "\n".join(
        f"{e['title']}: {e['description']}" for e in events_list
    )

    try:
        response = openai_client.chat.completions.create(
            model="gpt-5.1",
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "You are an expert strategic risk analyst.\n"
                        "Summarize the key insights from the provided recent events.\n"
                        "Return strictly a JSON object matching:\n"
                        "{\n"
                        '  "key_developments": ["string"],\n'
                        '  "emerging_risks": ["string"],\n'
                        '  "stabilizing_signals": ["string"],\n'
                        '  "regional_shifts": ["string"],\n'
                        '  "trend_indicators": [{"indicator": "string", "trend": "up"}]\n'
                        "}"
                    ),
                },
                {
                    "role": "user",
                    "content": f"Recent Events:\n{events_summary or 'No major events in this window.'}",
                },
            ],
        )
        return json.loads(response.choices[0].message.content or "{}")
    except Exception as e:
        print(f"OpenAI error: {e}")
        raise HTTPException(status_code=500, detail="Internal Error")


STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "dist", "public")
ASSETS_DIR = os.path.join(STATIC_DIR, "assets")

if NODE_ENV == "production" and os.path.exists(ASSETS_DIR):
    app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    if NODE_ENV != "production":
        raise HTTPException(status_code=404, detail="Not found")
    file_path = os.path.join(STATIC_DIR, full_path)
    if full_path and os.path.isfile(file_path):
        return FileResponse(file_path)
    index = os.path.join(STATIC_DIR, "index.html")
    if os.path.isfile(index):
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="Not found")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PYTHON_PORT", os.environ.get("PORT", 5000)))
    is_dev = NODE_ENV != "production"
    uvicorn.run("server:app", host="0.0.0.0", port=port, reload=is_dev)
