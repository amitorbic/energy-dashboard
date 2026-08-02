import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import {
  uploadConsumption,
  downloadConsumptionCurrent,
  fetchConsumptionLastUpdated,
} from "../../utils/api";

const ConsumptionPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);

  const fetchLastUpdated = async () => {
    try {
      const res = await fetchConsumptionLastUpdated();
      if (res.data?.latest) {
        setLastUpdated(new Date(res.data.latest).toLocaleString());
      }
    } catch (err) {
      console.error("Error fetching timestamp:", err);
    }
  };

  useEffect(() => {
    fetchLastUpdated();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) setSelectedFile(e.target.files[0]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedFile) return;

    setLoading(true);
    setMessage(null);

    try {
      // Using the imported helper instead of raw api.post
      const res = await uploadConsumption(selectedFile);

      setMessage({
        text: `Upload successful — ${res.data.count || res.data.rows || 0} rows processed.`,
        type: "success",
      });

      setSelectedFile(null);

      // Clear file input manually
      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      await fetchLastUpdated();
    } catch (err: unknown) {
      let errorMsg = "Upload failed.";

      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as { response: { data: { detail?: string } } };
        errorMsg = axiosErr.response?.data?.detail || errorMsg;
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }

      setMessage({
        text: errorMsg,
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    try {
      const res = await downloadConsumptionCurrent();
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "consumption_current.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download error:", err);
      alert("Failed to download current data.");
    }
  };

  return (
    <Layout>
      <div className="max-w-2xl mx-auto p-4">
        <div
          className="rounded-[var(--r-lg)] p-6 border"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
        >
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-semibold text-lg" style={{ color: "var(--ct-text-primary)" }}>
              Consumption Data Management
            </h2>
            {lastUpdated && (
              <span
                className="text-xs font-mono px-3 py-1 rounded-[var(--r-full)] border"
                style={{ background: "var(--info-light-tint)", color: "var(--info-light)", borderColor: "var(--info-light)" }}
              >
                Sync: {lastUpdated}
              </span>
            )}
          </div>

          {message && (
            <div
              className="mb-4 px-4 py-3 rounded-[var(--r-md)] text-sm font-medium border"
              style={
                message.type === "success"
                  ? { background: "var(--success-light-tint)", borderColor: "var(--success-light)", color: "var(--success-light)" }
                  : { background: "var(--danger-light-tint)", borderColor: "var(--danger-light)", color: "var(--danger-light)" }
              }
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-xs font-bold mb-2 uppercase tracking-widest" style={{ color: "var(--ct-text-muted)" }}>
                Select Usage File (.xlsx / .xls)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm cursor-pointer p-2 rounded-[var(--r-md)] border
                  file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0
                  file:text-sm file:font-semibold file:bg-[var(--accent-light)] file:text-[var(--accent-light-on-solid)]"
                style={{ background: "var(--ct-canvas)", color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)" }}
              />
              {selectedFile && (
                <p className="text-xs mt-2 italic" style={{ color: "var(--accent-light)" }}>
                  Ready to upload: {selectedFile.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={handleDownload}
                className="font-medium rounded-[var(--r-md)] px-4 py-3 text-sm transition-colors border"
                style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              >
                ⬇ Download Current
              </button>

              <button
                type="submit"
                disabled={!selectedFile || loading}
                className="font-bold rounded-[var(--r-md)] px-4 py-3 text-sm transition-colors
                  flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
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
                  "Upload Usage Data"
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
};

export default ConsumptionPage;
