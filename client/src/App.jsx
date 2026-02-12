import { useEffect, useMemo, useRef, useState } from "react";
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
  const [responseLanguage, setResponseLanguage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef(null);

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
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopy = async () => {
    if (!refactored.trim()) return;
    try {
      await navigator.clipboard.writeText(refactored);
      setCopied(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("Copy failed. Please try again.");
    }
  };

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
    setRefactored("");
    setExplanation([]);
    setResponseLanguage("");
    const detectedLanguage = detectLanguage(code);
    setLanguage(detectedLanguage);
    try {
      const response = await fetch("/api/refactor/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          language: detectedLanguage,
          options: {
            detectSmells: true,
            applySolid: true,
            includeMetrics: true
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Refactor failed. Try again.");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Stream not supported in this browser.");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      const parseStreamedText = (text) => {
        const langMarker = "LANGUAGE:";
        const refMarker = "REFRACTORED_CODE:";
        const explMarker = "EXPLANATION:";
        const refIndex = text.indexOf(refMarker);
        if (refIndex === -1) return null;
        const langIndex = text.indexOf(langMarker);
        let detected = "";
        if (langIndex !== -1 && langIndex < refIndex) {
          const langBlock = text.slice(langIndex + langMarker.length, refIndex).trim();
          detected = langBlock.split("\n")[0]?.trim() || "";
        }
        const afterRef = text.slice(refIndex + refMarker.length);
        const explIndex = afterRef.indexOf(explMarker);
        if (explIndex === -1) {
          return { language: detected, refactoredCode: afterRef.trim(), explanation: [] };
        }
        const refactoredCode = afterRef.slice(0, explIndex).trim();
        const explanationBlock = afterRef.slice(explIndex + explMarker.length);
        const explanation = explanationBlock
          .split("\n")
          .map((line) => line.replace(/^\s*[-*]\s*/, "").trim())
          .filter(Boolean);
        return { language: detected, refactoredCode, explanation };
      };

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseStreamedText(buffer);
        if (parsed?.refactoredCode) {
          setRefactored(parsed.refactoredCode);
        }
          if (parsed?.language) {
            setResponseLanguage(parsed.language);
          }
        if (parsed?.explanation?.length) {
            const nextExplanation = parsed.explanation.slice(0, 5);
            setExplanation(parsed.language ? [
              `Language: ${parsed.language}`,
              ...nextExplanation
            ] : nextExplanation);
        }
      }

      const parsed = parseStreamedText(buffer) || {};
      setRefactored(parsed.refactoredCode || "");
      if (parsed.language) setResponseLanguage(parsed.language);
      const finalExplanation = Array.isArray(parsed.explanation) ? parsed.explanation.slice(0, 5) : [];
      setExplanation(parsed.language ? [`Language: ${parsed.language}`, ...finalExplanation] : finalExplanation);
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
        <span className="pill">Gemini ready</span>
      </header>

      <main className="grid">
        <section className="panel">
          <div className="panel-header">
            <h2>Input</h2>
            <div className="controls">
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
            <button
              className="secondary"
              onClick={handleCopy}
              disabled={!refactored.trim()}
            >
              {copied ? "Copied" : "Copy refactored"}
            </button>
          </div>
          {responseLanguage && (
            <div className="language-label">Language: {responseLanguage}</div>
          )}
          <div className="before-after">
            <div className="code-block before">
              <h3>Before</h3>
              <pre>{code}</pre>
            </div>
            <div className="code-block after">
              <h3>After</h3>
              <pre>{refactored || "Refactored output will appear here."}</pre>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
