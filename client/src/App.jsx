import { useMemo, useState } from "react";

const LANGUAGE_OPTIONS = [
  "JavaScript",
  "TypeScript",
  "Python",
  "Java",
  "C#",
  "C++",
  "Go",
  "Rust",
  "Other"
];

export default function App() {
  const [language, setLanguage] = useState("JavaScript");
  const [code, setCode] = useState("// Paste code here\n");
  const [refactored, setRefactored] = useState("");
  const [explanation, setExplanation] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const hasOutput = refactored.trim().length > 0;

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCode(text);
    setError("");
  };

  const handleRefactor = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/refactor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, language })
      });

      if (!response.ok) {
        throw new Error("Refactor failed. Try again.");
      }

      const data = await response.json();
      setRefactored(data.refactoredCode || "");
      setExplanation(Array.isArray(data.explanation) ? data.explanation : []);
    } catch (err) {
      setError(err.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  const placeholderExplanation = useMemo(() => {
    return hasOutput ? explanation : ["No refactor result yet."];
  }, [hasOutput, explanation]);

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>RefactorBot</h1>
          <p>AI-powered code refactoring assistant</p>
        </div>
        <span className="pill">Gemini-ready</span>
      </header>

      <main className="grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Input</h2>
            <div className="controls">
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGE_OPTIONS.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
              <label className="file-upload">
                <input type="file" onChange={handleFile} />
                Upload file
              </label>
            </div>
          </div>
          <textarea
            className="code-input"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="primary" onClick={handleRefactor} disabled={loading}>
            {loading ? "Refactoring..." : "Refactor"}
          </button>
          {error && <p className="error">{error}</p>}
        </section>

        <section className="panel">
          <div className="panel-header">
            <h2>Explanation</h2>
          </div>
          <ul className="explanation">
            {placeholderExplanation.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </section>

        <section className="panel diff">
          <div className="panel-header">
            <h2>Diff View</h2>
          </div>
          <div className="diff-grid">
            <div>
              <h3>Original</h3>
              <pre>{code}</pre>
            </div>
            <div>
              <h3>Refactored</h3>
              <pre>{refactored || "Refactored output will appear here."}</pre>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
