import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/router";
import { useDropzone } from "react-dropzone";
import {
  ArrowLeft,
  Upload,
  FileText,
  FileImage,
  File as FileIcon2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  X,
  Save,
  RefreshCw,
} from "lucide-react";
import { getToken, getUser, isLoggedIn } from "../utils/auth";
import api from "../utils/api";
import type { DocType, ExtractedField, ParseResult } from "./api/parse-document";

// ── Types ─────────────────────────────────────────────────────────────────────

type ParseStatus = "queued" | "parsing" | "done" | "error" | "saving" | "saved";

interface FileEntry {
  id: string;
  file: File;
  status: ParseStatus;
  result: ParseResult | null;
  edits: Record<string, string>;
  error?: string;
  template_id?: number;
  template_matched?: boolean;
}

// ── Field configs ─────────────────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  wide?: boolean;
  multiline?: boolean;
}

const UTILITY_BILL_FIELDS: FieldDef[] = [
  // Identity
  { key: "esid",           label: "ESI ID / Premise ID" },
  { key: "account_number", label: "Account Number" },
  // Billing summary
  { key: "bill_amount",    label: "Total Bill Amount" },
  { key: "due_date",       label: "Due Date" },
  { key: "usage_kwh",      label: "Usage (kWh)" },
  // Rates ($/kWh)
  { key: "energy_rate",        label: "Energy Rate ($/kWh)" },
  { key: "tdsp_rate",          label: "TDSP Delivery Rate ($/kWh)" },
  { key: "total_average_rate", label: "Total Avg Rate ($/kWh)" },
  // Charge subtotals ($)
  { key: "energy_charges", label: "Energy Charges ($)" },
  { key: "tdsp_charges",   label: "TDSP Charges ($)" },
  { key: "extra_charges",  label: "Extra / Non-standard Charges", wide: true, multiline: true },
  // Provider & location
  { key: "provider_name",  label: "Retail Electric Provider (REP)" },
  { key: "service_address", label: "Service Address", wide: true },
  { key: "service_zip",    label: "Service ZIP" },
  { key: "tdsp_name",      label: "TDSP (Wire Company)" },
  { key: "pricing_zone",   label: "ERCOT Pricing Zone" },
];

const CONTRACT_FIELDS: FieldDef[] = [
  { key: "competitor_name", label: "Competitor / Supplier Name", wide: true },
  { key: "rate", label: "Rate ($/kWh)" },
  { key: "contract_term_months", label: "Term (months)" },
  { key: "pricing_type", label: "Pricing Type (fixed / index)" },
  { key: "early_termination_fee", label: "Early Termination Fee" },
  { key: "auto_renewal", label: "Auto-Renewal (yes / no)" },
  { key: "capacity_charges", label: "Capacity Charges" },
  { key: "swing_limits", label: "Swing Limits" },
  { key: "hidden_charges", label: "Hidden Charges", wide: true, multiline: true },
  { key: "what_is_missing", label: "What ORBIC Offers (Not in Contract)", wide: true, multiline: true },
];

function getFieldConfig(docType: DocType): FieldDef[] {
  if (docType === "utility_bill") return UTILITY_BILL_FIELDS;
  if (docType === "contract") return CONTRACT_FIELDS;
  return [];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(1)} MB`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const r = reader.result as string;
      resolve(r.includes(",") ? r.split(",")[1] : r);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function editsFromResult(result: ParseResult): Record<string, string> {
  const edits: Record<string, string> = {};
  for (const [k, v] of Object.entries(result.fields)) {
    edits[k] = (v as ExtractedField).value ?? "";
  }
  return edits;
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfidencePill({ score }: { score: number }) {
  const cls =
    score >= 80
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : score >= 50
        ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
        : "bg-red-500/15 text-red-400 border-red-500/30";
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded border font-mono shrink-0 ${cls}`}>
      {score}%
    </span>
  );
}

function DocTypePill({ type }: { type: DocType }) {
  if (type === "utility_bill")
    return (
      <span className="text-xs bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-0.5 rounded-full">
        Utility Bill
      </span>
    );
  if (type === "contract")
    return (
      <span className="text-xs bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-full">
        Contract
      </span>
    );
  return (
    <span className="text-xs bg-slate-500/20 text-slate-400 border border-slate-500/30 px-2 py-0.5 rounded-full">
      Unknown
    </span>
  );
}

