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
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-white font-semibold text-lg">
              Consumption Data Management
            </h2>
            {lastUpdated && (
              <span className="text-xs font-mono bg-slate-900 border border-slate-700 text-slate-400 px-3 py-1 rounded-full">
                Sync: {lastUpdated}
              </span>
            )}
          </div>

          {message && (
            <div
              className={`mb-4 px-4 py-3 rounded-lg text-sm font-medium ${
                message.type === "success"
                  ? "bg-emerald-500/10 border border-emerald-500/30 text-emerald-400"
                  : "bg-red-500/10 border border-red-500/30 text-red-400"
              }`}
            >
              {message.text}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="block text-slate-400 text-xs font-bold mb-2 uppercase tracking-widest">
                Select Usage File (.xlsx / .xls)
              </label>
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileChange}
                className="block w-full text-sm text-slate-400
                  file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0
                  file:text-sm file:font-semibold file:bg-indigo-600 file:text-white
                  hover:file:bg-indigo-500 cursor-pointer bg-slate-900/50 p-2 rounded-lg border border-slate-700"
              />
              {selectedFile && (
                <p className="text-sky-400 text-xs mt-2 italic">
                  Ready to upload: {selectedFile.name}
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={handleDownload}
                className="bg-slate-700 hover:bg-slate-600 text-slate-200 
                  font-medium rounded-lg px-4 py-3 text-sm transition-all border border-slate-600"
              >
                ⬇ Download Current
              </button>

              <button
                type="submit"
                disabled={!selectedFile || loading}
                className="bg-sky-500 hover:bg-sky-400 disabled:bg-slate-700 disabled:text-slate-500
                  text-white font-bold rounded-lg px-4 py-3 text-sm transition-all
                  flex items-center justify-center gap-2 shadow-lg shadow-sky-500/20"
              >
                {loading ? (
                  <>
                    <svg
                      className="animate-spin h-4 w-4 text-white"
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
