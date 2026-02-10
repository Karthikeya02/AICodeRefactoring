import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3001;
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash";
const normalizeModelName = (modelName) => {
  if (!modelName) return "gemini-2.5-flash";
  return modelName.replace(/^models\//, "");
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/api/models", async (req, res) => {
  if (!geminiApiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${geminiApiKey}`
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: errorText || "List models failed." });
    }

    const data = await response.json();
    return res.json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message || "Unexpected error." });
  }
});

const buildPrompt = (code, language) => {
  return [
    "You are an expert refactoring assistant.",
    "Refactor the code for clarity, maintainability, and efficiency.",
    "Preserve behavior and do not introduce new dependencies.",
    "Return ONLY valid JSON with keys: refactoredCode (string) and explanation (array of short strings).",
    "Do not include markdown fences or extra text.",
    `Language: ${language || "unspecified"}.`,
    "Code:",
    "```",
    code,
    "```"
  ].join("\n");
};

const extractJson = (text) => {
  if (!text) return null;
  const trimmed = text.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
};

app.post("/api/refactor", async (req, res) => {
  const { code = "", language = "" } = req.body || {};
  if (!code.trim()) {
    return res.status(400).json({ error: "Code is required." });
  }
  if (!geminiApiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is not configured." });
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${normalizeModelName(geminiModel)}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: buildPrompt(code, language) }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 2048,
            responseMimeType: "application/json"
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini error", response.status, errorText);
      return res.status(500).json({
        error: "Gemini request failed.",
        status: response.status,
        details: errorText
      });
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    const parsed = extractJson(text);

    if (!parsed?.refactoredCode) {
      return res.status(500).json({
        error: "Gemini response was not in the expected JSON format.",
        raw: text
      });
    }

    return res.json({
      refactoredCode: parsed.refactoredCode,
      explanation: Array.isArray(parsed.explanation) ? parsed.explanation : []
    });
  } catch (error) {
    console.error("Gemini request exception", error);
    return res.status(500).json({ error: error.message || "Unexpected error." });
  }
});

app.listen(port, () => {
  console.log(`RefactorBot API listening on http://localhost:${port}`);
});
