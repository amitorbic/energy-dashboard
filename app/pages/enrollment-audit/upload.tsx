import { useRef, useState } from "react";
import EnrollmentLayout from "../../components/EnrollmentLayout";
import api from "../../utils/api";

interface UploadResult {
  success: number;
  fail: number;
  total_esids: number;
  success_esids: string[];
  updated_esids: string[];
  fail_esids: string[];
}

export default function EnrollmentUpload() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState("");

  const handleUpload = async () => {
    if (!file) return;
    setUploading(true);
    setResult(null);
    setError("");
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await api.post("/enrollment/upload", fd, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <EnrollmentLayout title="Enrollment – Upload">
      <div className="max-w-xl">
        <h2 className="text-base font-semibold mb-4" style={{ color: "var(--ct-text-primary)" }}>Upload Enrollment Spreadsheet</h2>

        <div
          className="border-2 border-dashed rounded-[var(--r-lg)] p-8 text-center cursor-pointer transition-colors hover:border-[var(--accent-light)]"
          style={{ borderColor: "var(--ct-border-default)" }}
          onClick={() => inputRef.current?.click()}
        >
          {file ? (
            <p className="text-sm font-medium" style={{ color: "var(--ct-text-secondary)" }}>{file.name}</p>
          ) : (
            <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Click to select .xls or .xlsx file</p>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".xls,.xlsx"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>

        <button
          onClick={handleUpload}
          disabled={!file || uploading}
          className="mt-4 px-5 py-2 text-sm rounded-[var(--r-sm)] disabled:opacity-40 transition-colors"
          style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>

        {error && <p className="mt-3 text-sm" style={{ color: "var(--danger-light)" }}>{error}</p>}

        {result && (
          <div className="mt-6 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total ESIDs",  val: result.total_esids },
                { label: "New",          val: result.success_esids.length },
                { label: "Updated",      val: result.updated_esids.length },
              ].map(({ label, val }) => (
                <div key={label} className="rounded-[var(--r-md)] border p-4 text-center" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                  <p className="text-2xl font-bold" style={{ color: "var(--ct-text-primary)" }}>{val}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>{label}</p>
                </div>
              ))}
            </div>

            {result.fail_esids.length > 0 && (
              <div className="rounded-[var(--r-md)] border p-3" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)" }}>
                <p className="text-xs font-semibold mb-1" style={{ color: "var(--danger-light)" }}>
                  Failed ({result.fail_esids.length})
                </p>
                <p className="text-xs font-mono" style={{ color: "var(--danger-light)" }}>{result.fail_esids.join(", ")}</p>
              </div>
            )}

            {result.updated_esids.length > 0 && (
              <div className="rounded-[var(--r-md)] border p-3" style={{ background: "var(--amber-light-tint)", borderColor: "var(--amber-light-tint)" }}>
                <p className="text-xs font-semibold mb-1" style={{ color: "var(--amber-light)" }}>
                  Updated ({result.updated_esids.length})
                </p>
                <p className="text-xs font-mono break-all" style={{ color: "var(--amber-light)" }}>
                  {result.updated_esids.join(", ")}
                </p>
              </div>
            )}

            {result.success_esids.length > 0 && (
              <div className="rounded-[var(--r-md)] border p-3" style={{ background: "var(--success-light-tint)", borderColor: "var(--success-light-tint)" }}>
                <p className="text-xs font-semibold mb-1" style={{ color: "var(--success-light)" }}>
                  New ({result.success_esids.length})
                </p>
                <p className="text-xs font-mono break-all" style={{ color: "var(--success-light)" }}>
                  {result.success_esids.join(", ")}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </EnrollmentLayout>
  );
}
