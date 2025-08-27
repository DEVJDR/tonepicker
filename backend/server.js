// backend/server.js
const express = require("express");
const cors = require("cors");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(
  cors({
    origin: "https://tonepicker.vercel.app",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "1mb" }));

const CACHE_TTL_MS = Number(process.env.CACHE_TTL_MS || 60_000);
const cache = new Map();
function cacheGet(k) {
  const item = cache.get(k);
  if (!item) return null;
  if (Date.now() > item.exp) { cache.delete(k); return null; }
  return item.val;
}
function cacheSet(k, v) { cache.set(k, { val: v, exp: Date.now() + CACHE_TTL_MS }); }

function buildPrompt({ text, axes, tone }) {
  if (axes && typeof axes.formal === "number" && typeof axes.friendly === "number") {
    const formality = axes.formal < 0.33 ? "casual" : axes.formal > 0.66 ? "very formal" : "neutral-professional";
    const warmth = axes.friendly < 0.33 ? "direct and concise" : axes.friendly > 0.66 ? "warm and friendly" : "balanced";
    return `Rewrite the user text with the following tone:
- Formality: ${formality}
- Warmth: ${warmth}

Rules:
- Preserve meaning and key details.
- Keep similar length.
- Return ONLY the rewritten text.

User text:
${text}`;
  }
  // fallback to single tone string
  if (tone) {
    return `Rewrite the user text in a ${tone} tone. Return only the rewritten text.\n\nUser text:\n${text}`;
  }
  // should not reach here
  return `Rewrite the text preserving meaning:\n\n${text}`;
}

app.post("/api/tone", async (req, res) => {
  try {
    const { text, axes, tone } = req.body ?? {};
    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ ok: false, error: "Missing or empty `text`" });
    }

    const key = JSON.stringify({ text, axes, tone });
    const cached = cacheGet(key);
    if (cached) return res.json({ ok: true, text: cached, cached: true });

    if (!process.env.MISTRAL_API_KEY) return res.status(500).json({ ok: false, error: "MISTRAL_API_KEY not configured on server" });

    const prompt = buildPrompt({ text, axes, tone });

    const payload = {
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: "You are a precise tone rewriter for short to medium messages. Return only the rewritten text." },
        { role: "user", content: prompt },
      ],
      temperature: 0.4,
    };

    const response = await axios.post("https://api.mistral.ai/v1/chat/completions", payload, {
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      timeout: 60_000,
    });

    const out = response.data?.choices?.[0]?.message?.content ?? "";
    if (!out) throw new Error("Empty response from model");

    cacheSet(key, out);
    res.json({ ok: true, text: out, cached: false });
  } catch (err) {
    console.error("Error /api/tone:", err?.response?.data || err?.message || err);
    res.status(500).json({ ok: false, error: err?.message ?? "Internal server error" });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));
const PORT = Number(process.env.PORT || 5000);
app.listen(PORT, () => console.log(`✅ Server listening on http://localhost:${PORT}`));
