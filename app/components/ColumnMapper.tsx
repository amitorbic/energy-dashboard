// =============================================================================
// components/ColumnMapper.tsx
// Reusable column mapping component for any file upload.
// Usage:
//   <ColumnMapper
//     fileType="AR_SHEET"
//     onComplete={(result) => console.log(result)}
//   />
// =============================================================================

import { useState, useCallback } from "react";
import { useDropzone } from "react-dropzone";
import api from "../utils/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface SystemField {
  value: string;
  label: string;
  required: boolean;
}

interface DetectResponse {
  file_key: string;
  filename: string;
  file_type: string;
  columns: string[];
  sample_rows: Record<string, string>[];
  total_rows: number;
  suggested_mapping: Record<string, string>;
  is_saved_mapping: boolean;
  required_fields: string[];
  optional_fields: string[];
  system_fields: SystemField[];
}

export interface ImportResult {
  file_type: string;
  status: string;
  created?: number;
  updated?: number;
  processed?: number;
  skipped?: number;
  errors: Array<{ row: number; esiid: string; error: string }>;
}

interface Props {
  fileType: string; // AR_SHEET | PAYMENT_SHEET | BILLING_SHEET
  onComplete: (result: ImportResult) => void; // called when import finishes
  onCancel?: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ColumnMapper({
  fileType,
  onComplete,
  onCancel,
}: Props) {
  const [step, setStep] = useState<"upload" | "map" | "importing">("upload");
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [detected, setDetected] = useState<DetectResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saveMapping, setSaveMapping] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Upload + detect ────────────────────────────────────────────────────
  const onDrop = useCallback(
    async (accepted: File[]) => {
      const file = accepted[0];
      if (!file) return;
      setUploading(true);
      setError(null);

      const form = new FormData();
      form.append("file", file);

      try {
        const res = await api.post(
          `/imports/detect-columns?file_type=${fileType}`,
          form,
          { headers: { 'Content-Type': 'multipart/form-data' } },
        );
        const data: DetectResponse = res.data;
        setDetected(data);
        setMapping(data.suggested_mapping);
        setStep("map");
      } catch (e: unknown) {
        const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
        setError(detail || (e instanceof Error ? e.message : "Upload failed"));
      } finally {
        setUploading(false);
      }
    },
    [fileType],
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
        ".xlsx",
      ],
      "application/vnd.ms-excel": [".xls"],
      "text/csv": [".csv"],
    },
    maxFiles: 1,
    disabled: uploading,
  });

  // ── Commit ─────────────────────────────────────────────────────────────
  const handleCommit = async () => {
    if (!detected) return;

    const required = detected.required_fields;
    const mappedValues = Object.values(mapping).filter(
      (v) => v && v !== "skip",
    );
    const missing = required.filter((r) => !mappedValues.includes(r));

    if (missing.length > 0) {
      const missingLabels = missing.map(
        (m) => detected.system_fields.find((f) => f.value === m)?.label || m,
      );
      setError(`Required fields not mapped: ${missingLabels.join(", ")}`);
      return;
    }

    setCommitting(true);
    setStep("importing");
    setError(null);

    try {
      const res = await api.post('/imports/commit', {
        file_key: detected.file_key,
        file_type: fileType,
        filename: detected.filename,
        mapping,
        save_mapping: saveMapping,
      });
      const result: ImportResult = res.data;
      onComplete(result);
    } catch (e: unknown) {
      const detail = (e as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
      setError(detail || (e instanceof Error ? e.message : "Import failed"));
      setStep("map");
    } finally {
      setCommitting(false);
    }
  };

  // ── Computed ───────────────────────────────────────────────────────────
  const mappedValues = Object.values(mapping).filter((v) => v && v !== "skip");
  const requiredFields =
    detected?.system_fields.filter((f) => f.required) || [];
  const allRequiredMapped = requiredFields.every((f) =>
    mappedValues.includes(f.value),
  );

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      {/* UPLOAD */}
      {step === "upload" && (
        <div className="space-y-4">
          <div
            {...getRootProps()}
            className={`bg-white rounded-lg border-2 border-dashed cursor-pointer transition-colors p-14 text-center
              ${
                isDragActive
                  ? "border-sky-400 bg-sky-50"
                  : uploading
                    ? "border-gray-200 opacity-50 pointer-events-none"
                    : "border-gray-300 hover:border-sky-400 hover:bg-sky-50/30"
              }`}
          >
            <input {...getInputProps()} />
            {uploading ? (
              <div className="space-y-3">
                <div className="w-8 h-8 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="text-sm text-gray-500">Reading columns...</p>
              </div>
            ) : isDragActive ? (
              <p className="text-sky-600 font-medium">Drop it here</p>
            ) : (
              <div className="space-y-2">
                <div className="text-3xl text-gray-300">↑</div>
                <p className="text-sm font-medium text-gray-600">
                  Drag and drop your file
                </p>
                <p className="text-xs text-gray-400">
                  .xlsx · .xls · .csv · click to browse
                </p>
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded p-3 text-xs text-blue-700">
            Any column format works — map your columns to system fields in the
            next step. Your mapping saves automatically for next time.
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {onCancel && (
            <button
              onClick={onCancel}
              className="text-sm text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          )}
        </div>
      )}

      {/* MAP */}
      {step === "map" && detected && (
        <div className="space-y-4">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-700">
                {detected.filename}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">
                {detected.total_rows.toLocaleString()} rows ·{" "}
                {detected.columns.length} columns
                {detected.is_saved_mapping && (
                  <span className="ml-2 text-green-600">
                    ✓ Saved mapping applied
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setStep("upload");
                  setDetected(null);
                  setError(null);
                }}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
              >
                Back
              </button>
              <button
                onClick={handleCommit}
                disabled={!allRequiredMapped || committing}
                className="px-4 py-1.5 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded font-medium disabled:opacity-40 transition-colors"
              >
                Import {detected.total_rows.toLocaleString()} rows
              </button>
            </div>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-3 text-sm text-red-600">
              {error}
            </div>
          )}

          {/* Required field badges */}
          <div className="bg-white rounded-lg border border-gray-200 p-3">
            <p className="text-xs font-medium text-gray-500 mb-2">
              Required fields
            </p>
            <div className="flex flex-wrap gap-2">
              {requiredFields.map((f) => {
                const mapped = mappedValues.includes(f.value);
                return (
                  <span
                    key={f.value}
                    className={`px-2 py-0.5 rounded text-xs font-medium
                      ${mapped ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"}`}
                  >
                    {mapped ? "✓" : "✕"} {f.label}
                  </span>
                );
              })}
            </div>
          </div>

          {/* Column mapper table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div
              className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 grid grid-cols-2 gap-4
              text-xs font-medium text-gray-500 uppercase tracking-wide"
            >
              <span>Your column</span>
              <span>Maps to</span>
            </div>
            <div className="divide-y divide-gray-100 max-h-80 overflow-y-auto">
              {detected.columns.map((col) => {
                const currentVal = mapping[col] || "skip";
                const systemField = detected.system_fields.find(
                  (f) => f.value === currentVal,
                );
                const isRequired = systemField?.required;
                const isMapped = currentVal !== "skip";

                return (
                  <div
                    key={col}
                    className="px-4 py-2 grid grid-cols-2 gap-4 items-center hover:bg-gray-50"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">
                        {col}
                      </p>
                      {detected.sample_rows[0]?.[col] && (
                        <p className="text-xs text-gray-400 truncate">
                          e.g. {detected.sample_rows[0][col]}
                        </p>
                      )}
                    </div>
                    <select
                      value={currentVal}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [col]: e.target.value,
                        }))
                      }
                      className={`border rounded px-2 py-1.5 text-sm outline-none
                        focus:ring-2 focus:ring-sky-500 w-full transition-colors
                        ${
                          isMapped && isRequired
                            ? "border-green-400 bg-green-50 text-green-800"
                            : isMapped
                              ? "border-blue-300 bg-blue-50 text-blue-800"
                              : "border-gray-300 text-gray-500"
                        }`}
                    >
                      {detected.system_fields.map((f) => (
                        <option key={f.value} value={f.value}>
                          {f.label}
                          {f.required ? " *" : ""}
                        </option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Sample preview */}
          {detected.sample_rows.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
              <p className="text-xs font-medium text-gray-500 px-4 py-2.5 border-b border-gray-200">
                Sample data preview
              </p>
              <div className="overflow-x-auto">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      {detected.columns.map((col) => (
                        <th
                          key={col}
                          className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap"
                        >
                          <span className="text-gray-400">{col}</span>
                          {mapping[col] && mapping[col] !== "skip" && (
                            <span className="ml-1 text-sky-500">
                              → {mapping[col]}
                            </span>
                          )}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {detected.sample_rows.slice(0, 3).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {detected.columns.map((col) => (
                          <td
                            key={col}
                            className="px-3 py-1.5 text-gray-600 whitespace-nowrap max-w-[140px] truncate"
                          >
                            {row[col] || "—"}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Save mapping toggle */}
          <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={saveMapping}
              onChange={(e) => setSaveMapping(e.target.checked)}
              className="rounded accent-sky-500"
            />
            Save this mapping for future uploads
          </label>
        </div>
      )}

      {/* IMPORTING */}
      {step === "importing" && (
        <div className="py-16 text-center space-y-3">
          <div className="w-10 h-10 border-2 border-sky-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-gray-600">
            Importing {detected?.total_rows.toLocaleString()} rows...
          </p>
          <p className="text-xs text-gray-400">This may take a moment</p>
        </div>
      )}
    </div>
  );
}
