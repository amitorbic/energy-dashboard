import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import api from "../../utils/api";

interface Batch {
  id: number;
  batch_no: string;
  generated_by: string;
  generated_at: string | null;
  record_count: number;
  date_from: string | null;
  date_to: string | null;
  status: string;
  submitted_at: string | null;
}

function EnrollmentNav() {
  const router = useRouter();
  const links = [
    { label: "Pending Enrollment", href: "/enrollment" },
    { label: "Batch History", href: "/enrollment/batches" },
  ];
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-5">
      {links.map((l) => (
        <Link
          key={l.href}
          href={l.href}
          className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
            router.pathname === l.href
              ? "bg-white border border-b-white border-gray-200 text-sky-700 -mb-px"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {l.label}
        </Link>
      ))}
    </div>
  );
}

const STATUS_BADGE: Record<string, string> = {
  generated:  "bg-gray-100 text-gray-600",
  submitted:  "bg-blue-100 text-blue-700",
  active:     "bg-green-100 text-green-700",
  cancelled:  "bg-red-100 text-red-600",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function BatchesPage() {
  const [batches, setBatches] = useState<Batch[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get("/enrollment-engine/batches");
      setBatches(res.data.batches || []);
    } catch {
      setError("Failed to load batches");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function markSubmitted(batch_no: string) {
    setSubmitting(batch_no);
    setError(null);
    try {
      await api.post(`/enrollment-engine/batches/${batch_no}/submit`);
      setBatches((prev) =>
        prev.map((b) =>
          b.batch_no === batch_no
            ? { ...b, status: "submitted", submitted_at: new Date().toISOString() }
            : b
        )
      );
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to submit batch");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <Layout title="Enrollment — Batch History">
      <div className="space-y-4">
        <EnrollmentNav />

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 animate-pulse">Loading batches…</p>
        ) : batches.length === 0 ? (
          <p className="text-sm text-gray-400">No batches generated yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-xs text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Batch</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Generated</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">By</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Records</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Date Range</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Submitted</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {batches.map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono font-semibold text-gray-900">B{b.batch_no}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDate(b.generated_at)}</td>
                    <td className="px-4 py-2">{b.generated_by}</td>
                    <td className="px-4 py-2 text-center">{b.record_count}</td>
                    <td className="px-4 py-2 whitespace-nowrap font-mono">
                      {b.date_from && b.date_to
                        ? `${b.date_from} — ${b.date_to}`
                        : b.date_from || b.date_to || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[b.status] ?? STATUS_BADGE.generated}`}>
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDate(b.submitted_at)}</td>
                    <td className="px-4 py-2">
                      <div className="flex items-center gap-2">
                        {b.status === "generated" && (
                          <button
                            onClick={() => markSubmitted(b.batch_no)}
                            disabled={submitting === b.batch_no}
                            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 font-medium whitespace-nowrap"
                          >
                            {submitting === b.batch_no ? "Submitting…" : "Mark Submitted"}
                          </button>
                        )}
                        <Link
                          href={`/enrollment/batches/${b.batch_no}`}
                          className="px-3 py-1 text-xs bg-gray-100 text-gray-700 rounded hover:bg-gray-200 font-medium whitespace-nowrap"
                        >
                          View ESI IDs
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
