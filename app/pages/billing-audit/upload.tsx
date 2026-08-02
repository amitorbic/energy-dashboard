import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import BillingLayout from "../../components/BillingLayout";
import api from "../../utils/api";

type UploadState = "idle" | "uploading" | "success" | "error";

export default function BillingUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [uploadId, setUploadId] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [history, setHistory] = useState<any[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // ── drag & drop ────────────────────────────────────────────────────────────
  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const onDragLeave = useCallback(() => setDragOver(false), []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) validateAndSet(dropped);
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) validateAndSet(picked);
  };

  const validateAndSet = (f: File) => {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (ext !== "xls" && ext !== "xlsx") {
      setErrorMsg("Only .xls or .xlsx files are accepted.");
      setFile(null);
      return;
    }
    setErrorMsg("");
    setFile(f);
    setUploadState("idle");
  };

  // ── submit ─────────────────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!file) return;
    setUploadState("uploading");
    setErrorMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post("/billing/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadId(res.data.upload_id);
      setUploadState("success");
    } catch (err: any) {
      setErrorMsg(
        err?.response?.data?.detail || "Upload failed. Please try again.",
      );
      setUploadState("error");
    }
  };

  // ── history ────────────────────────────────────────────────────────────────
  const loadHistory = async () => {
    if (showHistory) {
      setShowHistory(false);
      return;
    }
    setLoadingHistory(true);
    try {
      const res = await api.get("/billing/history");
      setHistory(res.data);
      setShowHistory(true);
    } catch {
      setErrorMsg("Could not load history.");
    } finally {
      setLoadingHistory(false);
    }
  };

  const reset = () => {
    setFile(null);
    setUploadState("idle");
    setUploadId(null);
    setErrorMsg("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <BillingLayout title="Billing Audit">
      <div className="max-w-xl">
        <h2 className="text-base font-semibold mb-6" style={{ color: "var(--ct-text-primary)" }}>
          Upload Billing File
        </h2>

        {/* ── success state ── */}
        {uploadState === "success" ? (
          <div className="rounded-[var(--r-lg)] border p-6 text-center space-y-4" style={{ borderColor: "var(--success-light-tint)", background: "var(--success-light-tint)" }}>
            <div className="flex items-center justify-center w-12 h-12 rounded-full mx-auto" style={{ background: "var(--ct-surface)" }}>
              <svg
                className="w-6 h-6"
                style={{ color: "var(--success-light)" }}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium" style={{ color: "var(--success-light)" }}>
                File uploaded successfully
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--success-light)" }}>
                {file?.name} — Upload ID #{uploadId}
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => router.push("/billing-audit/exceptions/last")}
                className="px-4 py-2 text-sm rounded-[var(--r-sm)] font-medium transition-colors"
                style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
              >
                View Exceptions
              </button>
              <button
                onClick={reset}
                className="px-4 py-2 text-sm rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
                style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
              >
                Upload Another
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── drop zone ── */}
            <div
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
              className="relative border-2 border-dashed rounded-[var(--r-lg)] p-10 text-center cursor-pointer transition-colors"
              style={dragOver || file
                ? { borderColor: "var(--accent-light)", background: "var(--accent-light-tint)" }
                : { borderColor: "var(--ct-border-default)", background: "var(--ct-surface)" }}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xls,.xlsx"
                onChange={onFileChange}
                className="hidden"
              />

              {file ? (
                <div className="space-y-1">
                  <div className="flex items-center justify-center gap-2">
                    <svg
                      className="w-5 h-5"
                      style={{ color: "var(--accent-light)" }}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    <span className="text-sm font-medium" style={{ color: "var(--ct-text-primary)" }}>
                      {file.name}
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                    {(file.size / 1024).toFixed(1)} KB — click to change
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <svg
                    className="w-10 h-10 mx-auto"
                    style={{ color: "var(--ct-text-muted)" }}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  <p className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
                    Drag & drop your billing extract here
                  </p>
                  <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>or click to browse</p>
                  <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>.xls or .xlsx only</p>
                </div>
              )}
            </div>

            {/* ── error ── */}
            {errorMsg && (
              <p className="mt-3 text-sm" style={{ color: "var(--danger-light)" }}>{errorMsg}</p>
            )}

            {/* ── submit ── */}
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={!file || uploadState === "uploading"}
                className="px-5 py-2 text-sm rounded-[var(--r-sm)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
              >
                {uploadState === "uploading" ? (
                  <>
                    <svg
                      className="w-4 h-4 animate-spin"
                      viewBox="0 0 24 24"
                      fill="none"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                    Processing...
                  </>
                ) : (
                  "Upload & Run Checks"
                )}
              </button>

              {file && uploadState === "idle" && (
                <button
                  onClick={reset}
                  className="px-4 py-2 text-sm transition-colors hover:text-[var(--ct-text-secondary)]"
                  style={{ color: "var(--ct-text-muted)" }}
                >
                  Clear
                </button>
              )}
            </div>
          </>
        )}

        {/* ── upload history toggle ── */}
        <div className="mt-8 border-t pt-6" style={{ borderColor: "var(--ct-border-default)" }}>
          <button
            onClick={loadHistory}
            className="text-sm flex items-center gap-1 transition-colors hover:text-[var(--ct-text-secondary)]"
            style={{ color: "var(--ct-text-muted)" }}
          >
            <svg
              className={`w-4 h-4 transition-transform ${showHistory ? "rotate-90" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
            {loadingHistory
              ? "Loading..."
              : showHistory
                ? "Hide upload history"
                : "View upload history"}
          </button>

          {showHistory && history.length > 0 && (
            <div className="mt-4 rounded-[var(--r-lg)] border overflow-hidden" style={{ borderColor: "var(--ct-border-default)" }}>
              <table className="w-full text-sm">
                <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Date
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      File
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Uploaded by
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Rows
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                      Email
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}></th>
                  </tr>
                </thead>
                <tbody style={{ background: "var(--ct-surface)" }}>
                  {history.map((h: any) => (
                    <tr key={h.id} className="border-t hover:bg-[var(--ct-surface-hover)]" style={{ borderColor: "var(--ct-border-subtle)" }}>
                      <td className="px-4 py-2.5 whitespace-nowrap" style={{ color: "var(--ct-text-primary)" }}>
                        {h.upload_date}
                      </td>
                      <td
                        className="px-4 py-2.5 max-w-[160px] truncate"
                        style={{ color: "var(--ct-text-secondary)" }}
                        title={h.filename}
                      >
                        {h.filename}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: "var(--ct-text-secondary)" }}>
                        {h.uploaded_by}
                      </td>
                      <td className="px-4 py-2.5" style={{ color: "var(--ct-text-secondary)" }}>
                        {h.total_rows}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-medium"
                          style={h.email_sent
                            ? { background: "var(--success-light-tint)", color: "var(--success-light)" }
                            : { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
                        >
                          {h.email_sent ? "Sent" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() =>
                            router.push(
                              `/billing-audit/exceptions?date=${h.upload_date}`,
                            )
                          }
                          className="text-xs font-medium hover:underline"
                          style={{ color: "var(--accent-light)" }}
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showHistory && history.length === 0 && (
            <p className="mt-4 text-sm" style={{ color: "var(--ct-text-muted)" }}>No uploads found.</p>
          )}
        </div>
      </div>
    </BillingLayout>
  );
}
