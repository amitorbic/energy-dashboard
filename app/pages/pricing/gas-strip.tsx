import React, { useState, useEffect } from "react"; // Added hooks here
import Layout from "../../components/Layout";
// Added fetchLastUpdated to the imports
import {
  uploadGasStrip,
  downloadSample,
  fetchLastUpdated,
} from "../../utils/api";

const GasStripPage: React.FC = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [startDate, setStartDate] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // 1. Logic for page load (Defined inside useEffect to satisfy linter)
  useEffect(() => {
    const initFetch = async () => {
      try {
        const response = await fetchLastUpdated();
        if (response.data.last_updated) {
          setLastUpdated(new Date(response.data.last_updated).toLocaleString());
        }
      } catch {
        console.error("Initial fetch failed");
      }
    };
    initFetch();
  }, []);

  // 2. Logic for after upload (Defined inside handleSubmit)
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFile) return;

    try {
      await uploadGasStrip(selectedFile);
      alert("File uploaded successfully");

      // Update timestamp right here
      const response = await fetchLastUpdated();
      if (response.data.last_updated) {
        setLastUpdated(new Date(response.data.last_updated).toLocaleString());
      }

      setSelectedFile(null);
    } catch {
      alert("Upload failed");
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setSelectedFile(event.target.files[0]);
    }
  };

  const handleDateChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setStartDate(event.target.value);
  };

  const handleDownloadSample = async () => {
    try {
      const response = await downloadSample();
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", "gas_strip_sample.xlsx");
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error("Error downloading sample:", error);
      alert("Failed to download sample file.");
    }
  };

  return (
    <Layout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold text-gray-800">
            Gas Strip Management
          </h1>
          {lastUpdated && (
            <div className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full border border-blue-200">
              <strong>Last Updated:</strong> {lastUpdated}
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-6 rounded-lg shadow">
          {/* Section 1: Configuration */}
          <div className="border-r pr-6">
            <h2 className="text-lg font-semibold mb-4 text-gray-700">
              1. Configuration
            </h2>
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Select Start Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={handleDateChange}
              className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            />
          </div>

          {/* Section 2: Upload */}
          <div>
            <h2 className="text-lg font-semibold mb-4 text-gray-700">
              2. Upload Latest Strip
            </h2>
            <button
              onClick={handleDownloadSample}
              className="text-blue-600 hover:underline text-sm mb-4 block"
            >
              Download Excel Sample
            </button>

            <input
              type="file"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />

            <button
              onClick={handleSubmit}
              disabled={!selectedFile}
              className="mt-6 w-full bg-green-600 text-white font-bold py-2 px-4 rounded hover:bg-green-700 disabled:bg-gray-300 transition-colors"
            >
              Upload & Update Tables
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default GasStripPage;
