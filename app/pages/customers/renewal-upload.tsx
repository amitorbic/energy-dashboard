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
        <div className="flex items-center gap-4 border-b pb-5" style={{ borderColor: "var(--ct-border-default)" }}>
          <button
            onClick={() => router.push("/customers")}
            className="text-sm hover:opacity-80"
            style={{ color: "var(--ct-text-muted)" }}
          >
            ← Customers
          </button>
          <h1 className="text-2xl font-black uppercase tracking-tighter" style={{ color: "var(--ct-text-primary)" }}>
            Renewal Data Upload
          </h1>
        </div>

        {/* Info */}
        <div className="rounded-[var(--r-lg)] border p-4 text-sm space-y-1" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}>
          <p className="font-semibold" style={{ color: "var(--ct-text-primary)" }}>
            Expected CSV columns (tab-separated):
          </p>
          <p className="font-mono text-xs leading-relaxed" style={{ color: "var(--ct-text-muted)" }}>
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
          <p className="text-xs pt-1" style={{ color: "var(--ct-text-muted)" }}>
            Existing records are updated by{" "}
            <span style={{ color: "var(--ct-text-secondary)" }}>cust_id</span>. New records are
            inserted.
          </p>
        </div>

        {/* Upload box */}
        <div
          className="border-2 border-dashed rounded-[var(--r-lg)] p-10 text-center cursor-pointer transition-colors"
          style={uploading
            ? { borderColor: "var(--ct-border-default)", background: "var(--ct-surface-hover)" }
            : { borderColor: "var(--ct-border-default)", background: "var(--ct-surface)" }}
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
              <div className="w-8 h-8 border-2 border-t-transparent rounded-full animate-spin mx-auto" style={{ borderColor: "var(--accent-light)", borderTopColor: "transparent" }} />
              <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Uploading {fileName}...</p>
            </div>
          ) : (
            <div className="space-y-2">
              <svg
                className="w-10 h-10 mx-auto"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                style={{ color: "var(--ct-text-muted)" }}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                />
              </svg>
              <p className="font-semibold text-sm" style={{ color: "var(--ct-text-primary)" }}>
                Click to select CSV file
              </p>
              <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                Tab-separated .csv or .txt
              </p>
            </div>
          )}
        </div>

        {/* Success */}
        {result && (
          <div className="rounded-[var(--r-lg)] border p-5 space-y-3" style={{ background: "var(--success-light-tint)", borderColor: "var(--success-light-tint)" }}>
            <p className="font-bold text-sm uppercase tracking-wide" style={{ color: "var(--success-light)" }}>
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
                  className="rounded-[var(--r-md)] p-3 text-center"
                  style={{ background: "var(--ct-surface)" }}
                >
                  <p className="text-2xl font-black" style={{ color: "var(--ct-text-primary)" }}>{val}</p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>{label}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push("/customers/renewal-view")}
              className="w-full py-2 rounded-[var(--r-md)] text-sm font-bold uppercase transition-colors hover:opacity-90"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              View uploaded data →
            </button>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-[var(--r-lg)] border p-4 text-sm" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
            {error}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default RenewalUpload;
