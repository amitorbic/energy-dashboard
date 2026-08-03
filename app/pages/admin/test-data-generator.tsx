import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import api from "../../utils/api";
import { getUser, isAdmin, isLoggedIn, User } from "../../utils/auth";

// ── types ─────────────────────────────────────────────────────────────────────

interface GeneratedFile {
  filename: string;
  edi_type: string;
  interchange_control: string;
  content: string;
}

interface SkippedEsi {
  esi_id: string;
  reason: string;
}

interface GenerateResult {
  files: GeneratedFile[];
  matched_esi_ids: string[];
  skipped: SkippedEsi[];
}

const DEFAULT_CHARGE_CODES = ["TRN002", "BAS003", "MSC025", "BAS001", "DIS001", "MSC041", "MSC042", "MSC024"];

// ── small helpers ─────────────────────────────────────────────────────────────

function Spinner({ sm }: { sm?: boolean }) {
  const cls = sm ? "w-3.5 h-3.5" : "w-4 h-4";
  return (
    <svg className={`${cls} animate-spin`} viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div
        onClick={() => onChange(!checked)}
        className="relative w-8 h-4 rounded-full transition-colors"
        style={{ background: checked ? "var(--accent-light)" : "var(--ct-border-strong)" }}
      >
        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-4" : "translate-x-0.5"}`} />
      </div>
      <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{label}</span>
    </label>
  );
}

function defaultDates() {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 30);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  return { start: iso(start), end: iso(end) };
}

