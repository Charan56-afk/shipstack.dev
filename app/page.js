"use client";

import { useState, useCallback } from "react";
import { runPipeline, EVAL_PROMPTS } from "../lib/pipeline";

// ── Status Badge ──────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    idle:               { cls: "bg-gray-800 text-gray-400",                        label: "Waiting"         },
    running:            { cls: "bg-blue-900 text-blue-300 animate-pulse",           label: "Processing..."   },
    retrying:           { cls: "bg-yellow-900 text-yellow-300",                     label: "Retrying..."     },
    done:               { cls: "bg-green-900 text-green-300",                       label: "Complete"        },
    done_with_warnings: { cls: "bg-orange-900 text-orange-300",                     label: "Done (warnings)" },
    error:              { cls: "bg-red-900 text-red-300",                           label: "Failed"          },
  };
  const { cls, label } = map[status] || map.idle;
  return (
    <span className={`text-xs px-2 py-0.5 rounded-full font-mono font-bold ${cls}`}>
      {label}
    </span>
  );
}

// ── Stage Card ────────────────────────────────────────────────
function StageCard({ icon, title, status, result, errors }) {
  const [open, setOpen] = useState(false);
  const border =
    status === "running"            ? "border-blue-500 shadow-lg shadow-blue-900/30"
    : status === "done"             ? "border-green-700"
    : status === "error"            ? "border-red-700"
    : status === "done_with_warnings" ? "border-orange-600"
    : "border-gray-700";

  return (
    <div className={`border rounded-lg overflow-hidden transition-all duration-300 ${border}`}>
      <div
        className="flex items-center justify-between px-4 py-3 bg-gray-900 hover:bg-gray-800 transition-colors cursor-pointer"
        onClick={() => result && setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">{icon}</span>
          <div>
            <div className="text-sm font-bold text-white font-mono">{title}</div>
            {errors?.length > 0 && (
              <div className="text-xs text-orange-400 mt-0.5">{errors.length} issue(s) detected &amp; handled</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge status={status} />
          {result && <span className="text-gray-500 text-xs">{open ? "▲" : "▼"}</span>}
        </div>
      </div>
      {open && result && (
        <div className="bg-gray-950 border-t border-gray-800">
          <pre className="text-xs text-green-300 p-4 overflow-auto max-h-64 font-mono leading-relaxed">
            {JSON.stringify(result, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

// ── Metrics Panel ─────────────────────────────────────────────
function MetricsPanel({ metrics }) {
  if (!metrics) return null;
  const items = [
    { label: "Total Time",     value: `${(metrics.totalTime / 1000).toFixed(1)}s` },
    { label: "Retries",        value: metrics.retries },
    { label: "Issues Fixed",   value: metrics.errors?.length || 0 },
    {
      label: "Stage Breakdown",
      value: Object.entries(metrics.stageTimings || {})
        .map(([k, v]) => `${k}: ${(v / 1000).toFixed(1)}s`)
        .join("  |  "),
      wide: true,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 mt-4">
      {items.map((m, i) => (
        <div
          key={i}
          className={`bg-gray-900 border border-gray-700 rounded-lg p-3 ${m.wide ? "col-span-2" : ""}`}
        >
          <div className="text-xs text-gray-500 font-mono mb-1">{m.label}</div>
          <div className="text-sm text-cyan-300 font-bold font-mono">{m.value}</div>
        </div>
      ))}
    </div>
  );
}

// ── Schema Viewer ─────────────────────────────────────────────
function SchemaViewer({ schema }) {
  const [tab, setTab] = useState("database");
  if (!schema) return null;

  const tabs = [
    { id: "database", label: "🗄️ Database", data: schema.database },
    { id: "api",      label: "⚡ API",      data: schema.api      },
    { id: "ui",       label: "🖥️ UI",       data: schema.ui       },
    { id: "auth",     label: "🔐 Auth",     data: schema.auth     },
  ];

  const renderDatabase = (db) => (
    <div className="space-y-4">
      {db?.tables?.map((table, i) => (
        <div key={i} className="border border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 flex items-center gap-2">
            <span className="text-yellow-400">📋</span>
            <span className="font-bold text-white font-mono text-sm">{table.name}</span>
          </div>
          <div className="p-3 space-y-1">
            {table.columns?.map((col, j) => (
              <div key={j} className="flex items-center justify-between text-xs py-1 border-b border-gray-800 last:border-0">
                <div className="flex items-center gap-2">
                  {col.primary_key && <span className="text-yellow-400">🔑</span>}
                  {col.foreign_key && <span className="text-blue-400">🔗</span>}
                  <span className="text-white font-mono">{col.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-cyan-400 font-mono">{col.type}</span>
                  {col.nullable === false && <span className="text-red-400 text-xs">NOT NULL</span>}
                  {col.unique && <span className="text-purple-400 text-xs">UNIQUE</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderAPI = (api) => (
    <div className="space-y-2">
      <div className="text-xs text-gray-500 mb-3 font-mono">
        Base URL: {api?.base_url}  |  Auth: {api?.auth_method}
      </div>
      {api?.endpoints?.map((ep, i) => (
        <div key={i} className="border border-gray-700 rounded-lg p-3">
          <div className="flex items-center gap-3 mb-2">
            <span className={`text-xs font-bold font-mono px-2 py-0.5 rounded ${
              ep.method === "GET"  ? "bg-green-900 text-green-300"
              : ep.method === "POST"  ? "bg-blue-900 text-blue-300"
              : ep.method === "PUT" || ep.method === "PATCH" ? "bg-yellow-900 text-yellow-300"
              : "bg-red-900 text-red-300"
            }`}>{ep.method}</span>
            <span className="text-white font-mono text-sm">{ep.path}</span>
            {ep.auth_required && <span className="text-xs text-orange-400">🔒</span>}
          </div>
          <div className="text-xs text-gray-400">{ep.description}</div>
          {ep.allowed_roles?.length > 0 && (
            <div className="flex gap-1 mt-2 flex-wrap">
              {ep.allowed_roles.map((r, j) => (
                <span key={j} className="text-xs bg-gray-800 text-purple-300 px-2 py-0.5 rounded font-mono">{r}</span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );

  const renderUI = (ui) => (
    <div className="space-y-4">
      <div className="flex items-center gap-4 p-3 bg-gray-800 rounded-lg">
        <div style={{ backgroundColor: ui?.theme?.primary_color   }} className="w-6 h-6 rounded-full border border-gray-600" />
        <div style={{ backgroundColor: ui?.theme?.secondary_color }} className="w-6 h-6 rounded-full border border-gray-600" />
        <span className="text-xs text-gray-400 font-mono">{ui?.theme?.font_family}</span>
      </div>
      {ui?.pages?.map((page, i) => (
        <div key={i} className="border border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-blue-400">📄</span>
              <span className="font-bold text-white font-mono text-sm">{page.name}</span>
              <span className="text-xs text-gray-500 font-mono">{page.path}</span>
            </div>
            <span className="text-xs text-purple-300 font-mono">{page.layout}</span>
          </div>
          <div className="p-3 space-y-2">
            {page.components?.map((comp, j) => (
              <div key={j} className="flex items-center justify-between text-xs bg-gray-800 rounded px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="text-green-400">⚙️</span>
                  <span className="text-white font-mono">{comp.name}</span>
                  <span className="text-gray-500 font-mono">({comp.type})</span>
                </div>
                {comp.api_binding && (
                  <span className="text-cyan-400 font-mono text-xs">{comp.api_binding}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const renderAuth = (auth) => (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Provider",     value: auth?.provider     },
          { label: "Token Expiry", value: auth?.token_expiry },
          { label: "Roles",        value: auth?.roles?.join(", ") },
        ].map((item, i) => (
          <div key={i} className="bg-gray-800 rounded-lg p-3">
            <div className="text-xs text-gray-500 font-mono">{item.label}</div>
            <div className="text-sm text-cyan-300 font-mono font-bold mt-1">{item.value}</div>
          </div>
        ))}
      </div>
      <div className="border border-gray-700 rounded-lg overflow-hidden">
        <div className="bg-gray-800 px-4 py-2 text-sm font-bold text-white font-mono">Permission Rules</div>
        <div className="divide-y divide-gray-800">
          {auth?.rules?.map((rule, i) => (
            <div key={i} className="flex items-center justify-between px-4 py-2 text-xs">
              <span className="text-purple-300 font-mono font-bold">{rule.role}</span>
              <span className="text-white font-mono">{rule.resource}</span>
              <div className="flex gap-1">
                {rule.actions?.map((a, j) => (
                  <span key={j} className="bg-gray-700 text-green-300 px-2 py-0.5 rounded font-mono">{a}</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const renderers = { database: renderDatabase, api: renderAPI, ui: renderUI, auth: renderAuth };

  return (
    <div className="mt-6">
      <h3 className="text-lg font-bold text-white font-mono mb-4">📦 Final App Schema</h3>
      <div className="flex gap-1 mb-4 border-b border-gray-700 pb-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-mono rounded-t transition-colors ${
              tab === t.id ? "bg-gray-700 text-white font-bold" : "text-gray-500 hover:text-gray-300"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="overflow-auto max-h-96">
        {renderers[tab]?.(tabs.find((t) => t.id === tab)?.data)}
      </div>
    </div>
  );
}

// ── Evaluation Panel ──────────────────────────────────────────
function EvaluationPanel({ onRunEval }) {
  const [results, setResults]       = useState([]);
  const [running, setRunning]       = useState(false);
  const [current, setCurrent]       = useState("");

  const allPrompts = [
    ...EVAL_PROMPTS.standard.map((p) => ({ prompt: p, type: "standard" })),
    ...EVAL_PROMPTS.edge.map((p)      => ({ prompt: p, type: "edge"     })),
  ];

  const runEvaluation = async () => {
    setRunning(true);
    setResults([]);
    for (const { prompt, type } of allPrompts) {
      setCurrent(prompt.substring(0, 50) + "...");
      const start = Date.now();
      try {
        const { metrics } = await onRunEval(prompt);
        setResults((prev) => [...prev, {
          prompt: prompt.substring(0, 60) + "...",
          type, success: true,
          retries: metrics.retries,
          time:    ((Date.now() - start) / 1000).toFixed(1),
          errors:  metrics.errors.length,
        }]);
      } catch (err) {
        setResults((prev) => [...prev, {
          prompt: prompt.substring(0, 60) + "...",
          type, success: false,
          retries: 0,
          time: ((Date.now() - start) / 1000).toFixed(1),
          errors: 1,
        }]);
      }
      await new Promise((r) => setTimeout(r, 500));
    }
    setRunning(false);
    setCurrent("");
  };

  const successRate =
    results.length > 0
      ? ((results.filter((r) => r.success).length / results.length) * 100).toFixed(0)
      : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-white font-mono">Evaluation Framework</h3>
          <p className="text-xs text-gray-500 mt-1">10 standard + 10 edge case prompts</p>
        </div>
        <button
          onClick={runEvaluation}
          disabled={running}
          className="px-4 py-2 bg-purple-700 hover:bg-purple-600 disabled:bg-gray-700 text-white text-sm font-mono rounded-lg transition-colors"
        >
          {running ? `Running... ${results.length}/10` : "▶ Run Full Eval"}
        </button>
      </div>

      {running && current && (
        <div className="text-xs text-cyan-400 font-mono animate-pulse">Processing: &quot;{current}&quot;</div>
      )}

      {successRate && (
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Success Rate", value: `${successRate}%`,                                                                                    color: "text-green-400"  },
            { label: "Avg Retries",  value: (results.reduce((a, r) => a + r.retries, 0) / results.length).toFixed(1),                             color: "text-yellow-400" },
            { label: "Avg Time",     value: `${(results.reduce((a, r) => a + parseFloat(r.time), 0) / results.length).toFixed(1)}s`,              color: "text-cyan-400"   },
            { label: "Issues Fixed", value: results.reduce((a, r) => a + r.errors, 0),                                                            color: "text-orange-400" },
          ].map((m, i) => (
            <div key={i} className="bg-gray-900 border border-gray-700 rounded-lg p-3">
              <div className="text-xs text-gray-500 font-mono">{m.label}</div>
              <div className={`text-lg font-bold font-mono ${m.color}`}>{m.value}</div>
            </div>
          ))}
        </div>
      )}

      {results.length > 0 && (
        <div className="border border-gray-700 rounded-lg overflow-hidden">
          <div className="bg-gray-800 px-4 py-2 grid grid-cols-5 text-xs text-gray-400 font-mono font-bold">
            <span className="col-span-2">Prompt</span>
            <span>Type</span>
            <span>Status</span>
            <span>Time / Retries</span>
          </div>
          <div className="divide-y divide-gray-800 max-h-64 overflow-auto">
            {results.map((r, i) => (
              <div key={i} className="px-4 py-2 grid grid-cols-5 text-xs items-center">
                <span className="col-span-2 text-gray-300 font-mono truncate">{r.prompt}</span>
                <span className={`font-mono ${r.type === "edge" ? "text-orange-400" : "text-blue-400"}`}>{r.type}</span>
                <span className={r.success ? "text-green-400" : "text-red-400"}>{r.success ? "✓ Pass" : "✗ Fail"}</span>
                <span className="text-gray-400 font-mono">{r.time}s / {r.retries}↺</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────
export default function Home() {
  const [userInput,   setUserInput]   = useState("");
  const [isRunning,   setIsRunning]   = useState(false);
  const [stages,      setStages]      = useState({
    intent:     { status: "idle", result: null, errors: [] },
    design:     { status: "idle", result: null, errors: [] },
    schema:     { status: "idle", result: null, errors: [] },
    refinement: { status: "idle", result: null, errors: [] },
  });
  const [finalResult, setFinalResult] = useState(null);
  const [metrics,     setMetrics]     = useState(null);
  const [activeView,  setActiveView]  = useState("compiler");
  const [exportData,  setExportData]  = useState(null);
  const [intentData,  setIntentData]  = useState(null);

  const updateStage = useCallback((stageName, status, result, errors) => {
    setStages((prev) => ({ ...prev, [stageName]: { status, result, errors } }));
    if (stageName === "intent" && result) setIntentData(result);
  }, []);

  const handleRun = async () => {
    if (!userInput.trim() || isRunning) return;
    setIsRunning(true);
    setFinalResult(null);
    setMetrics(null);
    setExportData(null);
    setIntentData(null);
    setStages({
      intent:     { status: "idle", result: null, errors: [] },
      design:     { status: "idle", result: null, errors: [] },
      schema:     { status: "idle", result: null, errors: [] },
      refinement: { status: "idle", result: null, errors: [] },
    });
    try {
      const { results, metrics } = await runPipeline(userInput, updateStage);
      setFinalResult(results.final || results.schema);
      setMetrics(metrics);
      setExportData(results);
    } catch (err) {
      console.error("Pipeline error:", err);
    } finally {
      setIsRunning(false);
    }
  };

  const handleEvalRun = async (prompt) => {
    const { results, metrics } = await runPipeline(prompt, () => {});
    return { results, metrics };
  };

  const stageConfig = [
    { key: "intent",     icon: "🧠", title: "Stage 1 — Intent Extraction"  },
    { key: "design",     icon: "🏗️", title: "Stage 2 — System Design"       },
    { key: "schema",     icon: "⚙️", title: "Stage 3 — Schema Generation"   },
    { key: "refinement", icon: "✨", title: "Stage 4 — Refinement & Repair" },
  ];

  const examples = [
    "Build a CRM with login, contacts, dashboard, role-based access, and premium plan with payments.",
    "Create a project management tool with kanban boards, teams, sprints, and time tracking.",
    "Build a multi-vendor e-commerce platform with products, orders, Stripe payments, and analytics.",
  ];

  return (
    <div style={{ background: "#0a0a0f", minHeight: "100vh", fontFamily: "'Courier New', monospace", color: "#e2e8f0" }}>

      {/* Header */}
      <div style={{ borderBottom: "1px solid #1e293b", background: "linear-gradient(90deg,#0a0a0f,#0f172a 50%,#0a0a0f)" }}
           className="px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div style={{ width: 36, height: 36, background: "linear-gradient(135deg,#6366f1,#8b5cf6)", borderRadius: 8,
                          display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
              ⚡
            </div>
            <div>
              <div className="text-white font-bold text-lg" style={{ letterSpacing: "0.05em" }}>APP COMPILER</div>
              <div className="text-gray-500 text-xs">Natural Language → Executable App Schema</div>
            </div>
          </div>
          <div className="flex gap-2">
            {["compiler", "evaluation", "raw"].map((v) => (
              <button key={v} onClick={() => setActiveView(v)}
                className={`px-3 py-1.5 text-xs font-mono rounded transition-colors uppercase ${
                  activeView === v ? "bg-indigo-700 text-white" : "text-gray-500 hover:text-gray-300"
                }`}>
                {v}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* ── COMPILER VIEW ── */}
        {activeView === "compiler" && (
          <>
            {/* Input */}
            <div style={{ border: "1px solid #1e293b", borderRadius: 12, background: "#0d1117" }} className="p-6">
              <div className="text-xs text-gray-500 font-mono mb-3 uppercase tracking-widest">Input Prompt</div>
              <textarea
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                placeholder={"Describe the app you want to build in plain English...\n\nExample: Build a CRM with login, contacts dashboard, role-based access for admin and users, premium subscription with Stripe payments, and analytics for admins."}
                className="w-full bg-transparent text-gray-200 resize-none outline-none text-sm leading-relaxed"
                style={{ minHeight: 100, fontFamily: "inherit" }}
                disabled={isRunning}
              />
              <div className="flex items-center justify-between mt-4 pt-4" style={{ borderTop: "1px solid #1e293b" }}>
                <div className="flex flex-wrap gap-2">
                  {examples.map((p, i) => (
                    <button key={i} onClick={() => setUserInput(p)}
                      className="text-xs px-2 py-1 rounded bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors font-mono">
                      Example {i + 1}
                    </button>
                  ))}
                </div>
                <button onClick={handleRun} disabled={isRunning || !userInput.trim()}
                  className="px-6 py-2.5 rounded-lg text-sm font-bold font-mono transition-all"
                  style={{
                    background: isRunning || !userInput.trim()
                      ? "#1e293b"
                      : "linear-gradient(135deg,#6366f1,#8b5cf6)",
                    color: isRunning || !userInput.trim() ? "#475569" : "white",
                    cursor: isRunning || !userInput.trim() ? "not-allowed" : "pointer",
                  }}>
                  {isRunning ? "⚡ Compiling..." : "⚡ Compile App"}
                </button>
              </div>
            </div>

            {/* Stages */}
            <div>
              <div className="text-xs text-gray-500 font-mono mb-3 uppercase tracking-widest">Pipeline Stages</div>
              <div className="space-y-3">
                {stageConfig.map(({ key, icon, title }) => (
                  <StageCard key={key} icon={icon} title={title}
                    status={stages[key].status} result={stages[key].result} errors={stages[key].errors} />
                ))}
              </div>
            </div>

            {/* Metrics */}
            {metrics && <MetricsPanel metrics={metrics} />}

            {/* Schema + Export */}
            {finalResult && (
              <div style={{ border: "1px solid #1e293b", borderRadius: 12, background: "#0d1117" }} className="p-6">
                <SchemaViewer schema={finalResult} />

                {intentData?.assumptions?.length > 0 && (
                  <div className="mt-6 p-4 bg-yellow-900/20 border border-yellow-700/30 rounded-lg">
                    <div className="text-xs text-yellow-400 font-mono font-bold mb-2">⚠️ Assumptions Made</div>
                    <ul className="space-y-1">
                      {intentData.assumptions.map((a, i) => (
                        <li key={i} className="text-xs text-yellow-200 font-mono">• {a}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-4 flex gap-3">
                  <button
                    onClick={() => {
                      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
                      const url  = URL.createObjectURL(blob);
                      const a    = document.createElement("a");
                      a.href     = url;
                      a.download = `${intentData?.app_name || "app"}-schema.json`;
                      a.click();
                    }}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-mono rounded-lg transition-colors">
                    ⬇️ Export Full Schema JSON
                  </button>
                  <button onClick={() => setActiveView("raw")}
                    className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-mono rounded-lg transition-colors">
                    👁️ View Raw JSON
                  </button>
                </div>
              </div>
            )}
          </>
        )}

        {/* ── EVALUATION VIEW ── */}
        {activeView === "evaluation" && (
          <div style={{ border: "1px solid #1e293b", borderRadius: 12, background: "#0d1117" }} className="p-6">
            <EvaluationPanel onRunEval={handleEvalRun} />
          </div>
        )}

        {/* ── RAW VIEW ── */}
        {activeView === "raw" && (
          <div style={{ border: "1px solid #1e293b", borderRadius: 12, background: "#0d1117" }} className="p-6">
            <div className="text-xs text-gray-500 font-mono mb-3 uppercase tracking-widest">Raw Pipeline Output</div>
            {exportData ? (
              <pre className="text-xs text-green-300 font-mono leading-relaxed overflow-auto max-h-screen">
                {JSON.stringify(exportData, null, 2)}
              </pre>
            ) : (
              <div className="text-gray-600 font-mono text-sm">Run the compiler first to see raw output.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
