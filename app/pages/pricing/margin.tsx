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
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-6 rounded-2xl border border-slate-800 shadow-2xl">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Table className="text-sky-400" /> Margin Management
            </h1>
            <p className="text-slate-400 text-sm mt-1">
              Manage term-based margins across all load profiles
            </p>
          </div>

          <div className="flex items-center gap-3 bg-slate-800 px-4 py-2 rounded-lg border border-slate-700">
            <Clock size={16} className="text-amber-400" />
            <span className="text-xs font-mono text-slate-300 uppercase">
              LAST SYNC: {lastSync || "NEVER"}
            </span>
          </div>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
          <div className="p-6 border-b border-slate-800 bg-slate-800/50">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Update Margin Matrix
            </h2>
          </div>
          <form
            onSubmit={handleUpload}
            className="p-6 flex flex-col md:flex-row items-center gap-6"
          >
            <div className="flex-1 w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-700 border-dashed rounded-xl cursor-pointer bg-slate-800/30 hover:bg-slate-800 transition-all">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-3 text-slate-500" />
                  <p className="mb-2 text-sm text-slate-400">
                    <span className="font-semibold">
                      {file ? file.name : "Click to upload Excel"}
                    </span>
                  </p>
                  {/* Fixed: Escaped single quote with &apos; */}
                  <p className="text-xs text-slate-500 text-center px-4">
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
              className={`w-full md:w-auto px-8 py-4 rounded-xl font-bold text-white shadow-lg transition-all flex items-center justify-center gap-2 ${
                loading || !file
                  ? "bg-slate-700 cursor-not-allowed"
                  : "bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-500 hover:to-blue-500"
              }`}
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

        <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center">
            <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
              Current Margin Data
            </h2>
            <button
              onClick={fetchData}
              className="text-xs text-sky-400 hover:underline"
            >
              Refresh Table
            </button>
          </div>

          <div className="overflow-x-auto max-h-[600px]">
            {fetching ? (
              <div className="p-20 text-center text-slate-500 animate-pulse">
                Loading matrix data...
              </div>
            ) : data.length > 0 ? (
              <table className="w-full text-left border-collapse">
                <thead className="bg-slate-800/80 sticky top-0 backdrop-blur-md">
                  <tr>
                    {headers.map((header) => (
                      <th
                        key={header}
                        className="px-4 py-3 text-[10px] font-bold text-slate-400 uppercase border-b border-slate-700 whitespace-nowrap"
                      >
                        {header.replace(/_/g, " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.map((row, idx) => (
                    <tr
                      key={idx}
                      className="hover:bg-slate-800/40 transition-colors"
                    >
                      {headers.map((header) => (
                        <td
                          key={header}
                          className={`px-4 py-3 text-sm font-mono border-b border-slate-800/50 ${header === "term" ? "text-sky-400 font-bold" : "text-slate-300"}`}
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
                <AlertCircle className="text-slate-600 w-12 h-12" />
                <p className="text-slate-500">
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
