import "dotenv/config";
import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3001;
const geminiApiKey = process.env.GEMINI_API_KEY;
const geminiModel = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";
const allowedModels = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
]);
const normalizeModelName = (modelName) => {
  if (!modelName) return "gemini-2.5-flash-lite";
  return modelName.replace(/^models\//, "");
};

const resolveModelName = (requestedModel) => {
  const envModel = normalizeModelName(geminiModel);
  const requested = normalizeModelName(requestedModel);
  if (allowedModels.has(requested)) return requested;
  if (allowedModels.has(envModel)) return envModel;
  return "gemini-2.5-flash-lite";
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

const buildPromptText = (code, options) => {
  const goals = [];
  if (options?.detectSmells) goals.push("PRIMARY OBJECTIVE: Detect and report code smells per function/method");
  if (options?.applySolid) goals.push("Apply SOLID principles where appropriate");

  const goalsLine = goals.length > 0 ? `Refactoring goals: ${goals.join("; ")}.` : "";
  return [
    "You are an expert refactoring assistant.",
    "Refactor the code for clarity, maintainability, and efficiency.",
    "Preserve behavior and do not introduce new dependencies.",
    "Keep the code in the same programming language. Do not translate it.",
    "If you cannot refactor in the same language, return the original code unchanged.",
    "Return output in this exact plain-text format:",
    "LANGUAGE:",
    "<language>",
    "REFRACTORED_CODE:",
    "<code>",
    "EXPLANATION:",
    "- Return concise bullets in three sections (in this order):",
    "- [Smell] <function_or_method_name>: <code smell> -> <refactor applied>",
    "- [Action] <specific refactor action performed>",
    "- [Benefit] <maintainability/readability benefit>",
    "- Include at least 2 [Smell] bullets when smells are found.",
    "- Include 1-3 [Action] bullets and 1-2 [Benefit] bullets.",
    "- Keep bullets concrete and non-contradictory.",
    "- Do not use weak statements like 'no direct refactoring' or 'implicitly'.",
    "- Use concrete smell names (e.g., long method, duplicated logic, poor naming, dead code, large conditional).",
    "Do not include markdown fences or extra text.",
    "Do not use triple backticks in the output.",
    goalsLine,
    "Code:",
    "```",
    code,
    "```"
  ].join("\n");
};

const parsePlainTextResponse = (text) => {
  const langMarker = "LANGUAGE:";
  const refMarker = "REFRACTORED_CODE:";
  const explMarker = "EXPLANATION:";
  const refIndex = text.indexOf(refMarker);
  if (refIndex === -1) return null;
  const langIndex = text.indexOf(langMarker);
  let language = "";
  if (langIndex !== -1 && langIndex < refIndex) {
    const langBlock = text.slice(langIndex + langMarker.length, refIndex).trim();
    language = langBlock.split("\n")[0]?.trim() || "";
  }
  const afterRef = text.slice(refIndex + refMarker.length);
  const explIndex = afterRef.indexOf(explMarker);
  if (explIndex === -1) {
    return { language, refactoredCode: afterRef.trim(), explanation: [] };
  }
  const refactoredCode = afterRef.slice(0, explIndex).trim();
  const explanationBlock = afterRef.slice(explIndex + explMarker.length);
  const explanation = explanationBlock
    .split("\n")
    .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
    .filter(Boolean);
  return { language, refactoredCode, explanation };
};

const stripCodeFences = (text) => {
  if (!text) return "";
  const fenceMatch = text.match(/```[a-zA-Z0-9_-]*\n([\s\S]*?)\n```/);
  if (fenceMatch) return fenceMatch[1].trim();
  return text.trim();
};

const sanitizeExplanation = (items) => {
  const blockedPattern = /cyclomatic|complexity|software\s*metrics?|maintainability\s*index|halstead|no major smell|minimal cleanup|no direct refactoring|implicitly/i;
  const filtered = (Array.isArray(items) ? items : []).filter((item) => !blockedPattern.test(item));
  const seen = new Set();
  const deduped = filtered.filter((item) => {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });

  const parsed = deduped.map((item, index) => {
    const match = item.match(/^(.+?):\s*(.+?)\s*->\s*(.+)$/);
    if (!match) {
      return { index, item, parseable: false };
    }

    const functions = match[1]
      .split(/,|\band\b|&/i)
      .map((name) => name.trim().toLowerCase())
      .filter(Boolean);

    return {
      index,
      item,
      parseable: true,
      functions,
      signature: `${match[2].trim().toLowerCase()} -> ${match[3].trim().toLowerCase()}`
    };
  });

  const singleFunctionSet = new Set(
    parsed
      .filter((entry) => entry.parseable && entry.functions.length === 1)
      .map((entry) => `${entry.functions[0]}|${entry.signature}`)
  );

  const keep = parsed.filter((entry) => {
    if (!entry.parseable || entry.functions.length <= 1) return true;
    return !entry.functions.every((fn) => singleFunctionSet.has(`${fn}|${entry.signature}`));
  });

  keep.sort((a, b) => a.index - b.index);
  return keep.map((entry) => entry.item);
};

const scoreFunctionBullet = (text) => {
  const lowered = text.toLowerCase();
  let score = 0;
  if (/extract|rename|split|remove|inline|simplif|refactor applied|decompose/.test(lowered)) score += 2;
  if (/no direct|not applied|implicitly|constraint|minimal cleanup|no major smell/.test(lowered)) score -= 3;
  return score;
};

const prioritizeSmellExplanation = (items) => {
  const list = Array.isArray(items) ? items : [];
  const smellPattern = /long method|duplicated logic|poor naming|dead code|large conditional|smell|no major smell|->/i;
  const smellFirst = list.filter((item) => smellPattern.test(item));
  const rest = list.filter((item) => !smellPattern.test(item));

  const groupedByFunction = new Map();
  const passthrough = [];

  for (const item of smellFirst) {
    const match = item.match(/^(.+?):\s*(.+?)\s*->\s*(.+)$/);
    if (!match) {
      passthrough.push(item);
      continue;
    }

    const functionKey = match[1].trim().toLowerCase();
    const current = groupedByFunction.get(functionKey);
    const candidate = { text: item, score: scoreFunctionBullet(item) };

    if (!current || candidate.score > current.score) {
      groupedByFunction.set(functionKey, candidate);
    }
  }

  const bestFunctionBullets = [...groupedByFunction.values()]
    .filter((entry) => entry.score >= 0)
    .map((entry) => entry.text);

  if (bestFunctionBullets.length === 0 && passthrough.length === 0 && rest.length === 0) {
    return ["Smell analysis: no concrete smell/refactor pairs were detected in this pass."];
  }

  return [...bestFunctionBullets, ...passthrough, ...rest];
};

const formatStructuredExplanation = (items) => {
  const list = Array.isArray(items) ? items : [];
  const hasLabel = (text, label) => new RegExp(`^\\[${label}\\]`, "i").test(text);
  const smellPattern = /->|long method|duplicated logic|poor naming|dead code|large conditional|smell/i;
  const actionPattern = /extract|rename|split|remove|inline|simplif|decompose|introduc|encapsulat/i;
  const benefitPattern = /readability|maintainability|clarity|testability|modular|cohesion|reusab|less complex|easier/i;

  const smell = [];
  const action = [];
  const benefit = [];

  for (const raw of list) {
    const item = raw.trim();
    if (!item) continue;

    if (hasLabel(item, "Smell")) {
      smell.push(item);
      continue;
    }
    if (hasLabel(item, "Action")) {
      action.push(item);
      continue;
    }
    if (hasLabel(item, "Benefit")) {
      benefit.push(item);
      continue;
    }

    if (smellPattern.test(item)) {
      smell.push(`[Smell] ${item}`);
    } else if (actionPattern.test(item)) {
      action.push(`[Action] ${item}`);
    } else if (benefitPattern.test(item)) {
      benefit.push(`[Benefit] ${item}`);
    } else {
      action.push(`[Action] ${item}`);
    }
  }

  if (smell.length > 0 && action.length === 0) {
    action.push("[Action] Applied targeted refactors based on detected smells.");
  }
  if (benefit.length === 0) {
    benefit.push("[Benefit] Improves readability and maintainability while preserving behavior.");
  }

  return [...smell, ...action, ...benefit].map((item) =>
    item
      .replace(/^\[(Smell|Action|Benefit)\]\s*/i, "")
      .replace(/^(Smell|Action|Benefit):\s*/i, "")
  );
};

app.post("/api/refactor/stream", async (req, res) => {
  const { code = "", model = "", options = {} } = req.body || {};
  if (!code.trim()) {
    return res.status(400).send("Code is required.");
  }
  if (!geminiApiKey) {
    return res.status(500).send("GEMINI_API_KEY is not configured.");
  }

  try {
    const modelToUse = resolveModelName(model);
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${modelToUse}:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [{ text: buildPromptText(code, options) }]
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
    const parsed = parsePlainTextResponse(text);
    const cleanedCode = stripCodeFences(parsed?.refactoredCode || "");

    let finalCode = cleanedCode;
    let finalExplanation = formatStructuredExplanation(
      prioritizeSmellExplanation(sanitizeExplanation(parsed?.explanation))
    );
    const finalLanguage = parsed?.language?.trim() || "";

    if (!finalCode.trim()) {
      finalCode = code;
      finalExplanation = [
        "Model response format invalid; returning original code.",
        "Try again or reduce input size."
      ];
    }

    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.send(
      [
        "LANGUAGE:",
        finalLanguage,
        "REFRACTORED_CODE:",
        finalCode,
        "EXPLANATION:",
        ...finalExplanation.map((item) => `- ${item}`)
      ].join("\n")
    );
  } catch (error) {
    console.error("Gemini request exception", error);
    return res.status(500).send(error.message || "Unexpected error.");
  }
});

app.listen(port, () => {
  console.log(`RefactorBot API listening on http://localhost:${port}`);
});
