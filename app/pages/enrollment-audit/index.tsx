import { useEffect, useState } from "react";
import EnrollmentLayout from "../../components/EnrollmentLayout";
import api from "../../utils/api";

interface Stats {
  total_confirmations: number;
  total_enrollments: number;
  enrollments_checked: number;
  enrollments_unchecked: number;
  confirmations_unchecked: number;
}

const CARDS = [
  { key: "total_confirmations", label: "Total Confirmations", bg: "var(--accent-light-tint)", fg: "var(--accent-light)" },
  { key: "total_enrollments", label: "Total Enrollments", bg: "var(--accent-light-tint)", fg: "var(--accent-light)" },
  { key: "enrollments_checked", label: "Enrollments Checked", bg: "var(--success-light-tint)", fg: "var(--success-light)" },
  { key: "enrollments_unchecked", label: "Enrollments Unchecked", bg: "var(--amber-light-tint)", fg: "var(--amber-light)" },
  { key: "confirmations_unchecked", label: "Confirmations Unchecked", bg: "var(--danger-light-tint)", fg: "var(--danger-light)" },
] as const;

export default function EnrollmentHome() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/enrollment/stats")
      .then((r) => setStats(r.data))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <EnrollmentLayout title="Enrollment Audit">
      <h2 className="text-base font-semibold mb-5" style={{ color: "var(--ct-text-primary)" }}>Dashboard</h2>

      {loading ? (
        <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading stats…</p>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {CARDS.map(({ key, label, bg, fg }) => (
            <div key={key} className="rounded-[var(--r-lg)] border p-5" style={{ background: bg, borderColor: bg, color: fg }}>
              <p className="text-3xl font-bold">{stats[key].toLocaleString()}</p>
              <p className="text-xs font-medium mt-1 opacity-80">{label}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm" style={{ color: "var(--danger-light)" }}>Failed to load stats.</p>
      )}
    </EnrollmentLayout>
  );
}
