// src/App.jsx
import React, { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

/** Helpers */
const clamp01 = (n) => Math.max(0, Math.min(1, n));
const snap = (n) => Math.round(n * 100) / 100;
const DEFAULT_TEXT =
  localStorage.getItem("tp:text") || "Type your text here...";
const DEFAULT_AXES = JSON.parse(
  localStorage.getItem("tp:axes") ||
    JSON.stringify({ formal: 0.6, friendly: 0.5 })
);

function axesToLabel(a) {
  const f =
    a.formal < 0.35 ? "Casual" : a.formal > 0.65 ? "Formal" : "Neutral";
  const w =
    a.friendly < 0.35
      ? "Direct"
      : a.friendly > 0.65
      ? "Friendly"
      : "Balanced";
  return `${f} · ${w}`;
}

/** Sentence diff helper */
function sentenceDiff(oldText = "", newText = "") {
  const split = (t) =>
    t
      .split(/(?<=[.?!])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);

  const a = split(oldText);
  const b = split(newText);

  const n = a.length,
    m = b.length;
  const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; --i) {
    for (let j = m - 1; j >= 0; --j) {
      if (a[i] === b[j]) dp[i][j] = 1 + dp[i + 1][j + 1];
      else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const result = [];
  let i = 0,
    j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      result.push({ type: "equal", text: a[i] });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      result.push({ type: "removed", text: a[i] });
      i++;
    } else {
      result.push({ type: "added", text: b[j] });
      j++;
    }
  }
  while (i < n) result.push({ type: "removed", text: a[i++] });
  while (j < m) result.push({ type: "added", text: b[j++] });

  const merged = [];
  for (const r of result) {
    const last = merged[merged.length - 1];
    if (last && last.type === r.type) last.text += " " + r.text;
    else merged.push({ ...r });
  }
  return merged;
}

/** DiffViewer */
function DiffViewer({ oldText, newText }) {
  if (!oldText && !newText) return null;
  const parts = sentenceDiff(oldText, newText);
  return (
    <div className="mt-6 p-4 rounded-lg bg-slate-50 border border-slate-200">
      <div className="text-sm text-slate-600 mb-3 font-medium">
        Changes preview
      </div>
      <div className="space-y-2 leading-relaxed">
        {parts.map((p, idx) => {
          if (p.type === "equal")
            return (
              <div key={idx} className="text-slate-700">
                {p.text}
              </div>
            );
          if (p.type === "removed")
            return (
              <div key={idx} className="line-through text-red-500 text-sm">
                {p.text}
              </div>
            );
          if (p.type === "added")
            return (
              <div
                key={idx}
                className="text-slate-900 bg-green-50 inline-block px-2 py-1 rounded"
              >
                {p.text}
              </div>
            );
          return (
            <div key={idx} className="text-slate-700">
              {p.text}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** ToneGrid */
function ToneGrid({ axes, onChange }) {
  const ref = useRef(null);
  const dragging = useRef(false);

  const updateFromClient = useCallback(
    (clientX, clientY) => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const x = clamp01((clientX - r.left) / r.width);
      const y = clamp01((clientY - r.top) / r.height);
      onChange({ formal: snap(x), friendly: snap(1 - y) });
    },
    [onChange]
  );

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      const x = e.touches?.[0]?.clientX ?? e.clientX;
      const y = e.touches?.[0]?.clientY ?? e.clientY;
      updateFromClient(x, y);
    };
    const onUp = () => (dragging.current = false);

    window.addEventListener("mousemove", onMove);
    window.addEventListener("touchmove", onMove, { passive: false });
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchend", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchend", onUp);
    };
  }, [updateFromClient]);

  const start = (e) => {
    dragging.current = true;
    const x = e.touches?.[0]?.clientX ?? e.clientX;
    const y = e.touches?.[0]?.clientY ?? e.clientY;
    updateFromClient(x, y);
  };

  return (
    <div
      ref={ref}
      onMouseDown={start}
      onTouchStart={start}
      className="relative w-full aspect-square rounded-xl bg-gradient-to-br from-slate-700 to-slate-600 p-3"
    >
      <div className="absolute inset-3 border-2 border-dashed border-white/10 rounded-lg" />
      <div
        className="absolute w-5 h-5 rounded-full bg-white shadow border-2 border-slate-800 transform -translate-x-1/2 -translate-y-1/2"
        style={{
          left: `${axes.formal * 100}%`,
          top: `${(1 - axes.friendly) * 100}%`,
        }}
      />
      <div className="absolute left-3 top-3 text-xs text-white/80">Friendly</div>
      <div className="absolute right-3 top-3 text-xs text-white/80">Formal</div>
      <div className="absolute left-3 bottom-3 text-xs text-white/80">Casual</div>
      <div className="absolute right-3 bottom-3 text-xs text-white/80">Direct</div>
    </div>
  );
}

