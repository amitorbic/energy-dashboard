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
  { key: "total_confirmations",     label: "Total Confirmations",      color: "bg-blue-50 border-blue-200 text-blue-700" },
  { key: "total_enrollments",       label: "Total Enrollments",        color: "bg-indigo-50 border-indigo-200 text-indigo-700" },
  { key: "enrollments_checked",     label: "Enrollments Checked",      color: "bg-green-50 border-green-200 text-green-700" },
  { key: "enrollments_unchecked",   label: "Enrollments Unchecked",    color: "bg-yellow-50 border-yellow-200 text-yellow-700" },
  { key: "confirmations_unchecked", label: "Confirmations Unchecked",  color: "bg-red-50 border-red-200 text-red-700" },
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
    <EnrollmentLayout title="Enrollment">
      <h2 className="text-base font-semibold text-gray-800 mb-5">Dashboard</h2>

      {loading ? (
        <p className="text-sm text-gray-400">Loading stats…</p>
      ) : stats ? (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {CARDS.map(({ key, label, color }) => (
            <div key={key} className={`rounded-lg border p-5 ${color}`}>
              <p className="text-3xl font-bold">{stats[key].toLocaleString()}</p>
              <p className="text-xs font-medium mt-1 opacity-80">{label}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-red-500">Failed to load stats.</p>
      )}
    </EnrollmentLayout>
  );
}
