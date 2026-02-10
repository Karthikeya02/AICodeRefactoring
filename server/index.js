import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3001;
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-1.5-flash";

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const buildPrompt = (code, language) => {
  return [
    "You are an expert refactoring assistant.",
    "Refactor the code for clarity, maintainability, and efficiency.",
    "Preserve behavior and do not introduce new dependencies.",
    "Return JSON with keys: refactoredCode (string) and explanation (array of short strings).",
    `Language: ${language || "unspecified"}.`,
    "Code:",
    code
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
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
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
            maxOutputTokens: 2048
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(500).json({ error: errorText || "Gemini request failed." });
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
    return res.status(500).json({ error: error.message || "Unexpected error." });
  }
});

app.listen(port, () => {
  console.log(`RefactorBot API listening on http://localhost:${port}`);
});
