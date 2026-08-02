import React, { useState, useEffect } from "react";
import { AxiosError } from "axios";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { Upload, Table, Clock, CheckCircle, AlertCircle } from "lucide-react";

// Fix: Define a proper interface instead of 'any'
interface MarginRow {
  term: number;
  upload_date?: string;
  serial?: number;
  [key: string]: string | number | undefined;
}

const MarginPage = () => {
  const [file, setFile] = useState<File | null>(null);
  const [data, setData] = useState<MarginRow[]>([]);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);

  const fetchData = async () => {
    setFetching(true);
    try {
      const [statusRes, dataRes] = await Promise.all([
        api.get("/pricing/margin/last-updated"),
        api.get("/pricing/margin/view"),
      ]);

      if (statusRes.data.latest) {
        setLastSync(new Date(statusRes.data.latest).toLocaleString());
      }
      setData(dataRes.data);
    } catch (err) {
      console.error("Failed to fetch margin data:", err);
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    setLoading(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      await api.post("/pricing/margin/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setFile(null);
      await fetchData();
      alert("Margin Matrix Synchronized Successfully");
    } catch (err) {
      const axiosError = err as AxiosError<{ detail: string }>;
      console.error("Upload error:", axiosError);

      if (axiosError.response?.data) {
        console.log("Server Detail:", axiosError.response.data.detail);
      }
      alert("Upload failed. Check terminal for 500 error details.");
    } finally {
      setLoading(false);
    }
  };

  const headers =
    data.length > 0
      ? Object.keys(data[0]).filter(
          (key) => key !== "serial" && key !== "upload_date",
        )
      : [];

  return (
    <Layout title="Margin Matrix">
      <div className="max-w-[1600px] mx-auto space-y-8 p-4">
        <div
          className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-[var(--r-lg)] p-6 border"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
        >
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: "var(--ct-text-primary)" }}>
              <Table style={{ color: "var(--accent-light)" }} /> Margin Management
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--ct-text-muted)" }}>
              Manage term-based margins across all load profiles
            </p>
          </div>

          <div
            className="flex items-center gap-3 px-4 py-2 rounded-[var(--r-md)] border"
            style={{ background: "var(--info-light-tint)", borderColor: "var(--info-light)" }}
          >
            <Clock size={16} style={{ color: "var(--info-light)" }} />
            <span className="text-xs font-mono uppercase" style={{ color: "var(--info-light)" }}>
              LAST SYNC: {lastSync || "NEVER"}
            </span>
          </div>
        </div>

        <div
          className="rounded-[var(--r-lg)] border overflow-hidden"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
        >
          <div
            className="p-6 border-b"
            style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface-hover)" }}
          >
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--ct-text-secondary)" }}>
              Update Margin Matrix
            </h2>
          </div>
          <form
            onSubmit={handleUpload}
            className="p-6 flex flex-col md:flex-row items-center gap-6"
          >
            <div className="flex-1 w-full">
              <label
                className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-[var(--r-lg)] cursor-pointer transition-all hover:bg-[var(--ct-surface-hover)]"
                style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-canvas)" }}
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-3" style={{ color: "var(--ct-text-muted)" }} />
                  <p className="mb-2 text-sm" style={{ color: "var(--ct-text-muted)" }}>
                    <span className="font-semibold">
                      {file ? file.name : "Click to upload Excel"}
                    </span>
                  </p>
                  {/* Fixed: Escaped single quote with &apos; */}
                  <p className="text-xs text-center px-4" style={{ color: "var(--ct-text-muted)" }}>
                    Ensure first column is &apos;term&apos; and others match
                    profile names
                  </p>
                </div>
                <input
                  type="file"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={loading || !file}
              className="w-full md:w-auto px-8 py-4 rounded-[var(--r-lg)] font-bold shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={
                loading || !file
                  ? { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }
                  : { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
              }
            >
              {loading ? (
                "Processing..."
              ) : (
                <>
                  <CheckCircle size={20} /> Sync Matrix
                </>
              )}
            </button>
          </form>
        </div>

        <div
          className="rounded-[var(--r-lg)] border overflow-hidden"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
        >
          <div
            className="p-6 border-b flex justify-between items-center"
            style={{ borderColor: "var(--ct-border-default)" }}
          >
            <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--ct-text-secondary)" }}>
              Current Margin Data
            </h2>
            <button
              onClick={fetchData}
              className="text-xs hover:underline"
              style={{ color: "var(--accent-light)" }}
            >
              Refresh Table
            </button>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            {fetching ? (
              <div className="p-20 text-center animate-pulse" style={{ color: "var(--ct-text-muted)" }}>
                Loading matrix data...
              </div>
            ) : data.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead
                  className="sticky top-0 backdrop-blur-md"
                  style={{ background: "var(--ct-surface-hover)" }}
                >
                  <tr>
                    {headers.map((header) => (
                      <th
                        key={header}
                        className="px-4 py-3 text-[10px] font-bold uppercase border-b whitespace-nowrap"
                        style={{ color: "var(--ct-text-muted)", borderColor: "var(--ct-border-default)" }}
                      >
                        {header.replace(/_/g, " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y" style={{ borderColor: "var(--ct-border-subtle)" }}>
                  {data.map((row, idx) => (
                    <tr
                      key={idx}
                      className="transition-colors hover:bg-[var(--ct-surface-hover)]"
                    >
                      {headers.map((header) => (
                        <td
                          key={header}
                          className="px-4 py-3 text-sm font-mono border-b"
                          style={{
                            borderColor: "var(--ct-border-subtle)",
                            color: header === "term" ? "var(--accent-light)" : "var(--ct-text-secondary)",
                            fontWeight: header === "term" ? 700 : 400,
                          }}
                        >
                          {row[header]}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-20 text-center flex flex-col items-center gap-3">
                <AlertCircle className="w-12 h-12" style={{ color: "var(--ct-text-muted)" }} />
                <p style={{ color: "var(--ct-text-muted)" }}>
                  No margin data found. Please upload a spreadsheet.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default MarginPage;
