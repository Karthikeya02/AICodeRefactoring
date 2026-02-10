import { useEffect, useMemo, useState } from "react";
import DiffViewer from "react-diff-viewer-continued";
import CodeMirror from "@uiw/react-codemirror";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { java } from "@codemirror/lang-java";
import { cpp } from "@codemirror/lang-cpp";
import { rust } from "@codemirror/lang-rust";
import { csharp } from "@replit/codemirror-lang-csharp";
import { oneDark } from "@codemirror/theme-one-dark";

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
  const [splitView, setSplitView] = useState(true);

  const hasOutput = refactored.trim().length > 0;

  const languageExtension = useMemo(() => {
    switch (language) {
      case "JavaScript":
        return javascript({ jsx: true });
      case "TypeScript":
        return javascript({ typescript: true });
      case "Python":
        return python();
      case "Java":
        return java();
      case "C#":
        return csharp();
      case "C++":
        return cpp();
      case "Go":
        return cpp();
      case "Rust":
        return rust();
      default:
        return javascript();
    }
  }, [language]);

  useEffect(() => {
    const updateSplitView = () => {
      if (typeof window === "undefined") return;
      setSplitView(window.innerWidth > 900);
    };

    updateSplitView();
    window.addEventListener("resize", updateSplitView);
    return () => window.removeEventListener("resize", updateSplitView);
  }, []);

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
          <div className="code-input">
            <CodeMirror
              value={code}
              height="260px"
              theme={oneDark}
              extensions={[languageExtension]}
              onChange={(value) => setCode(value)}
            />
          </div>
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
          <DiffViewer
            oldValue={code}
            newValue={refactored || "Refactored output will appear here."}
            splitView={splitView}
            useDarkTheme
            showDiffOnly={false}
          />
        </section>
      </main>
    </div>
  );
}
