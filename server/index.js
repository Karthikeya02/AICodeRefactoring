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

const buildPrompt = (code, language, options) => {
  const goals = [];
  if (options?.detectSmells) goals.push("Detect and address common code smells");
  if (options?.applySolid) goals.push("Apply SOLID principles where appropriate");
  if (options?.includeMetrics) {
    goals.push("Include a brief software metrics summary");
    goals.push("Software Metrics: smells detected, Cyclomatic Complexity");
  }

  const goalsLine = goals.length > 0 ? `Refactoring goals: ${goals.join("; ")}.` : "";
  return [
    "You are an expert refactoring assistant.",
    "Refactor the code for clarity, maintainability, and efficiency.",
    "Preserve behavior and do not introduce new dependencies.",
    "Keep the code in the same programming language. Do not translate it.",
    "Return ONLY valid JSON with keys: refactoredCode (string) and explanation (array of short strings).",
    "Keep explanation concise: 3-5 bullet items, max 12 words each.",
    "Do not include markdown fences or extra text.",
    goalsLine,
    `Language: ${language || "unspecified"}.`,
    "Code:",
    "```",
    code,
    "```"
  ].join("\n");
};

const buildPromptText = (code, language, options) => {
  const goals = [];
  if (options?.detectSmells) goals.push("Detect and address common code smells");
  if (options?.applySolid) goals.push("Apply SOLID principles where appropriate");
  if (options?.includeMetrics) {
    goals.push("Include a brief software metrics summary");
    goals.push("Software Metrics: smells detected, Cyclomatic Complexity");
  }

  const goalsLine = goals.length > 0 ? `Refactoring goals: ${goals.join("; ")}.` : "";
  return [
    "You are an expert refactoring assistant.",
    "Refactor the code for clarity, maintainability, and efficiency.",
    "Preserve behavior and do not introduce new dependencies.",
    "Keep the code in the same programming language. Do not translate it.",
    "Return output in this exact plain-text format:",
    "REFRACTORED_CODE:",
    "<code>",
    "EXPLANATION:",
    "- 3 to 5 concise bullets, max 12 words each",
    "Do not include markdown fences or extra text.",
    goalsLine,
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
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const slice = trimmed.slice(start, end + 1);
      try {
        return JSON.parse(slice);
      } catch {
        // fall through
      }
    }
    const match = trimmed.match(/```json\s*([\s\S]*?)```/i);
    if (!match) return null;
    try {
      return JSON.parse(match[1]);
    } catch {
      return null;
    }
  }
};

const extractFieldsFallback = (text) => {
  const refMatch = text.match(/"refactoredCode"\s*:\s*"([\s\S]*?)"\s*(,|})/i);
  const refPartialMatch = text.match(/"refactoredCode"\s*:\s*"([\s\S]*)$/i);
  const refValue = refMatch?.[1] ?? refPartialMatch?.[1];
  if (!refValue) return null;
  const refactoredCode = refValue.replace(/\\n/g, "\n").replace(/\\"/g, '"');
  const explanationMatch = text.match(/"explanation"\s*:\s*\[([\s\S]*?)\]/i);
  const explanation = explanationMatch
    ? explanationMatch[1]
        .split(/\s*,\s*/)
        .map((item) => item.replace(/^"|"$/g, "").replace(/\\n/g, "\n"))
        .filter(Boolean)
    : [];
  return { refactoredCode, explanation };
};

app.post("/api/refactor", async (req, res) => {
  const { code = "", language = "", options = {} } = req.body || {};
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
              parts: [{ text: buildPrompt(code, language, options) }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
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
    const parsed = extractJson(text) || extractFieldsFallback(text);

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

app.post("/api/refactor/stream", async (req, res) => {
  const { code = "", language = "", options = {} } = req.body || {};
  if (!code.trim()) {
    return res.status(400).send("Code is required.");
  }
  if (!geminiApiKey) {
    return res.status(500).send("GEMINI_API_KEY is not configured.");
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
              parts: [{ text: buildPromptText(code, language, options) }]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 4096,
            responseMimeType: "text/plain"
          }
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error("Gemini error", response.status, errorText);
      return res.status(500).send(errorText || "Gemini request failed.");
    }

    const data = await response.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || "";
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.send(text);
  } catch (error) {
    console.error("Gemini request exception", error);
    return res.status(500).send(error.message || "Unexpected error.");
  }
});

app.listen(port, () => {
  console.log(`RefactorBot API listening on http://localhost:${port}`);
});
