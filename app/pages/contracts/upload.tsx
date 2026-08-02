"use client";
import { useState } from "react";
import ContractLayout from "../../components/ContractLayout";
import { useRouter } from "next/router";
import api from "../../utils/api";

export default function UploadUsageConfirmation() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [provider, setProvider] = useState("oncor");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const handleUpload = async () => {
    if (!file) {
      setError("Please select a file.");
      return;
    }
    setUploading(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("provider", provider);

      const r = await api.post("/contracts/upload-usage-prefill", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });

      const data = r.data;

      // Build query params to pass to send form
      const params = new URLSearchParams({
        esid_count: String(data.esid_count || ""),
        esiid: data.esiids || "",
        volumes: JSON.stringify(data.volumes || {}),
        total_volume: String(data.total_volume || ""),
        source: "upload",
      });

      router.push(`/contracts/send?${params.toString()}`);
    } catch (e: unknown) {
      setError("Upload failed. Check file format and try again.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <ContractLayout title="Upload Usage">
      <div className="max-w-xl">
        <p className="text-sm mb-6" style={{ color: "var(--ct-text-muted)" }}>
          Upload a usage file — ESI IDs, profiles and volumes will auto-fill the
          confirmation form.
        </p>

        <div className="rounded-[var(--r-lg)] border p-5" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <div className="mb-4">
            <label className="text-sm font-medium block mb-2" style={{ color: "var(--ct-text-secondary)" }}>
              Provider
            </label>
            <select
              className="w-full rounded-[var(--r-sm)] px-3 py-1.5 text-sm border focus:outline-none focus:border-[var(--accent-light)]"
              style={{ background: "var(--ct-surface)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
            >
              <option value="oncor">Oncor</option>
              <option value="aep">AEP</option>
              <option value="tnmp">TNMP</option>
              <option value="centerpoint">Centerpoint</option>
            </select>
          </div>

          <div className="mb-4">
            <label className="text-sm font-medium block mb-2" style={{ color: "var(--ct-text-secondary)" }}>
              Usage File
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm file:mr-3 file:py-1.5 file:px-4 file:rounded-[var(--r-sm)] file:border-0 file:text-sm file:bg-[var(--accent-light-tint)] file:text-[var(--accent-light)] hover:file:bg-[var(--accent-light-tint)]"
              style={{ color: "var(--ct-text-secondary)" }}
            />
          </div>

          {error && <p className="text-sm mb-3" style={{ color: "var(--danger-light)" }}>{error}</p>}

          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className="w-full py-2 text-sm font-medium rounded-[var(--r-sm)] disabled:opacity-50 transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            {uploading ? "Processing..." : "Upload & Continue →"}
          </button>
        </div>

        <div className="mt-4 rounded-[var(--r-lg)] border p-4" style={{ background: "var(--ct-canvas)", borderColor: "var(--ct-border-default)" }}>
          <p className="text-xs font-medium mb-2" style={{ color: "var(--ct-text-muted)" }}>
            What gets pre-filled:
          </p>
          <ul className="text-xs space-y-1" style={{ color: "var(--ct-text-muted)" }}>
            <li>· ESI ID count → Number of ESIIDs field</li>
            <li>· ESI IDs from file → ESIID field</li>
            <li>· Profiles and volumes → Profile section</li>
          </ul>
          <p className="text-xs mt-2" style={{ color: "var(--ct-text-muted)" }}>
            You will fill in the remaining contract details on the next page.
          </p>
        </div>
      </div>
    </ContractLayout>
  );
}
