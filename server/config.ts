const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = "llama-3.3-70b-versatile";
const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

if (!GROQ_API_KEY) {
  console.warn("[config] WARNING: GROQ_API_KEY is not set. AI features will not work.");
}

export { GROQ_API_KEY, GROQ_MODEL, GROQ_BASE_URL };
