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
            <h1 className="text-2xl font-bold text-gray-800">
              Heat Rate Management
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Manage ERCOT Market Matrix Profiles
            </p>
          </div>

          {lastUpdated && (
            <div className="text-right">
              <div className="text-xs text-gray-400 uppercase font-semibold tracking-wider">
                Database Sync
              </div>
              <div className="text-sm bg-green-50 text-green-700 px-4 py-2 rounded-lg border border-green-200 shadow-sm">
                <strong>Last Updated:</strong> {lastUpdated}
              </div>
            </div>
          )}
        </div>

        <div className="bg-white p-8 rounded-xl shadow-md border border-gray-100">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-lg font-semibold text-gray-700">
              Upload Market Matrix
            </h2>
            <button
              onClick={handleDownloadSample}
              className="flex items-center text-blue-600 hover:text-blue-800 text-sm font-medium transition-colors"
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

          <div className="border-2 border-dashed border-gray-200 rounded-lg p-8 text-center hover:border-blue-300 transition-all">
            <input
              type="file"
              id="file-upload"
              onChange={handleFileChange}
              className="hidden"
              accept=".xls,.xlsx"
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="text-blue-600 font-medium hover:text-blue-700">
                {selectedFile
                  ? selectedFile.name
                  : "Click to choose Excel file"}
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Supports .xls and .xlsx files
              </p>
            </label>
          </div>

          <button
            onClick={handleSubmit}
            disabled={!selectedFile || isUploading}
            className={`mt-8 w-full flex justify-center items-center py-3 px-4 rounded-lg font-bold text-white shadow-sm transition-all ${
              isUploading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 active:transform active:scale-95"
            }`}
          >
            {isUploading ? (
              <>
                <svg
                  className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
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
