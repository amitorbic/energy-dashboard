import { useState } from "react";
import EnrollmentLayout from "../../../components/EnrollmentLayout";
import api from "../../../utils/api";

export default function DownloadPending() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const download = async () => {
    setLoading(true); setErr("");
    try {
      const res = await api.get("/enrollment/download/pending", { responseType: "blob" });
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "Pending_Enrollments.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Download failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <EnrollmentLayout title="Enrollment – Download Pending">
      <div className="max-w-sm">
        <h2 className="text-base font-semibold text-gray-800 mb-5">Download Pending Enrollments</h2>
        <div className="bg-white rounded-lg border border-gray-200 p-5">
          <p className="text-sm text-gray-500 mb-4">
            Downloads all unmatched pending confirmations as an Excel spreadsheet.
          </p>
          {err && <p className="text-xs text-red-500 mb-3">{err}</p>}
          <button onClick={download} disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {loading ? "Preparing download…" : "Download XLSX"}
          </button>
        </div>
      </div>
    </EnrollmentLayout>
  );
}