function StatusPill({ status }: { status: ParseStatus }) {
  switch (status) {
    case "queued":
      return (
        <span className="text-xs text-slate-500 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-slate-600 inline-block" />
          Queued
        </span>
      );
    case "parsing":
      return (
        <span className="text-xs text-blue-400 flex items-center gap-1">
          <Loader2 size={11} className="animate-spin" />
          Analyzing…
        </span>
      );
    case "done":
      return (
        <span className="text-xs text-emerald-400 flex items-center gap-1">
          <CheckCircle2 size={11} />
          Ready
        </span>
      );
    case "error":
      return (
        <span className="text-xs text-red-400 flex items-center gap-1">
          <AlertCircle size={11} />
          Error
        </span>
      );
    case "saving":
      return (
        <span className="text-xs text-blue-400 flex items-center gap-1">
          <Loader2 size={11} className="animate-spin" />
          Saving…
        </span>
      );
    case "saved":
      return (
        <span className="text-xs text-emerald-400 flex items-center gap-1">
          <CheckCircle2 size={11} />
          Saved
        </span>
      );
  }
}

function FileTypeIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png"].includes(ext))
    return <FileImage size={15} className="text-sky-400 shrink-0" />;
  if (ext === "pdf")
    return <FileText size={15} className="text-red-400 shrink-0" />;
  if (ext === "docx")
    return <FileText size={15} className="text-blue-300 shrink-0" />;
  return <FileIcon2 size={15} className="text-slate-400 shrink-0" />;
}

// ── Entry card ────────────────────────────────────────────────────────────────

interface EntryCardProps {
  entry: FileEntry;
  onUpdateField: (id: string, key: string, val: string) => void;
  onSetDocType: (id: string, type: DocType) => void;
  onSave: (id: string) => void;
  onRemove: (id: string) => void;
  onRetry: (id: string) => void;
}

