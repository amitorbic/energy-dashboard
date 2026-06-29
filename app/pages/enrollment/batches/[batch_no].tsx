import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../../components/Layout";
import api from "../../../utils/api";

interface BatchInfo {
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

interface Customer {
  customer_id: string;
  esi_id: string;
  company_name: string | null;
  status: string;
  broker_id: string | null;
  broker_name: string | null;
  plan_group: string | null;
  meter_fee: number | null;
  enrollment_date: string | null;
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
            router.pathname.startsWith(l.href) && l.href !== "/enrollment"
              ? "bg-white border border-b-white border-gray-200 text-sky-700 -mb-px"
              : l.href === "/enrollment" && router.pathname === "/enrollment"
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
  pending:    "bg-yellow-100 text-yellow-700",
  active:     "bg-green-100 text-green-700",
  cancelled:  "bg-red-100 text-red-600",
};

export default function BatchDetailPage() {
  const router = useRouter();
  const { batch_no } = router.query as { batch_no: string };

  const [batch, setBatch] = useState<BatchInfo | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<Record<string, "activating" | "cancelling" | null>>({});

  useEffect(() => {
    if (!batch_no) return;
    setLoading(true);
    api
      .get(`/enrollment-engine/batches/${batch_no}`)
      .then((res) => {
        setBatch(res.data.batch);
        setCustomers(res.data.customers || []);
      })
      .catch(() => setError("Failed to load batch"))
      .finally(() => setLoading(false));
  }, [batch_no]);

  async function activate(customer_id: string) {
    setActionState((s) => ({ ...s, [customer_id]: "activating" }));
    setError(null);
    try {
      await api.post(`/enrollment-engine/activate/${customer_id}`);
      setCustomers((prev) =>
        prev.map((c) => (c.customer_id === customer_id ? { ...c, status: "active" } : c))
      );
    } catch (e: any) {
      setError(e?.response?.data?.detail || `Failed to activate ${customer_id}`);
    } finally {
      setActionState((s) => ({ ...s, [customer_id]: null }));
    }
  }

  async function cancel(customer_id: string) {
    setActionState((s) => ({ ...s, [customer_id]: "cancelling" }));
    setError(null);
    try {
      await api.post(`/enrollment-engine/cancel/${customer_id}`);
      setCustomers((prev) =>
        prev.map((c) => (c.customer_id === customer_id ? { ...c, status: "cancelled" } : c))
      );
    } catch (e: any) {
      setError(e?.response?.data?.detail || `Failed to cancel ${customer_id}`);
    } finally {
      setActionState((s) => ({ ...s, [customer_id]: null }));
    }
  }

  const title = batch ? `Batch B${batch.batch_no}` : "Batch Detail";

  return (
    <Layout title={title}>
      <div className="space-y-4">
        <EnrollmentNav />

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Link href="/enrollment/batches" className="hover:text-gray-800">
            Batch History
          </Link>
          <span>›</span>
          <span className="text-gray-800 font-medium">B{batch_no}</span>
        </div>

        {/* Batch summary */}
        {batch && (
          <div className="bg-white border border-gray-200 rounded-lg px-5 py-3 flex flex-wrap gap-6 text-sm">
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide block">Batch</span>
              <span className="font-mono font-semibold text-gray-900">B{batch.batch_no}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide block">Generated</span>
              <span>{batch.generated_at ? new Date(batch.generated_at).toLocaleDateString() : "—"}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide block">By</span>
              <span>{batch.generated_by}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide block">ESI IDs</span>
              <span>{customers.length}</span>
            </div>
            <div>
              <span className="text-gray-400 text-xs uppercase tracking-wide block">Status</span>
              <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${
                batch.status === "submitted" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
              }`}>
                {batch.status}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-400 animate-pulse">Loading…</p>
        ) : customers.length === 0 ? (
          <p className="text-sm text-gray-400">No customers found in this batch.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200">
            <table className="min-w-full text-xs text-gray-700">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Customer ID</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">ESI ID</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Company</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Broker</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Enroll Date</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Plan Group</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {customers.map((c) => {
                  const busy = actionState[c.customer_id];
                  return (
                    <tr key={c.customer_id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 font-mono text-gray-900 font-semibold">{c.customer_id}</td>
                      <td className="px-4 py-2 font-mono whitespace-nowrap">{c.esi_id}</td>
                      <td className="px-4 py-2 max-w-[200px] truncate" title={c.company_name ?? ""}>
                        {c.company_name || "—"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {c.broker_id
                          ? <><span className="font-medium">{c.broker_id}</span>{c.broker_name && <span className="text-gray-400 ml-1">· {c.broker_name}</span>}</>
                          : "—"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap font-mono">{c.enrollment_date || "—"}</td>
                      <td className="px-4 py-2">{c.plan_group || "—"}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-semibold ${STATUS_BADGE[c.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {c.status}
                        </span>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {c.status === "pending" && (
                            <>
                              <button
                                onClick={() => activate(c.customer_id)}
                                disabled={!!busy}
                                className="px-3 py-1 text-xs bg-emerald-600 text-white rounded hover:bg-emerald-700 disabled:opacity-50 font-medium whitespace-nowrap"
                              >
                                {busy === "activating" ? "Activating…" : "Mark Active"}
                              </button>
                              <button
                                onClick={() => cancel(c.customer_id)}
                                disabled={!!busy}
                                className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200 disabled:opacity-50 font-medium whitespace-nowrap"
                              >
                                {busy === "cancelling" ? "Cancelling…" : "Mark Cancelled"}
                              </button>
                            </>
                          )}
                          {c.status === "active" && (
                            <span className="text-xs text-green-600 font-medium">Active ✓</span>
                          )}
                          {c.status === "cancelled" && (
                            <span className="text-xs text-gray-400">Cancelled</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
