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
    <div className="flex gap-1 border-b mb-5" style={{ borderColor: "var(--ct-border-default)" }}>
      {links.map((l) => {
        const active =
          (router.pathname.startsWith(l.href) && l.href !== "/enrollment") ||
          (l.href === "/enrollment" && router.pathname === "/enrollment");
        return (
          <Link
            key={l.href}
            href={l.href}
            className="px-4 py-2 text-sm font-medium rounded-t transition-colors -mb-px"
            style={
              active
                ? { background: "var(--ct-surface)", borderLeft: "1px solid var(--ct-border-default)", borderRight: "1px solid var(--ct-border-default)", borderTop: "1px solid var(--ct-border-default)", borderBottom: "1px solid var(--ct-surface)", color: "var(--accent-light)" }
                : { color: "var(--ct-text-muted)" }
            }
          >
            {l.label}
          </Link>
        );
      })}
    </div>
  );
}

const STATUS_BADGE: Record<string, { background: string; color: string }> = {
  pending: { background: "var(--amber-light-tint)", color: "var(--amber-light)" },
  active: { background: "var(--success-light-tint)", color: "var(--success-light)" },
  cancelled: { background: "var(--danger-light-tint)", color: "var(--danger-light)" },
};
const DEFAULT_STATUS_BADGE = { background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" };

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
        <div className="flex items-center gap-2 text-sm" style={{ color: "var(--ct-text-muted)" }}>
          <Link href="/enrollment/batches" className="hover:underline" style={{ color: "var(--ct-text-muted)" }}>
            Batch History
          </Link>
          <span>›</span>
          <span className="font-medium" style={{ color: "var(--ct-text-primary)" }}>B{batch_no}</span>
        </div>

        {/* Batch summary */}
        {batch && (
          <div className="rounded-[var(--r-lg)] border px-5 py-3 flex flex-wrap gap-6 text-sm" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div>
              <span className="text-xs uppercase tracking-wide block" style={{ color: "var(--ct-text-muted)" }}>Batch</span>
              <span className="font-mono font-semibold" style={{ color: "var(--ct-text-primary)" }}>B{batch.batch_no}</span>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide block" style={{ color: "var(--ct-text-muted)" }}>Generated</span>
              <span>{batch.generated_at ? new Date(batch.generated_at).toLocaleDateString() : "—"}</span>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide block" style={{ color: "var(--ct-text-muted)" }}>By</span>
              <span>{batch.generated_by}</span>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide block" style={{ color: "var(--ct-text-muted)" }}>ESI IDs</span>
              <span>{customers.length}</span>
            </div>
            <div>
              <span className="text-xs uppercase tracking-wide block" style={{ color: "var(--ct-text-muted)" }}>Status</span>
              <span
                className="inline-block px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-semibold"
                style={batch.status === "submitted" ? { background: "var(--info-light-tint)", color: "var(--info-light)" } : DEFAULT_STATUS_BADGE}
              >
                {batch.status}
              </span>
            </div>
          </div>
        )}

        {error && (
          <div className="text-sm px-4 py-2 rounded-[var(--r-md)]" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm animate-pulse" style={{ color: "var(--ct-text-muted)" }}>Loading…</p>
        ) : customers.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>No customers found in this batch.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--r-lg)] border" style={{ borderColor: "var(--ct-border-default)" }}>
            <table className="min-w-full text-xs" style={{ color: "var(--ct-text-secondary)" }}>
              <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                <tr>
                  {["Customer ID", "ESI ID", "Company", "Broker", "Enroll Date", "Plan Group", "Status", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium uppercase tracking-wider whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ background: "var(--ct-surface)" }}>
                {customers.map((c) => {
                  const busy = actionState[c.customer_id];
                  return (
                    <tr key={c.customer_id} className="border-b transition-colors hover:bg-[var(--ct-surface-hover)]" style={{ borderColor: "var(--ct-border-subtle)" }}>
                      <td className="px-4 py-2 font-mono font-semibold" style={{ color: "var(--ct-text-primary)" }}>{c.customer_id}</td>
                      <td className="px-4 py-2 font-mono whitespace-nowrap">{c.esi_id}</td>
                      <td className="px-4 py-2 max-w-[200px] truncate" title={c.company_name ?? ""}>
                        {c.company_name || "—"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        {c.broker_id
                          ? <><span className="font-medium">{c.broker_id}</span>{c.broker_name && <span className="ml-1" style={{ color: "var(--ct-text-muted)" }}>· {c.broker_name}</span>}</>
                          : "—"}
                      </td>
                      <td className="px-4 py-2 whitespace-nowrap font-mono">{c.enrollment_date || "—"}</td>
                      <td className="px-4 py-2">{c.plan_group || "—"}</td>
                      <td className="px-4 py-2">
                        <span
                          className="inline-block px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-semibold"
                          style={STATUS_BADGE[c.status] ?? DEFAULT_STATUS_BADGE}
                        >
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
                                className="px-3 py-1 text-xs rounded-[var(--r-sm)] disabled:opacity-50 font-medium whitespace-nowrap transition-colors"
                                style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                              >
                                {busy === "activating" ? "Activating…" : "Mark Active"}
                              </button>
                              <button
                                onClick={() => cancel(c.customer_id)}
                                disabled={!!busy}
                                className="px-3 py-1 text-xs rounded-[var(--r-sm)] disabled:opacity-50 font-medium whitespace-nowrap transition-colors"
                                style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}
                              >
                                {busy === "cancelling" ? "Cancelling…" : "Mark Cancelled"}
                              </button>
                            </>
                          )}
                          {c.status === "active" && (
                            <span className="text-xs font-medium" style={{ color: "var(--success-light)" }}>Active ✓</span>
                          )}
                          {c.status === "cancelled" && (
                            <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>Cancelled</span>
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
