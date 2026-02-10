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

export default function App() {
  const [language, setLanguage] = useState("Other");
  const [code, setCode] = useState("// Paste code here\n");
  const [refactored, setRefactored] = useState("");
  const [explanation, setExplanation] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [detectSmells, setDetectSmells] = useState(true);
  const [applySolid, setApplySolid] = useState(true);
  const [includeMetrics, setIncludeMetrics] = useState(false);
  const [splitView, setSplitView] = useState(true);

  const hasOutput = refactored.trim().length > 0;

  const detectLanguage = (input) => {
    const sample = input || "";
    if (/\b(def |import |from |elif |print\(|self\.)/m.test(sample)) return "Python";
    if (/\b(public class|System\.out\.println|package |@Override|implements )/m.test(sample)) return "Java";
    if (/\b(using |Console\.WriteLine|namespace |\bvar\b|\basync Task\b)/m.test(sample)) return "C#";
    if (/(#include\s+<|std::|\bint\s+main\s*\(|\btemplate\s*<)/m.test(sample)) return "C++";
    if (/\bfunc\s+\w+\s*\(|\bpackage\s+main\b|fmt\.|:=/m.test(sample)) return "Go";
    if (/(\bfn\s+\w+\s*\(|\buse\s+\w+::|\blet\s+mut\b)/m.test(sample)) return "Rust";
    if (/\binterface\b|\btype\s+\w+\s*=|:\s*\w+|\bimplements\b/.test(sample)) return "TypeScript";
    if (/\bfunction\b|\bconst\b|\blet\b|=>|\bexport\b/.test(sample)) return "JavaScript";
    return "Other";
  };

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
    const detectedLanguage = detectLanguage(code);
    setLanguage(detectedLanguage);
    try {
      const response = await fetch("/api/refactor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language: detectedLanguage,
          options: {
            detectSmells,
            applySolid,
            includeMetrics
          }
        })
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
              <span className="detected">Detected: {language}</span>
              <label className="file-upload">
                <input type="file" onChange={handleFile} />
                Upload file
              </label>
            </div>
          </div>
          <div className="options">
            <label className="option">
              <input
                type="checkbox"
                checked={detectSmells}
                onChange={(event) => setDetectSmells(event.target.checked)}
              />
              Detect code smells
            </label>
            <label className="option">
              <input
                type="checkbox"
                checked={applySolid}
                onChange={(event) => setApplySolid(event.target.checked)}
              />
              Apply SOLID principles
            </label>
            <label className="option">
              <input
                type="checkbox"
                checked={includeMetrics}
                onChange={(event) => setIncludeMetrics(event.target.checked)}
              />
              Include software metrics summary
            </label>
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
            disableWordDiff
          />
        </section>
      </main>
    </div>
  );
}
