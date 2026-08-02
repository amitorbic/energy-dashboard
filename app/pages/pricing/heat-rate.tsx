import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import {
  uploadHeatRate,
  downloadHeatRateSample,
  fetchHeatRateLastUpdated,
} from "../../utils/api";

const HeatRatePage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Unified fetcher for the timestamp
  const getTimestamp = async () => {
    try {
      const response = await fetchHeatRateLastUpdated();
      // Access .latest from the axios data object
      const latestDate = response.data?.latest;

      if (latestDate) {
        setLastUpdated(new Date(latestDate).toLocaleString());
      } else {
        setLastUpdated(null); // This triggers the "Never" or "Loading" state
      }
    } catch (error) {
      console.error("Failed to fetch timestamp:", error);
      setLastUpdated(null);
    }
  };

  useEffect(() => {
    getTimestamp();
  }, []);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleDownloadSample = async () => {
    try {
      const response = await downloadHeatRateSample();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "heat_rate_sample.xlsx");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Download error:", error);
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile) return;

    setIsUploading(true);
    try {
      await uploadHeatRate(selectedFile);

      await getTimestamp();
      setSelectedFile(null);

      const fileInput = document.querySelector(
        'input[type="file"]',
      ) as HTMLInputElement;
      if (fileInput) fileInput.value = "";

      alert("Heat Rate Matrix uploaded and synchronized successfully!");
    } catch (err: unknown) {
      console.error("Upload error:", err);

      let errorMsg = "An unexpected error occurred.";

      if (err && typeof err === "object" && "response" in err) {
        // Safe type narrowing for Axios-style errors
        const axiosErr = err as { response: { data: { detail?: string } } };
        errorMsg =
          axiosErr.response?.data?.detail || "Server error during processing.";
      } else if (err instanceof Error) {
        errorMsg = err.message;
      }

      alert(`Upload failed: ${errorMsg}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold" style={{ color: "var(--ct-text-primary)" }}>
              Heat Rate Management
            </h1>
            <p className="text-sm mt-1" style={{ color: "var(--ct-text-muted)" }}>
              Manage ERCOT Market Matrix Profiles
            </p>
          </div>

          {lastUpdated && (
            <div className="text-right">
              <div className="text-xs uppercase font-semibold tracking-wider" style={{ color: "var(--ct-text-muted)" }}>
                Database Sync
              </div>
              <div
                className="text-sm px-4 py-2 rounded-[var(--r-md)] border"
                style={{ background: "var(--info-light-tint)", color: "var(--info-light)", borderColor: "var(--info-light)", boxShadow: "var(--shadow-content)" }}
              >
                <strong>Last Updated:</strong> {lastUpdated}
              </div>
            </div>
          )}
        </div>

        <div
          className="p-8 rounded-[var(--r-lg)] border"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
        >
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold" style={{ color: "var(--ct-text-primary)" }}>
              Upload Market Matrix
            </h2>
            <button
              onClick={handleDownloadSample}
              className="flex items-center text-sm font-medium transition-colors"
              style={{ color: "var(--accent-light)" }}
            >
              <svg
                className="w-4 h-4 mr-1"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="Wait 4 12h16m-8-8l8 8-8 8"
                />
              </svg>
              Download Sample Template
            </button>
          </div>

          <div
            className="border-2 border-dashed rounded-[var(--r-lg)] p-8 text-center transition-all hover:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)" }}
          >
            <input
              type="file"
              id="file-upload"
              onChange={handleFileChange}
              className="hidden"
              accept=".xls,.xlsx"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="font-medium" style={{ color: "var(--accent-light)" }}>
                {selectedFile
                  ? selectedFile.name
                  : "Click to choose Excel file"}
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                Supports .xls and .xlsx files
              </p>
            </label>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!selectedFile || isUploading}
            className="mt-8 w-full flex justify-center items-center py-3 px-4 rounded-[var(--r-md)] font-bold shadow-sm transition-all disabled:opacity-50 active:scale-95"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            {isUploading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5"
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
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Processing & Melting Data...
              </>
            ) : (
              "Upload & Sync Profiles"
            )}
          </button>
        </div>
      </div>
    </Layout>
  );
};

export default HeatRatePage;
