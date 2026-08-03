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
        <h2 className="text-base font-semibold mb-5" style={{ color: "var(--ct-text-primary)" }}>Download Pending Enrollments</h2>
        <div className="rounded-[var(--r-lg)] border p-5" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <p className="text-sm mb-4" style={{ color: "var(--ct-text-muted)" }}>
            Downloads all unmatched pending confirmations as an Excel spreadsheet.
          </p>
          {err && <p className="text-xs mb-3" style={{ color: "var(--danger-light)" }}>{err}</p>}
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
