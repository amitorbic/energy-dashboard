import React, { useState, useRef } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { useRouter } from "next/router";

const RenewalUpload = () => {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    inserted: number;
    skipped: number;
    total: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setError("");
    setResult(null);
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/contract-renewal/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(res.data);
    } catch (err: any) {
      setError(
        err.response?.data?.detail || "Upload failed. Check file format.",
      );
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <Layout title="Renewal Data Upload">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-800 pb-5">
          <button
            onClick={() => router.push("/customers")}
            className="text-slate-400 hover:text-white text-sm"
          >
            ← Customers
          </button>
          <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
            Renewal Data Upload
          </h1>
        </div>

        {/* Info */}
        <div className="bg-slate-800 rounded-lg border border-slate-700 p-4 text-sm text-slate-300 space-y-1">
          <p className="font-semibold text-white">
            Expected CSV columns (tab-separated):
          </p>
          <p className="font-mono text-xs text-slate-400 leading-relaxed">
            serial · cust_id · company_name · cust_first_name · cust_last_name ·
            plan_group · billing_address · billing_city · billing_state ·
            billing_zip · cust_email · cust_fax1 · cust_phone1 · premise_id ·
            premise_address2 · premise_city · premise_state · premise_zip ·
            broker_code · broker_name · contract_end_date · load_profile · usage
            · contract_rate · comm_rate · other_charge · bill_mode ·
            contract_type · cust_type · bill_date · city_tax_exempt ·
            county_tax_exempt · mtacda_tax_exempt · spdt_tax_exempt ·
            spdt2_tax_exempt · state_tax_exempt
          </p>
          <p className="text-xs text-slate-500 pt-1">
            Existing records are updated by{" "}
            <span className="text-slate-300">cust_id</span>. New records are
            inserted.
          </p>
        </div>

        {/* Upload box */}
        <div
          className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors
            ${uploading ? "border-slate-600 bg-slate-800/30" : "border-slate-600 hover:border-red-500 hover:bg-slate-800/50"}`}
          onClick={() => !uploading && fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.txt"
            className="hidden"
            onChange={handleFile}
          />
          {uploading ? (
            <div className="space-y-2">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-slate-400 text-sm">Uploading {fileName}...</p>
            </div>
          ) : (
            <div className="space-y-2">
              <svg
                className="w-10 h-10 text-slate-500 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="text-white font-semibold text-sm">
                Click to select CSV file
              </p>
              <p className="text-slate-500 text-xs">
                Tab-separated .csv or .txt
              </p>
            </div>
          )}
        </div>

        {/* Success */}
        {result && (
          <div className="bg-green-900/30 border border-green-700 rounded-xl p-5 space-y-3">
            <p className="text-green-400 font-bold text-sm uppercase tracking-wide">
              Upload complete
            </p>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Total rows", val: result.total },
                { label: "Inserted / updated", val: result.inserted },
                { label: "Skipped", val: result.skipped },
              ].map(({ label, val }) => (
                <div
                  key={label}
                  className="bg-slate-800 rounded-lg p-3 text-center"
                >
                  <p className="text-2xl font-black text-white">{val}</p>
                  <p className="text-xs text-slate-400 mt-0.5">{label}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push("/customers/renewal-view")}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-bold uppercase transition"
            >
              View uploaded data →
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-400 text-sm">
            {error}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RenewalUpload;