function downloadFile(f: GeneratedFile) {
  const blob = new Blob([f.content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = f.filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function AdminTestDataGenerator() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [esiText, setEsiText] = useState("");
  const [want867, setWant867] = useState(true);
  const [want810, setWant810] = useState(true);
  const [dates, setDates] = useState(defaultDates());
  const [chargeCodes, setChargeCodes] = useState<string[]>(DEFAULT_CHARGE_CODES);

  const [generating, setGenerating] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<GenerateResult | null>(null);

  // auth gate
  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    const u = getUser();
    setUser(u);
    setAuthChecked(true);
    if (!isAdmin()) return; // will render access denied below
  }, []);

  const toggleCode = (code: string) => {
    setChargeCodes((prev) => (prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]));
  };

  const generate = async () => {
    const esi_ids = esiText
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);

    if (esi_ids.length === 0) {
      setErr("Enter at least one ESI ID.");
      return;
    }
    const file_types = [want867 && "867", want810 && "810"].filter(Boolean) as string[];
    if (file_types.length === 0) {
      setErr("Select at least one file type (867 and/or 810).");
      return;
    }

    setGenerating(true);
    setErr("");
    setResult(null);
    try {
      const res = await api.post("/admin/test-data/generate-edi", {
        esi_ids,
        file_types,
        service_start: dates.start,
        service_end: dates.end,
        charge_codes: want810 ? chargeCodes : undefined,
      });
      setResult(res.data);
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  // ── render ──────────────────────────────────────────────────────────────────

  if (!authChecked) return null;

  if (!isAdmin()) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ct-canvas)" }}>
        <div className="text-center">
          <p className="font-semibold text-lg" style={{ color: "var(--danger-light)" }}>Access denied</p>
          <p className="text-sm mt-1" style={{ color: "var(--ct-text-muted)" }}>This section requires admin privileges.</p>
          <button
            onClick={() => router.push("/")}
            className="mt-4 text-xs underline hover:opacity-80"
            style={{ color: "var(--accent-light)" }}
          >
            Back to dashboard
          </button>
        </div>
      </div>
    );
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--ct-surface)",
    borderColor: "var(--ct-border-default)",
    color: "var(--ct-text-primary)",
  };
  const inputCls =
    "w-full border text-xs rounded-[var(--r-sm)] px-2.5 py-1.5 outline-none focus:border-[var(--accent-light)]";
  const labelCls = "block text-[10px] uppercase tracking-wide mb-1";

  return (
    <div className="min-h-screen" style={{ background: "var(--ct-canvas)" }}>
      <div className="fixed inset-0 bg-[linear-gradient(rgba(16,23,40,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(16,23,40,0.025)_1px,transparent_1px)] bg-[size:48px_48px] pointer-events-none" />

      {/* header */}
      <header className="relative z-10 border-b backdrop-blur-sm" style={{ borderColor: "var(--ct-border-default)", background: "rgba(255,255,255,0.9)" }}>
        <div className="max-w-screen-xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="text-xs transition-colors hover:opacity-80"
              style={{ color: "var(--ct-text-muted)" }}
            >
              ← Dashboard
            </button>
            <span style={{ color: "var(--ct-border-strong)" }}>|</span>
            <span
              className="text-xs px-2 py-0.5 rounded-[var(--r-sm)] font-medium border"
              style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}
            >
              Admin
            </span>
            <span className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>EDI Test Data Generator</span>
          </div>
          {user && <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{user.username}</span>}
        </div>
      </header>

      <main className="relative z-10 max-w-screen-xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-lg font-bold" style={{ color: "var(--ct-text-primary)" }}>EDI Test Data Generator</h1>
          <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
            Generates realistic synthetic 867_03 / 810_02 EDI files for real ESI IDs (matched against contract_renewal).
            Files are download-only — nothing is uploaded automatically. Test the real pipeline via the{" "}
            <button onClick={() => router.push("/billing/upload")} className="underline hover:opacity-80" style={{ color: "var(--accent-light)" }}>
              Billing Upload
            </button>{" "}
            page.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-5">
          {/* left: form */}
          <div className="col-span-1">
            <div className="rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <h3 className="text-sm font-semibold mb-4" style={{ color: "var(--ct-text-primary)" }}>Generate Files</h3>

              <div className="space-y-3">
                <div>
                  <label className={labelCls} style={{ color: "var(--ct-text-muted)" }}>ESI IDs (one per line, or comma-separated) *</label>
                  <textarea
                    value={esiText}
                    onChange={(e) => setEsiText(e.target.value)}
                    rows={6}
                    placeholder={"1008901001900201400108\n1008901003250611775100"}
                    className={`${inputCls} font-mono`}
                    style={inputStyle}
                  />
                </div>

                <div className="flex items-center gap-4">
                  <Toggle checked={want867} onChange={setWant867} label="867_03 (usage)" />
                  <Toggle checked={want810} onChange={setWant810} label="810_02 (billing)" />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelCls} style={{ color: "var(--ct-text-muted)" }}>Service start</label>
                    <input
                      type="date"
                      value={dates.start}
                      onChange={(e) => setDates({ ...dates, start: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label className={labelCls} style={{ color: "var(--ct-text-muted)" }}>Service end</label>
                    <input
                      type="date"
                      value={dates.end}
                      onChange={(e) => setDates({ ...dates, end: e.target.value })}
                      className={inputCls}
                      style={inputStyle}
                    />
                  </div>
                </div>

                {want810 && (
                  <div>
                    <label className={labelCls} style={{ color: "var(--ct-text-muted)" }}>810 charge codes</label>
                    <div className="flex flex-wrap gap-1.5">
                      {DEFAULT_CHARGE_CODES.map((code) => (
                        <button
                          key={code}
                          onClick={() => toggleCode(code)}
                          className="text-[10px] font-mono px-1.5 py-0.5 rounded-[var(--r-sm)] border transition-colors hover:opacity-80"
                          style={chargeCodes.includes(code)
                            ? { borderColor: "var(--accent-light)", background: "var(--accent-light-tint)", color: "var(--accent-light)" }
                            : { borderColor: "var(--ct-border-default)", color: "var(--ct-text-muted)" }}
                        >
                          {code}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {err && <p className="mt-3 text-xs" style={{ color: "var(--danger-light)" }}>{err}</p>}

              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={generate}
                  disabled={generating}
                  className="flex items-center gap-2 px-4 py-1.5 text-xs font-semibold rounded-[var(--r-sm)] transition-colors disabled:opacity-40 hover:opacity-90"
                  style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                >
                  {generating && <Spinner sm />}
                  Generate
                </button>
              </div>
            </div>
          </div>

          {/* right: results */}
          <div className="col-span-2 space-y-4">
            <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <div className="px-4 py-3 border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                <span className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>Results</span>
              </div>

              {generating ? (
                <div className="px-4 py-10 flex justify-center">
                  <Spinner />
                </div>
              ) : !result ? (
                <div className="px-4 py-8 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
                  No files generated yet.
                </div>
              ) : (
                <div className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                  {result.files.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--ct-text-muted)" }}>
                        Generated files ({result.matched_esi_ids.length} ESI{result.matched_esi_ids.length === 1 ? "" : "s"})
                      </p>
                      <div className="space-y-2">
                        {result.files.map((f) => (
                          <div
                            key={f.interchange_control}
                            className="flex items-center justify-between rounded-[var(--r-sm)] border px-3 py-2"
                            style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}
                          >
                            <div>
                              <span className="font-mono text-xs" style={{ color: "var(--accent-light)" }}>{f.filename}</span>
                              <span className="ml-2 text-[10px]" style={{ color: "var(--ct-text-muted)" }}>
                                {f.edi_type} · interchange {f.interchange_control}
                              </span>
                            </div>
                            <button
                              onClick={() => downloadFile(f)}
                              className="text-xs px-2.5 py-1 rounded-[var(--r-sm)] transition-colors hover:opacity-90"
                              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                            >
                              Download
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.skipped.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--amber-light)" }}>
                        Skipped ({result.skipped.length})
                      </p>
                      <div className="space-y-1">
                        {result.skipped.map((s) => (
                          <div key={s.esi_id} className="text-xs flex items-start gap-2">
                            <span className="font-mono" style={{ color: "var(--ct-text-secondary)" }}>{s.esi_id}</span>
                            <span style={{ color: "var(--ct-text-muted)" }}>— {s.reason}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {result.files.length > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-[10px] font-medium uppercase tracking-wide mb-2" style={{ color: "var(--ct-text-muted)" }}>Preview</p>
                      {result.files.map((f) => (
                        <details key={f.interchange_control} className="mb-2">
                          <summary className="text-xs cursor-pointer hover:opacity-80" style={{ color: "var(--ct-text-muted)" }}>
                            {f.filename}
                          </summary>
                          <pre
                            className="mt-1.5 text-[10px] font-mono border rounded-[var(--r-sm)] p-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre"
                            style={{ color: "var(--ct-text-secondary)", background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}
                          >
                            {f.content}
                          </pre>
                        </details>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
