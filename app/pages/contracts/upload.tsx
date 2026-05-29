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
        <p className="text-sm text-gray-500 mb-6">
          Upload a usage file — ESI IDs, profiles and volumes will auto-fill the
          confirmation form.
        </p>

        <div className="bg-white border border-gray-200 rounded-lg p-5">
          <div className="mb-4">
            <label className="text-sm font-medium text-gray-600 block mb-2">
              Provider
            </label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-400"
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
            <label className="text-sm font-medium text-gray-600 block mb-2">
              Usage File
            </label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded file:border-0 file:text-sm file:bg-sky-50 file:text-sky-700 hover:file:bg-sky-100"
            />
          </div>

          {error && <p className="text-sm text-red-600 mb-3">{error}</p>}

          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className="w-full py-2 text-sm font-medium bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50"
          >
            {uploading ? "Processing..." : "Upload & Continue →"}
          </button>
        </div>

        <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-xs font-medium text-gray-500 mb-2">
            What gets pre-filled:
          </p>
          <ul className="text-xs text-gray-500 space-y-1">
            <li>· ESI ID count → Number of ESIIDs field</li>
            <li>· ESI IDs from file → ESIID field</li>
            <li>· Profiles and volumes → Profile section</li>
          </ul>
          <p className="text-xs text-gray-400 mt-2">
            You will fill in the remaining contract details on the next page.
          </p>
        </div>
      </div>
    </ContractLayout>
  );
}
