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
        <h2 className="text-base font-semibold text-gray-800 mb-4">Upload Enrollment Spreadsheet</h2>

        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition-colors"
          onClick={() => inputRef.current?.click()}
        >
          {file ? (
            <p className="text-sm text-gray-700 font-medium">{file.name}</p>
          ) : (
            <p className="text-sm text-gray-400">Click to select .xls or .xlsx file</p>
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
          className="mt-4 px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
        >
          {uploading ? "Uploading…" : "Upload"}
        </button>

        {error && <p className="mt-3 text-sm text-red-500">{error}</p>}

        {result && (
          <div className="mt-6 space-y-3">
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total ESIDs",  val: result.total_esids },
                { label: "New",          val: result.success_esids.length },
                { label: "Updated",      val: result.updated_esids.length },
              ].map(({ label, val }) => (
                <div key={label} className="bg-gray-50 border border-gray-200 rounded p-4 text-center">
                  <p className="text-2xl font-bold text-gray-800">{val}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{label}</p>
                </div>
              ))}
            </div>

            {result.fail_esids.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded p-3">
                <p className="text-xs font-semibold text-red-700 mb-1">
                  Failed ({result.fail_esids.length})
                </p>
                <p className="text-xs text-red-600 font-mono">{result.fail_esids.join(", ")}</p>
              </div>
            )}

            {result.updated_esids.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded p-3">
                <p className="text-xs font-semibold text-yellow-700 mb-1">
                  Updated ({result.updated_esids.length})
                </p>
                <p className="text-xs text-yellow-800 font-mono break-all">
                  {result.updated_esids.join(", ")}
                </p>
              </div>
            )}

            {result.success_esids.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded p-3">
                <p className="text-xs font-semibold text-green-700 mb-1">
                  New ({result.success_esids.length})
                </p>
                <p className="text-xs text-green-800 font-mono break-all">
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
