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
    <div className="overflow-x-auto rounded border border-gray-100 mt-3">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b border-gray-100">
          <tr>
            <th className="px-3 py-2 text-left text-gray-400 font-medium">#</th>
            {cols.map((c) => (
              <th key={c} className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">
                {c.replace(/_/g, " ")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 bg-white">
          {rows.map((r, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
              {cols.map((c) => (
                <td key={c} className="px-3 py-2 text-gray-700 whitespace-nowrap">
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
  return (
    <div className="grid grid-cols-4 gap-3 mt-3">
      {[
        { label: "Master Accounts", value: summary.master, color: "text-blue-700 bg-blue-50" },
        { label: "Sub Accounts",    value: summary.sub,    color: "text-purple-700 bg-purple-50" },
        { label: "Standalone",      value: summary.standalone, color: "text-gray-700 bg-gray-50" },
        { label: "Est. Cost",       value: `$${summary.cost}`, color: "text-green-700 bg-green-50" },
      ].map(({ label, value, color }) => (
        <div key={label} className={`rounded-lg px-4 py-3 ${color}`}>
          <div className="text-xs font-medium opacity-70">{label}</div>
          <div className="text-xl font-bold mt-0.5">{value}</div>
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
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* header — always clickable if rows exist */}
      <button
        className={`w-full text-left flex items-center justify-between px-4 py-3 border-b border-gray-100 ${
          hasRows ? "bg-red-50 hover:bg-red-100" : "bg-green-50"
        } transition-colors`}
        onClick={hasRows ? onToggle : undefined}
        style={{ cursor: hasRows ? "pointer" : "default" }}
      >
        <span className="text-sm font-medium text-gray-800">
          <span className="text-gray-400 font-normal mr-2">#{num}</span>
          {label}
        </span>
        <div className="flex items-center gap-2 shrink-0 ml-4">
          {hasRows ? (
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-700">
              {count} row{count !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-700">
              No exceptions
            </span>
          )}
          {hasRows && (
            <svg
              className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? "rotate-180" : ""}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
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
    <BillingLayout title="Billing Module">
      {/* header */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-gray-800">PHP Billing Exception Test</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Runs the PHP-equivalent checks in-memory and shows results in the same order as the PHP email.
        </p>
      </div>

      {/* upload */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <div className="flex items-end gap-4">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-600 mb-1.5">
              Billing Extract (.xls / .xlsx)
            </label>
            <input
              ref={fileRef}
              type="file"
              accept=".xls,.xlsx"
              className="block w-full text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-3 file:rounded file:border-0 file:text-xs file:font-medium file:bg-gray-100 file:text-gray-700 hover:file:bg-gray-200 cursor-pointer"
            />
          </div>
          <button
            onClick={handleRun}
            disabled={running}
            className="px-5 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-40 transition-colors flex items-center gap-2 shrink-0"
          >
            {running && <Spinner />}
            {running ? "Running…" : "Run Checks"}
          </button>
        </div>
        {error && <p className="mt-2 text-xs text-red-500">{error}</p>}
      </div>

      {/* stats bar */}
      {hasResults && (
        <div className="flex items-center gap-6 mb-5 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm">
          <span className="text-gray-500">
            File: <span className="font-medium text-gray-700">{filename}</span>
          </span>
          <span className="text-gray-500">
            Checks with exceptions:{" "}
            <span className="font-semibold text-red-600">{checksWithRows}</span>
            <span className="text-gray-400"> / {order.length}</span>
          </span>
          <span className="text-gray-500">
            Total exception rows:{" "}
            <span className="font-semibold text-orange-600">{totalRows}</span>
          </span>
          <button
            onClick={() => setExpanded(new Set(order.map((o) => o.key)))}
            className="ml-auto text-xs text-blue-600 hover:underline"
          >
            Expand all
          </button>
          <button
            onClick={() => setExpanded(new Set())}
            className="text-xs text-gray-500 hover:underline"
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
                <div key={item.key} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-blue-50">
                    <span className="text-sm font-medium text-gray-800">
                      <span className="text-gray-400 font-normal mr-2">#{idx + 1}</span>
                      {item.label}
                    </span>
                  </div>
                  <div className="px-4 pb-4">
                    {summary ? (
                      <SummaryCard summary={summary} />
                    ) : (
                      <p className="text-xs text-gray-400 mt-3">No summary data.</p>
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
