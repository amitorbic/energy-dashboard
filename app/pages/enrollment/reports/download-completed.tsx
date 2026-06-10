import { useState } from "react";
import EnrollmentLayout from "../../../components/EnrollmentLayout";
import api from "../../../utils/api";

export default function DownloadCompleted() {
  const [start, setStart] = useState("");
  const [end, setEnd]     = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr]     = useState("");

  const download = async () => {
    if (!start || !end) { setErr("Both dates are required."); return; }
    setLoading(true); setErr("");
    try {
      const res = await api.get(
        `/enrollment/download/completed?start=${start}&end=${end}`,
        { responseType: "blob" }
      );
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = `Completed_enrollment_${start}_${end}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setErr("Download failed.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <EnrollmentLayout title="Enrollment – Download Completed">
      <div className="max-w-md">
        <h2 className="text-base font-semibold text-gray-800 mb-5">Download Completed Enrollments</h2>

        <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Start Date</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">End Date</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full focus:outline-none focus:ring-1 focus:ring-blue-400" />
          </div>

          {err && <p className="text-xs text-red-500">{err}</p>}

          <button onClick={download} disabled={loading}
            className="w-full px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40 transition-colors">
            {loading ? "Preparing download…" : "Download XLSX"}
          </button>
        </div>
      </div>
    </EnrollmentLayout>
  );
}
