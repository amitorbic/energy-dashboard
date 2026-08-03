import { useRef, useState } from "react";
import BillingLayout from "../../components/BillingLayout";
import api from "../../utils/api";

// ── types ─────────────────────────────────────────────────────────────────────
interface Summary { master: number; sub: number; standalone: number; cost: number; }
interface OrderItem { key: string; label: string; }

// ── spinner ───────────────────────────────────────────────────────────────────
function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

// ── rows table ────────────────────────────────────────────────────────────────
function RowsTable({ rows }: { rows: any[] }) {
  if (!rows?.length) return null;
  const cols = Object.keys(rows[0]);
  return (
    <div className="overflow-x-auto rounded-[var(--r-md)] border mt-3" style={{ borderColor: "var(--ct-border-default)" }}>
      <table className="w-full text-xs">
        <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
          <tr>
            <th className="px-3 py-2 text-left font-medium" style={{ color: "var(--ct-text-muted)" }}>#</th>
            {cols.map((c) => (
              <th key={c} className="px-3 py-2 text-left font-medium whitespace-nowrap" style={{ color: "var(--ct-text-muted)" }}>
                {c.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y" style={{ background: "var(--ct-surface)" }}>
          {rows.map((r, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? "var(--ct-surface)" : "var(--ct-surface-hover)" }}>
              <td className="px-3 py-2" style={{ color: "var(--ct-text-muted)" }}>{i + 1}</td>
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>
                  {String(r[c] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── bills summary card ────────────────────────────────────────────────────────
function SummaryCard({ summary }: { summary: Summary }) {
  const cards = [
    { label: "Master Accounts", value: summary.master },
    { label: "Sub Accounts", value: summary.sub },
    { label: "Standalone", value: summary.standalone },
    { label: "Est. Cost", value: `$${summary.cost}` },
  ];
  return (
    <div className="grid grid-cols-4 gap-3 mt-3">
      {cards.map(({ label, value }) => (
        <div key={label} className="rounded-[var(--r-lg)] px-4 py-3" style={{ background: "var(--accent-light-tint)" }}>
          <div className="text-xs font-medium opacity-70" style={{ color: "var(--accent-light)" }}>{label}</div>
          <div className="text-xl font-bold mt-0.5" style={{ color: "var(--accent-light)" }}>{value}</div>
        </div>
      ))}
    </div>
  );
}

// ── check section ─────────────────────────────────────────────────────────────
function CheckSection({
  num, label, rows, expanded, onToggle,
}: {
  num: number;
  label: string;
  rows: any[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const count = rows?.length ?? 0;
  const hasRows = count > 0;

  return (
    <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
      {/* header — always clickable if rows exist */}
      <button
        className="w-full text-left flex items-center justify-between px-4 py-3 border-b transition-colors"
        onClick={hasRows ? onToggle : undefined}
        style={{
          borderColor: "var(--ct-border-subtle)",
          background: hasRows ? "var(--danger-light-tint)" : "var(--success-light-tint)",
          cursor: hasRows ? "pointer" : "default",
        }}
      >
        <span className="text-sm font-medium" style={{ color: "var(--ct-text-primary)" }}>
          <span className="font-normal mr-2" style={{ color: "var(--ct-text-muted)" }}>#{num}</span>
          {label}
        </span>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {hasRows ? (
            <span className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-semibold" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
              {count} row{count !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-semibold" style={{ background: "var(--success-light-tint)", color: "var(--success-light)" }}>
              No exceptions
            </span>
          )}
          {hasRows && (
            <svg
              className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
              style={{ color: "var(--ct-text-muted)" }}
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          )}
        </div>
      </button>

      {/* expanded rows */}
      {expanded && hasRows && (
        <div className="px-4 pb-4">
          <RowsTable rows={rows} />
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function BillingExceptionTestPage() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [running, setRunning]   = useState(false);
  const [error, setError]       = useState("");
  const [filename, setFilename] = useState("");

  const [order,   setOrder]   = useState<OrderItem[]>([]);
  const [rowsMap, setRowsMap] = useState<Record<string, any[]>>({});
  const [summary, setSummary] = useState<Summary | null>(null);

  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const hasResults = order.length > 0;

  // ── run ─────────────────────────────────────────────────────────────────────
  const handleRun = async () => {
    const f = fileRef.current?.files?.[0];
    if (!f) return;
    setRunning(true);
    setError("");
    setExpanded(new Set());

    const form = new FormData();
    form.append("file", f);
    try {
      const res = await api.post("/billing/test/run", form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setOrder(res.data.rows?.order   ?? res.data.order   ?? []);
      setRowsMap(res.data.rows?.rows  ?? res.data.rows    ?? {});
      setSummary(res.data.rows?.summary ?? res.data.summary ?? null);
      setFilename(f.name);

      // auto-expand sections that have rows
      const toExpand = new Set<string>();
      const rm: Record<string, any[]> = res.data.rows?.rows ?? res.data.rows ?? {};
      Object.entries(rm).forEach(([k, v]) => { if ((v as any[]).length > 0) toExpand.add(k); });
      setExpanded(toExpand);
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Request failed");
    } finally {
      setRunning(false);
    }
  };

  const toggle = (key: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });

  const totalRows = Object.values(rowsMap).reduce((s, v) => s + v.length, 0);
  const checksWithRows = Object.values(rowsMap).filter((v) => v.length > 0).length;

  return (
    <BillingLayout title="Billing Audit">
      {/* header */}
      <div className="mb-6">
        <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>PHP Billing Exception Test</h2>
        <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
          Runs the PHP-equivalent checks in-memory and shows results in the same order as the PHP email.
        </p>
      </div>

      {/* upload */}
      <div className="rounded-[var(--r-lg)] border p-5 mb-6" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium mb-1.5" style={{ color: "var(--ct-text-secondary)" }}>
              Billing Extract (.xls / .xlsx)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx"
              className="block w-full text-sm cursor-pointer file:mr-3 file:py-1.5 file:px-3 file:rounded-[var(--r-sm)] file:border-0 file:text-xs file:font-medium"
              style={{ color: "var(--ct-text-secondary)" }}
            />
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-5 py-2 text-sm rounded-[var(--r-sm)] disabled:opacity-40 transition-colors flex items-center gap-2 shrink-0"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            {running && <Spinner />}
            {running ? "Running…" : "Run Checks"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs" style={{ color: "var(--danger-light)" }}>{error}</p>}
      </div>

      {/* stats bar */}
      {hasResults && (
        <div className="flex items-center gap-6 mb-5 px-4 py-3 rounded-[var(--r-lg)] border text-sm" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
          <span style={{ color: "var(--ct-text-muted)" }}>
            File: <span className="font-medium" style={{ color: "var(--ct-text-secondary)" }}>{filename}</span>
          </span>
          <span style={{ color: "var(--ct-text-muted)" }}>
            Checks with exceptions:{" "}
            <span className="font-semibold" style={{ color: "var(--danger-light)" }}>{checksWithRows}</span>
            <span style={{ color: "var(--ct-text-muted)" }}> / {order.length}</span>
          </span>
          <span style={{ color: "var(--ct-text-muted)" }}>
            Total exception rows:{" "}
            <span className="font-semibold" style={{ color: "var(--amber-light)" }}>{totalRows}</span>
          </span>
          <button
            onClick={() => setExpanded(new Set(order.map((o) => o.key)))}
            className="ml-auto text-xs hover:underline"
            style={{ color: "var(--accent-light)" }}
          >
            Expand all
          </button>
          <button
            onClick={() => setExpanded(new Set())}
            className="text-xs hover:underline"
            style={{ color: "var(--ct-text-muted)" }}
          >
            Collapse all
          </button>
        </div>
      )}

      {/* results */}
      {hasResults && (
        <div className="space-y-3">
          {order.map((item, idx) => {
            // bills_summary is special — show as a card, not a check section
            if (item.key === "bills_summary") {
              return (
                <div key={item.key} className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
                  <div className="flex items-center justify-between px-4 py-3 border-b" style={{ background: "var(--accent-light-tint)", borderColor: "var(--ct-border-subtle)" }}>
                    <span className="text-sm font-medium" style={{ color: "var(--ct-text-primary)" }}>
                      <span className="font-normal mr-2" style={{ color: "var(--ct-text-muted)" }}>#{idx + 1}</span>
                      {item.label}
                    </span>
                  </div>
                  <div className="px-4 pb-4">
                    {summary ? (
                      <SummaryCard summary={summary} />
                    ) : (
                      <p className="text-xs mt-3" style={{ color: "var(--ct-text-muted)" }}>No summary data.</p>
                    )}
                  </div>
                </div>
              );
            }

            return (
              <CheckSection
                key={item.key}
                num={idx + 1}
                label={item.label}
                rows={rowsMap[item.key] ?? []}
                expanded={expanded.has(item.key)}
                onToggle={() => toggle(item.key)}
              />
            );
          })}
        </div>
      )}
    </BillingLayout>
  );
}