function EntryCard({
  entry,
  onUpdateField,
  onSetDocType,
  onSave,
  onRemove,
  onRetry,
}: EntryCardProps) {
  const { id, file, status, result, edits, error } = entry;
  const fields = result ? getFieldConfig(result.doc_type) : [];
  const isBusy = status === "parsing" || status === "saving";

  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden bg-slate-900/40">
      {/* Card header */}
      <div className="flex items-center gap-3 px-5 py-3 bg-slate-800/60">
        <FileTypeIcon name={file.name} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-white truncate">{file.name}</p>
          <p className="text-xs text-slate-500 mt-0.5">{formatBytes(file.size)}</p>
        </div>
        {result && <DocTypePill type={result.doc_type} />}
        <StatusPill status={status} />
        {status === "error" && (
          <button
            onClick={() => onRetry(id)}
            className="text-slate-500 hover:text-slate-300 transition-colors ml-1"
            title="Retry"
          >
            <RefreshCw size={13} />
          </button>
        )}
        <button
          onClick={() => onRemove(id)}
          className="text-slate-600 hover:text-slate-300 transition-colors ml-1"
          title="Remove"
        >
          <X size={14} />
        </button>
      </div>

      {/* Parsing skeleton */}
      {status === "parsing" && (
        <div className="px-5 py-10 flex flex-col items-center gap-3 text-slate-500 text-sm">
          <Loader2 size={20} className="animate-spin text-violet-400" />
          <p>AI is analyzing your document…</p>
        </div>
      )}

      {/* Error state */}
      {status === "error" && error && (
        <div className="px-5 py-4 border-t border-red-500/20 bg-red-500/5 flex items-start gap-3 text-red-400 text-sm">
          <AlertCircle size={14} className="shrink-0 mt-0.5" />
          <p>{error}</p>
        </div>
      )}

      {/* Unknown doc type — ask user to select */}
      {result?.doc_type === "unknown" && status === "done" && (
        <div className="px-5 py-4 border-t border-slate-700 bg-amber-500/5">
          <p className="text-sm text-amber-400 mb-3">
            Could not determine document type automatically. Select one to see fields:
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => onSetDocType(id, "utility_bill")}
              className="text-xs bg-amber-500/20 hover:bg-amber-500/30 text-amber-400 border border-amber-500/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              Utility Bill
            </button>
            <button
              onClick={() => onSetDocType(id, "contract")}
              className="text-xs bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 border border-blue-500/30 px-3 py-1.5 rounded-lg transition-colors"
            >
              Contract
            </button>
          </div>
        </div>
      )}

      {/* Extracted fields */}
      {result && result.doc_type !== "unknown" && (
        <div className="px-5 py-4 border-t border-slate-700/60">
          {/* Template matched badge */}
          {entry.template_matched && (
            <div className="flex items-center gap-2 mb-3 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
              <CheckCircle2 size={12} />
              Provider template matched — extraction guided by past successful parses
            </div>
          )}

          {/* Doc type toggle */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-xs text-slate-500">Type:</span>
            <button
              onClick={() => onSetDocType(id, "utility_bill")}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                result.doc_type === "utility_bill"
                  ? "bg-amber-500/20 text-amber-400 border-amber-500/30"
                  : "text-slate-500 border-slate-700 hover:border-slate-500"
              }`}
            >
              Utility Bill
            </button>
            <button
              onClick={() => onSetDocType(id, "contract")}
              className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                result.doc_type === "contract"
                  ? "bg-blue-500/20 text-blue-400 border-blue-500/30"
                  : "text-slate-500 border-slate-700 hover:border-slate-500"
              }`}
            >
              Contract
            </button>
            <span className="text-xs text-slate-600 ml-auto">
              Edit any field before saving
            </span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {fields.map(({ key, label, wide, multiline }) => {
              const field = result.fields[key] as ExtractedField | undefined;
              const confidence = field?.confidence ?? 0;
              const borderColor =
                confidence >= 80
                  ? "border-slate-700 focus:border-emerald-500"
                  : confidence >= 50
                    ? "border-amber-500/40 focus:border-amber-400"
                    : confidence > 0
                      ? "border-red-500/40 focus:border-red-400"
                      : "border-slate-700 focus:border-blue-500";

              return (
                <div key={key} className={wide ? "col-span-2" : ""}>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs text-slate-400">{label}</label>
                    {field && <ConfidencePill score={confidence} />}
                  </div>
                  {multiline ? (
                    <textarea
                      rows={3}
                      value={edits[key] ?? ""}
                      onChange={(e) => onUpdateField(id, key, e.target.value)}
                      disabled={isBusy || status === "saved"}
                      placeholder={confidence === 0 ? "Not found — enter manually or leave blank" : ""}
                      className={`w-full text-sm bg-slate-950 border rounded-lg px-3 py-1.5 text-white placeholder-slate-600 focus:outline-none transition-colors disabled:opacity-60 resize-none font-mono ${borderColor}`}
                    />
                  ) : (
                    <input
                      value={edits[key] ?? ""}
                      onChange={(e) => onUpdateField(id, key, e.target.value)}
                      disabled={isBusy || status === "saved"}
                      placeholder={confidence === 0 ? "Not found — enter manually" : ""}
                      className={`w-full text-sm bg-slate-950 border rounded-lg px-3 py-1.5 text-white placeholder-slate-600 focus:outline-none transition-colors disabled:opacity-60 ${borderColor}`}
                    />
                  )}
                </div>
              );
            })}
          </div>

          {/* Confidence legend */}
          <div className="flex items-center gap-4 mt-4 mb-3 text-xs text-slate-600">
            <span className="flex items-center gap-1">
              <span className="text-emerald-400 font-mono">90%+</span> High confidence
            </span>
            <span className="flex items-center gap-1">
              <span className="text-amber-400 font-mono">50–89%</span> Medium
            </span>
            <span className="flex items-center gap-1">
              <span className="text-red-400 font-mono">&lt;50%</span> Low / not found
            </span>
          </div>

          {/* Confirm button */}
          <div className="flex items-center justify-end gap-3 pt-1 border-t border-slate-800">
            {status === "saved" ? (
              <div className="flex items-center gap-2 text-emerald-400 text-sm">
                <CheckCircle2 size={15} />
                Saved to database
              </div>
            ) : (
              <button
                onClick={() => onSave(id)}
                disabled={isBusy}
                className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm px-4 py-2 rounded-lg transition-colors mt-3"
              >
                {status === "saving" ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                {status === "saving" ? "Saving…" : "Confirm & Save"}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

const MAX_FILE_BYTES = 7 * 1024 * 1024; // 7 MB (fits in 10 MB base64 limit)

export default function DocumentParserPage() {
  const router = useRouter();
  const [entries, setEntries] = useState<FileEntry[]>([]);
  const [username, setUsername] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    const u = getUser();
    if (u) setUsername(u.username);
  }, [router]);

  // ── Parse a single file ─────────────────────────────────────────────────────

  const parseFile = useCallback(async (id: string, file: File) => {
    if (file.size > MAX_FILE_BYTES) {
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: "error",
                error: `File too large (max ${formatBytes(MAX_FILE_BYTES)}). Compress or split the document.`,
              }
            : e
        )
      );
      return;
    }

    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "parsing" } : e))
    );

    try {
      const data = await fileToBase64(file);
      const res = await fetch("/api/parse-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          data,
          filename: file.name,
          mimeType: file.type || "application/octet-stream",
          token: getToken() ?? "",
        }),
      });

      const json = await res.json() as ParseResult & { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Parsing failed");

      setEntries((prev) =>
        prev.map((e) =>
          e.id === id
            ? {
                ...e,
                status: "done",
                result: json,
                edits: editsFromResult(json),
                template_id: json.template_id,
                template_matched: json.template_matched ?? false,
              }
            : e
        )
      );
    } catch (err) {
      const error = err instanceof Error ? err.message : "Parsing failed";
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "error", error } : e))
      );
    }
  }, []);

  // ── Drop handler ────────────────────────────────────────────────────────────

  const onDrop = useCallback(
    (accepted: File[]) => {
      const newEntries: FileEntry[] = accepted.map((file) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        file,
        status: "queued" as const,
        result: null,
        edits: {},
      }));
      setEntries((prev) => [...prev, ...newEntries]);
      newEntries.forEach((e) => parseFile(e.id, e.file));
    },
    [parseFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/jpeg": [".jpg", ".jpeg"],
      "image/png": [".png"],
      "application/pdf": [".pdf"],
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document":
        [".docx"],
    },
    multiple: true,
  });

  // ── Field editing ───────────────────────────────────────────────────────────

  const updateField = (id: string, key: string, val: string) => {
    setEntries((prev) =>
      prev.map((e) =>
        e.id === id ? { ...e, edits: { ...e.edits, [key]: val } } : e
      )
    );
  };

  const setDocType = (id: string, type: DocType) => {
    setEntries((prev) =>
      prev.map((e) => {
        if (e.id !== id || !e.result) return e;
        const newResult: ParseResult = { ...e.result, doc_type: type };
        const fieldConfig = getFieldConfig(type);
        const newEdits: Record<string, string> = {};
        fieldConfig.forEach(({ key }) => {
          newEdits[key] = e.result!.fields[key]?.value ?? "";
        });
        return { ...e, result: newResult, edits: newEdits };
      })
    );
  };

  // ── Save ────────────────────────────────────────────────────────────────────

  const saveEntry = async (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (!entry?.result) return;

    setEntries((prev) =>
      prev.map((e) => (e.id === id ? { ...e, status: "saving" } : e))
    );

    // Compute which fields the user corrected vs the original AI extraction
    const user_corrections: Record<string, boolean> = {};
    for (const [key, val] of Object.entries(entry.edits)) {
      const original = entry.result.fields[key]?.value ?? "";
      user_corrections[key] = val !== original;
    }

    try {
      await api.post("/document-parser/save", {
        doc_type: entry.result.doc_type,
        fields: entry.edits,
        filename: entry.file.name,
        raw_extracted: entry.result,
        template_id: entry.template_id ?? null,
        user_corrections,
      });
      setEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "saved" } : e))
      );
    } catch (err: unknown) {
      const axErr = err as {
        response?: { status?: number; data?: { detail?: string } };
      };
      const httpStatus = axErr.response?.status;
      const msg =
        httpStatus === 404
          ? "Save endpoint not yet configured on the server — contact your backend team"
          : axErr.response?.data?.detail ?? "Save failed";
      setEntries((prev) =>
        prev.map((e) =>
          e.id === id ? { ...e, status: "error", error: msg } : e
        )
      );
    }
  };

  // ── Entry actions ───────────────────────────────────────────────────────────

  const removeEntry = (id: string) => {
    setEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const retryEntry = (id: string) => {
    const entry = entries.find((e) => e.id === id);
    if (entry) parseFile(id, entry.file);
  };

  // ── Stats ───────────────────────────────────────────────────────────────────

  const doneCount = entries.filter((e) => e.status === "done" || e.status === "saved").length;
  const savedCount = entries.filter((e) => e.status === "saved").length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-900/90 backdrop-blur-sm">
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="text-slate-500 hover:text-white transition-colors p-1 rounded"
          >
            <ArrowLeft size={17} />
          </button>
          <div className="flex items-center gap-2">
            <div className="bg-violet-600 rounded-lg p-1.5">
              <Sparkles size={13} />
            </div>
            <span className="font-bold text-sm">Document Parser</span>
            <span className="text-slate-500 text-xs">· ORBIC AI Vision</span>
          </div>
          <div className="ml-auto flex items-center gap-4">
            {entries.length > 0 && (
              <span className="text-xs text-slate-500">
                {doneCount}/{entries.length} parsed
                {savedCount > 0 && ` · ${savedCount} saved`}
              </span>
            )}
            {username && (
              <span className="text-xs text-slate-500">{username}</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-8 space-y-5">
        {/* Drop zone */}
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-all ${
            isDragActive
              ? "border-violet-500 bg-violet-500/10"
              : "border-slate-700 hover:border-slate-600 hover:bg-slate-800/20"
          }`}
        >
          <input {...getInputProps()} />
          <Upload
            size={28}
            className={`mx-auto mb-3 transition-colors ${isDragActive ? "text-violet-400" : "text-slate-500"}`}
          />
          {isDragActive ? (
            <p className="text-violet-300 font-medium">Drop to analyze…</p>
          ) : (
            <>
              <p className="text-slate-300 font-medium">
                Drag & drop files here, or click to browse
              </p>
              <p className="text-slate-500 text-sm mt-1">
                PDF · JPG · PNG · DOCX · Multiple files supported
              </p>
              <div className="flex items-center justify-center gap-6 mt-5 text-xs text-slate-600">
                <span className="flex items-center gap-1.5">
                  <FileText size={12} className="text-amber-500/60" />
                  Utility Bills
                </span>
                <span className="text-slate-700">·</span>
                <span className="flex items-center gap-1.5">
                  <FileText size={12} className="text-blue-500/60" />
                  Contracts
                </span>
                <span className="text-slate-700">·</span>
                <span className="flex items-center gap-1.5">
                  <FileImage size={12} className="text-sky-500/60" />
                  Images
                </span>
              </div>
            </>
          )}
        </div>

        {/* Clear all */}
        {entries.length > 1 && (
          <div className="flex justify-end">
            <button
              onClick={() => setEntries([])}
              className="text-xs text-slate-600 hover:text-slate-400 transition-colors"
            >
              Clear all ({entries.length})
            </button>
          </div>
        )}

        {/* File entries */}
        <div className="space-y-4">
          {entries.map((entry) => (
            <EntryCard
              key={entry.id}
              entry={entry}
              onUpdateField={updateField}
              onSetDocType={setDocType}
              onSave={saveEntry}
              onRemove={removeEntry}
              onRetry={retryEntry}
            />
          ))}
        </div>

        {/* Empty hint */}
        {entries.length === 0 && (
          <div className="text-center py-6 text-slate-600 text-xs space-y-1">
            <p>Supports utility bills (PDF, JPG, PNG) and contracts (PDF, DOCX)</p>
            <p>AI auto-detects document type and extracts key fields with confidence scores</p>
          </div>
        )}
      </main>
    </div>
  );
}
