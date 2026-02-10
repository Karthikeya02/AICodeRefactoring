import express from "express";
import cors from "cors";

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.post("/api/refactor", (req, res) => {
  const { code = "", language = "" } = req.body || {};

  res.json({
    refactoredCode: code,
    explanation: [
      "Placeholder response from the server.",
      `Language selected: ${language || "unspecified"}.`,
      "Wire Gemini in the next step to get real refactoring."
    ]
  });
});

app.listen(port, () => {
  console.log(`RefactorBot API listening on http://localhost:${port}`);
});