/** Main App */
export default function App() {
  const [text, setText] = useState(DEFAULT_TEXT);
  const [axes, setAxes] = useState(DEFAULT_AXES);
  const [history, setHistory] = useState(() =>
    JSON.parse(localStorage.getItem("tp:history") || "[]")
  );
  const [index, setIndex] = useState(
    Number(localStorage.getItem("tp:historyIdx") || 0)
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastResponseText, setLastResponseText] = useState("");
  const abortRef = useRef(null);
  const previousRef = useRef("");

  useEffect(() => localStorage.setItem("tp:text", text), [text]);
  useEffect(() => localStorage.setItem("tp:axes", JSON.stringify(axes)), [axes]);
  useEffect(() => {
    localStorage.setItem("tp:history", JSON.stringify(history));
    localStorage.setItem("tp:historyIdx", index);
  }, [history, index]);

  const handleUndo = () => {
    if (index > 0) {
      setIndex(index - 1);
      setText(history[index - 1]);
    }
  };
  const handleRedo = () => {
    if (index < history.length - 1) {
      setIndex(index + 1);
      setText(history[index + 1]);
    }
  };

  const applyTone = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const prev = text;
      const res = await axios.post(
        "http://localhost:5000/api/tone",
        { text, axes },
        { signal: controller.signal }
      );
      const newText = res.data?.text ?? res.data?.result ?? "";
      if (!newText) throw new Error("Empty response");

      const newHistory = [...history.slice(0, index + 1), newText];
      setHistory(newHistory);
      setIndex(newHistory.length - 1);
      setText(newText);
      setLastResponseText(newText);
      previousRef.current = prev;
    } catch (err) {
      if (!axios.isCancel(err)) setError(err.message);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const resetAll = () => {
    setText("Type your text here...");
    setHistory(["Type your text here..."]);
    setIndex(0);
    setAxes({ formal: 0.6, friendly: 0.5 });
    setLastResponseText("");
    previousRef.current = "";
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Loader */}
      <div className="fixed top-0 left-0 right-0 z-50 h-1">
        <div
          className={`h-1 bg-gradient-to-r from-blue-400 to-cyan-400 transition-all ${
            loading ? "w-full opacity-100" : "w-0 opacity-0"
          }`}
        />
      </div>

      {/* Header */}
      <header className="bg-white shadow sticky top-0 z-40 p-4">
        <div className="container mx-auto flex items-start justify-between px-4">
          <h1 className="text-xl font-semibold text-slate-800">✨ Tone Picker</h1>
          <div className="text-sm text-slate-500 text-right leading-relaxed">
            <div>Formal ⇄ Casual</div>
            <div>Direct ⇄ Friendly</div>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="container flex-grow mx-auto px-4 py-6 grid grid-cols-1 md:grid-cols-[1fr_340px] gap-6">
        {/* Text editor */}
        <section className="bg-white rounded-2xl shadow p-6 flex flex-col">
          <label className="text-sm text-slate-600 mb-2 font-medium">
            Enter text
          </label>
         <textarea
  className="min-h-[300px] resize-y p-4 rounded-xl border border-slate-200 
             focus:ring-2 focus:ring-blue-400 focus:border-transparent text-slate-800 mb-4"
/>

          {/* Controls */}
          <div className="flex flex-wrap items-center gap-3 mt-6">
            <button
              onClick={handleUndo}
              disabled={index === 0}
              className="px-4 py-2 bg-slate-100 rounded-lg text-slate-700 disabled:opacity-50"
            >
              ⬅ Undo
            </button>
            <button
              onClick={handleRedo}
              disabled={index >= history.length - 1}
              className="px-4 py-2 bg-slate-100 rounded-lg text-slate-700 disabled:opacity-50"
            >
              Redo ➡
            </button>
            <button
              onClick={resetAll}
              className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
            >
              Reset
            </button>
            <div className="ml-auto text-sm text-slate-500">
              {axesToLabel(axes)}
            </div>
            <button
              onClick={applyTone}
              disabled={loading || !text.trim()}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-60"
            >
              {loading ? "Applying…" : "Apply Tone"}
            </button>
          </div>

          {error && (
            <div className="mt-3 text-sm text-red-600 font-medium">{error}</div>
          )}
          {lastResponseText && (
            <DiffViewer
              oldText={previousRef.current}
              newText={lastResponseText}
            />
          )}
        </section>

        {/* Tone Picker */}
        <aside className="bg-white rounded-2xl shadow p-6 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-800">Tone Picker</h2>
            <button
              onClick={() => setAxes({ formal: 0.6, friendly: 0.5 })}
              className="text-sm text-slate-500 hover:underline"
            >
              Reset
            </button>
          </div>
          <ToneGrid axes={axes} onChange={setAxes} />
          <div className="text-sm text-slate-500">Quick presets</div>
          <div className="grid gap-2">
            <button
              onClick={() => setAxes({ formal: 0.9, friendly: 0.6 })}
              className="py-2 rounded-lg bg-slate-50 hover:bg-slate-100"
            >
              Formal · Warm
            </button>
            <button
              onClick={() => setAxes({ formal: 0.1, friendly: 0.8 })}
              className="py-2 rounded-lg bg-slate-50 hover:bg-slate-100"
            >
              Casual · Friendly
            </button>
            <button
              onClick={() => setAxes({ formal: 0.9, friendly: 0.1 })}
              className="py-2 rounded-lg bg-slate-50 hover:bg-slate-100"
            >
              Formal · Direct
            </button>
            <button
              onClick={() => setAxes({ formal: 0.1, friendly: 0.1 })}
              className="py-2 rounded-lg bg-slate-50 hover:bg-slate-100"
            >
              Casual · Direct
            </button>
          </div>
          <div className="text-xs text-slate-400 mt-2">
            Drag the knob or click a preset. Use ⌘/Ctrl+Enter to apply.
          </div>
        </aside>
      </main>

      {/* Footer */}
      <footer className="mt-auto py-4 text-center text-sm text-slate-500 border-t bg-white">
        © {new Date().getFullYear()} Tone Picker
      </footer>
    </div>
  );
}
