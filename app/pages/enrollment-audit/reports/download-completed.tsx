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
        <h2 className="text-base font-semibold mb-5" style={{ color: "var(--ct-text-primary)" }}>Download Completed Enrollments</h2>

        <div className="rounded-[var(--r-lg)] border p-5 space-y-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>Start Date</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="border rounded-[var(--r-sm)] px-3 py-1.5 text-sm w-full outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }} />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>End Date</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="border rounded-[var(--r-sm)] px-3 py-1.5 text-sm w-full outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }} />
          </div>

          {err && <p className="text-xs" style={{ color: "var(--danger-light)" }}>{err}</p>}

          <button onClick={download} disabled={loading}
            className="w-full px-4 py-2 text-sm rounded-[var(--r-sm)] disabled:opacity-40 transition-colors hover:opacity-90"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}>
            {loading ? "Preparing download…" : "Download XLSX"}
          </button>
        </div>
      </div>
    </EnrollmentLayout>
  );
}
