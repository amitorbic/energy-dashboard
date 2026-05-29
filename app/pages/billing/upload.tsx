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
    <BillingLayout title="Billing Module">
      <div className="max-w-xl">
        <h2 className="text-base font-semibold text-gray-800 mb-6">
          Upload Billing File
        </h2>

        {/* ── success state ── */}
        {uploadState === "success" ? (
          <div className="rounded-lg border border-green-200 bg-green-50 p-6 text-center space-y-4">
            <div className="flex items-center justify-center w-12 h-12 rounded-full bg-green-100 mx-auto">
              <svg
                className="w-6 h-6 text-green-600"
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
              <p className="text-sm font-medium text-green-800">
                File uploaded successfully
              </p>
              <p className="text-xs text-green-600 mt-1">
                {file?.name} — Upload ID #{uploadId}
              </p>
            </div>
            <div className="flex gap-3 justify-center pt-2">
              <button
                onClick={() => router.push("/billing/exceptions/last")}
                className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
              >
                View Exceptions
              </button>
              <button
                onClick={reset}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 transition-colors"
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
              className={`relative border-2 border-dashed rounded-lg p-10 text-center cursor-pointer transition-colors ${
                dragOver
                  ? "border-green-400 bg-green-50"
                  : file
                    ? "border-green-300 bg-green-50"
                    : "border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50"
              }`}
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
                      className="w-5 h-5 text-green-500"
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
                    <span className="text-sm font-medium text-gray-800">
                      {file.name}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500">
                    {(file.size / 1024).toFixed(1)} KB — click to change
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <svg
                    className="w-10 h-10 text-gray-300 mx-auto"
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
                  <p className="text-sm text-gray-600">
                    Drag & drop your billing extract here
                  </p>
                  <p className="text-xs text-gray-400">or click to browse</p>
                  <p className="text-xs text-gray-400">.xls or .xlsx only</p>
                </div>
              )}
            </div>

            {/* ── error ── */}
            {errorMsg && (
              <p className="mt-3 text-sm text-red-600">{errorMsg}</p>
            )}

            {/* ── submit ── */}
            <div className="mt-4 flex gap-3">
              <button
                onClick={handleSubmit}
                disabled={!file || uploadState === "uploading"}
                className="px-5 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
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
                  className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>
          </>
        )}

        {/* ── upload history toggle ── */}
        <div className="mt-8 border-t border-gray-200 pt-6">
          <button
            onClick={loadHistory}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 transition-colors"
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
            <div className="mt-4 rounded-lg border border-gray-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      Date
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      File
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      Uploaded by
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      Rows
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                      Email
                    </th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {history.map((h: any) => (
                    <tr key={h.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 text-gray-800 whitespace-nowrap">
                        {h.upload_date}
                      </td>
                      <td
                        className="px-4 py-2.5 text-gray-600 max-w-[160px] truncate"
                        title={h.filename}
                      >
                        {h.filename}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {h.uploaded_by}
                      </td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {h.total_rows}
                      </td>
                      <td className="px-4 py-2.5">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            h.email_sent
                              ? "bg-green-100 text-green-700"
                              : "bg-gray-100 text-gray-500"
                          }`}
                        >
                          {h.email_sent ? "Sent" : "Pending"}
                        </span>
                      </td>
                      <td className="px-4 py-2.5">
                        <button
                          onClick={() =>
                            router.push(
                              `/billing/exceptions?date=${h.upload_date}`,
                            )
                          }
                          className="text-xs text-green-600 hover:text-green-800 font-medium"
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
            <p className="mt-4 text-sm text-gray-400">No uploads found.</p>
          )}
        </div>
      </div>
    </BillingLayout>
  );
}
