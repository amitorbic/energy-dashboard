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
    <div className="flex gap-1 border-b mb-5" style={{ borderColor: "var(--ct-border-default)" }}>
      {links.map((l) => {
        const active = router.pathname === l.href;
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
  generated: { background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" },
  submitted: { background: "var(--info-light-tint)", color: "var(--info-light)" },
  active: { background: "var(--success-light-tint)", color: "var(--success-light)" },
  cancelled: { background: "var(--danger-light-tint)", color: "var(--danger-light)" },
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
          <div className="text-sm px-4 py-2 rounded-[var(--r-md)]" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-sm animate-pulse" style={{ color: "var(--ct-text-muted)" }}>Loading batches…</p>
        ) : batches.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>No batches generated yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-[var(--r-lg)] border" style={{ borderColor: "var(--ct-border-default)" }}>
            <table className="min-w-full text-xs" style={{ color: "var(--ct-text-secondary)" }}>
              <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                <tr>
                  {["Batch", "Generated", "By", "Records", "Date Range", "Status", "Submitted", "Actions"].map((h) => (
                    <th key={h} className="px-4 py-2 text-left font-medium uppercase tracking-wider" style={{ color: "var(--ct-text-muted)" }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y" style={{ background: "var(--ct-surface)" }}>
                {batches.map((b) => (
                  <tr key={b.id} className="border-b transition-colors hover:bg-[var(--ct-surface-hover)]" style={{ borderColor: "var(--ct-border-subtle)" }}>
                    <td className="px-4 py-2 font-mono font-semibold" style={{ color: "var(--ct-text-primary)" }}>B{b.batch_no}</td>
                    <td className="px-4 py-2 whitespace-nowrap">{fmtDate(b.generated_at)}</td>
                    <td className="px-4 py-2">{b.generated_by}</td>
                    <td className="px-4 py-2 text-center">{b.record_count}</td>
                    <td className="px-4 py-2 whitespace-nowrap font-mono">
                      {b.date_from && b.date_to
                        ? `${b.date_from} — ${b.date_to}`
                        : b.date_from || b.date_to || "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className="inline-block px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-semibold"
                        style={STATUS_BADGE[b.status] ?? STATUS_BADGE.generated}
                      >
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
                            className="px-3 py-1 text-xs rounded-[var(--r-sm)] disabled:opacity-50 font-medium whitespace-nowrap transition-colors"
                            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                          >
                            {submitting === b.batch_no ? "Submitting…" : "Mark Submitted"}
                          </button>
                        )}
                        <Link
                          href={`/enrollment/batches/${b.batch_no}`}
                          className="px-3 py-1 text-xs rounded-[var(--r-sm)] font-medium whitespace-nowrap border transition-colors hover:bg-[var(--ct-surface-hover)]"
                          style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
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
