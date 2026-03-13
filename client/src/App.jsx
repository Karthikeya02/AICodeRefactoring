import { useEffect, useMemo, useRef, useState } from "react";
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
  const [responseLanguage, setResponseLanguage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedRefactored, setCopiedRefactored] = useState(false);
  const [copiedOriginal, setCopiedOriginal] = useState(false);
  const [splitView, setSplitView] = useState(true);
  const [isStable, setIsStable] = useState(false);
  const [forceAnotherPass, setForceAnotherPass] = useState(false);
  const [similarity, setSimilarity] = useState(0);
  const copyTimerRef = useRef(null);

  const hasOutput = refactored.trim().length > 0;

  const sanitizeExplanation = (items) => {
    const blockedPattern = /cyclomatic|complexity|software\s*metrics?|smells\s*detected|maintainability\s*index|halstead/i;
    return (Array.isArray(items) ? items : []).filter((item) => !blockedPattern.test(item));
  };

  const normalizeCode = (text) =>
    (text || "")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .trim();

  const estimateSimilarity = (source, target) => {
    const a = normalizeCode(source);
    const b = normalizeCode(target);
    if (!a && !b) return 100;
    if (!a || !b) return 0;
    if (a === b) return 100;

    const aLines = a.split("\n");
    const bSet = new Set(b.split("\n"));
    let shared = 0;
    for (const line of aLines) {
      if (bSet.has(line)) shared += 1;
    }
    return Math.round((shared / Math.max(aLines.length, 1)) * 100);
  };

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

  const gitDiffStyles = useMemo(
    () => ({
      variables: {
        dark: {
          diffViewerBackground: "#0d1117",
          diffViewerColor: "#c9d1d9",
          addedBackground: "#12261a",
          addedColor: "#d2ffd8",
          removedBackground: "#2d1419",
          removedColor: "#ffd7dd",
          wordAddedBackground: "#1f4f2d",
          wordRemovedBackground: "#6e1f28",
          addedGutterBackground: "#163021",
          removedGutterBackground: "#3a1b21",
          gutterBackground: "#161b22",
          gutterBackgroundDark: "#161b22",
          highlightBackground: "#1f2a36",
          highlightGutterBackground: "#1f2a36",
          codeFoldGutterBackground: "#161b22",
          codeFoldBackground: "#0d1117"
        }
      },
      diffContainer: {
        lineHeight: "1.55"
      },
      gutter: {
        minWidth: "44px",
        textAlign: "right",
        paddingRight: "10px"
      },
      lineNumber: {
        color: "#8b949e"
      },
      line: {
        fontFamily: "JetBrains Mono, monospace",
        fontSize: "13px"
      },
      marker: {
        userSelect: "none",
        fontWeight: 700,
        width: "22px"
      }
    }),
    []
  );

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setIsStable(false);
    setForceAnotherPass(false);
    setSimilarity(0);
  }, [code]);

  useEffect(() => {
    const updateSplitView = () => {
      if (typeof window === "undefined") return;
      setSplitView(window.innerWidth > 900);
    };

    updateSplitView();
    window.addEventListener("resize", updateSplitView);
    return () => window.removeEventListener("resize", updateSplitView);
  }, []);

  const resetCopiedFlags = () => {
    setCopiedRefactored(false);
    setCopiedOriginal(false);
  };

  const handleCopyRefactored = async () => {
    if (!refactored.trim()) return;
    try {
      await navigator.clipboard.writeText(refactored);
      resetCopiedFlags();
      setCopiedRefactored(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(resetCopiedFlags, 1500);
    } catch {
      setError("Copy failed. Please try again.");
    }
  };

  const handleCopyOriginal = async () => {
    if (!code.trim()) return;
    try {
      await navigator.clipboard.writeText(code);
      resetCopiedFlags();
      setCopiedOriginal(true);
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(resetCopiedFlags, 1500);
      setError("");
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
            includeMetrics: false
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
            const nextExplanation = sanitizeExplanation(parsed.explanation).slice(0, 5);
            setExplanation(nextExplanation);
        }
      }

      const parsed = parseStreamedText(buffer) || {};
      setRefactored(parsed.refactoredCode || "");
      if (parsed.language) setResponseLanguage(parsed.language);
      const finalExplanation = sanitizeExplanation(parsed.explanation).slice(0, 5);
      setExplanation(finalExplanation);

      const sim = estimateSimilarity(code, parsed.refactoredCode || "");
      setSimilarity(sim);
      const stable = sim >= 98;
      setIsStable(stable);
      if (stable) {
        setExplanation((prev) => [
          "Code appears stable; further refactoring may not help much.",
          ...prev
        ].slice(0, 5));
      }
    } catch (err) {
      setError(err.message || "Unexpected error.");
    } finally {
      setLoading(false);
    }
  };

  const placeholderExplanation = useMemo(() => {
    return hasOutput ? explanation : ["No refactor result yet."];
  }, [hasOutput, explanation]);

  const statusText = loading
    ? "Refactoring..."
    : error
      ? "Error"
      : isStable
        ? "Stable"
        : "Ready";

  const refactorDisabled = loading || (isStable && !forceAnotherPass);

  return (
    <div className="page">
      <header className="topbar">
        <div>
          <h1>RefactorBot</h1>
          <p>AI-powered code refactoring assistant</p>
        </div>
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
          <button className="primary" onClick={handleRefactor} disabled={refactorDisabled}>
            {loading ? "Refactoring..." : "Refactor"}
          </button>
          <p className={`status-line ${error ? "error-state" : ""}`}>Status: {statusText}</p>
          {isStable && (
            <div className="stability-box">
              <p>Similarity: {similarity}% (code appears stable).</p>
              <label>
                <input
                  type="checkbox"
                  checked={forceAnotherPass}
                  onChange={(event) => setForceAnotherPass(event.target.checked)}
                />
                Force another pass
              </label>
            </div>
          )}
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
            <div className="actions">
              <button className="secondary" onClick={handleCopyOriginal} disabled={!code.trim()}>
                {copiedOriginal ? "Copied" : "Copy original"}
              </button>
              <button
                className="secondary"
                onClick={handleCopyRefactored}
                disabled={!refactored.trim()}
              >
                {copiedRefactored ? "Copied" : "Copy refactored"}
              </button>
            </div>
          </div>
          {responseLanguage && (
            <div className="language-label">Language: {responseLanguage}</div>
          )}
          <p className="caution-note">
            AI refactors may be imperfect. Review output before usage.
          </p>
          <div className="git-diff-wrap">
            <DiffViewer
              oldValue={code}
              newValue={refactored || "Refactored output will appear here."}
              splitView={splitView}
              useDarkTheme
              showDiffOnly={false}
              disableWordDiff
              styles={gitDiffStyles}
            />
          </div>
        </section>
      </main>
    </div>
  );
}
