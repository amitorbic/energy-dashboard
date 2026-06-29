import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import api from "../../utils/api";

interface PendingRecord {
  sid: number;
  esiid: string | null;
  customer_name: string;
  broker_code: string;
  broker_name: string | null;
  start_date: string | null;
  term: string | null;
  contract_rate: string | null;
  meter_fees: string | null;
  lmp: number | null;
  tax_exempt: string | null;
  customer_email: string | null;
  contract_no: string | null;
  date_modified: string | null;
  commission: string | null;
  plan_group: string | null;
  suggested_plan: string | null;
  suggested_plan_name: string | null;
  paired_plan: string | null;
  paired_plan_name: string | null;
}

function todayMinus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
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

export default function EnrollmentEngine() {
  const [dateFrom, setDateFrom] = useState(todayMinus(7));
  const [dateTo, setDateTo] = useState(todayMinus(0));
  const [brokerFilter, setBrokerFilter] = useState("");
  const [records, setRecords] = useState<PendingRecord[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  const brokers = Array.from(
    new Map(records.map((r) => [r.broker_code, r.broker_name || r.broker_code])).entries()
  ).sort((a, b) => a[0].localeCompare(b[0]));

  const visible = brokerFilter
    ? records.filter((r) => r.broker_code === brokerFilter)
    : records;

  // Sync select-all indeterminate state
  useEffect(() => {
    if (!selectAllRef.current) return;
    const visibleSids = visible.map((r) => r.sid);
    const selectedVisible = visibleSids.filter((s) => selected.has(s));
    selectAllRef.current.indeterminate =
      selectedVisible.length > 0 && selectedVisible.length < visibleSids.length;
  }, [selected, visible]);

  async function loadRecords() {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setSelected(new Set());
    setLoaded(false);
    try {
      const params: Record<string, string> = {};
      if (dateFrom) params.date_from = dateFrom;
      if (dateTo) params.date_to = dateTo;
      const res = await api.get("/enrollment-engine/pending", { params });
      setRecords(res.data.records || []);
      setLoaded(true);
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to load records");
    } finally {
      setLoading(false);
    }
  }

  function toggleRow(sid: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(sid) ? next.delete(sid) : next.add(sid);
      return next;
    });
  }

  function toggleAll() {
    const visibleSids = visible.map((r) => r.sid);
    const allSelected = visibleSids.every((s) => selected.has(s));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        visibleSids.forEach((s) => next.delete(s));
      } else {
        visibleSids.forEach((s) => next.add(s));
      }
      return next;
    });
  }

  async function generateMassRoll() {
    const sids = Array.from(selected);
    if (!sids.length) return;
    setGenerating(true);
    setError(null);
    setSuccessMsg(null);
    try {
      const res = await api.post(
        "/enrollment-engine/generate-masterroll",
        { record_sids: sids, date_from: dateFrom || null, date_to: dateTo || null },
        { responseType: "blob" }
      );
      const cd = res.headers["content-disposition"] || "";
      const fnMatch = cd.match(/filename="([^"]+)"/);
      const filename = fnMatch ? fnMatch[1] : "MasterRoll.xlsx";
      const url = URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      // Remove generated rows from the table and clear selection
      const generatedSet = new Set(sids);
      setRecords((prev) => prev.filter((r) => !generatedSet.has(r.sid)));
      setSelected(new Set());
      setSuccessMsg(
        `MasterRoll generated — ${sids.length} record${sids.length !== 1 ? "s" : ""} enrolled. File: ${filename}`
      );
    } catch (e: any) {
      if (e?.response?.data instanceof Blob) {
        const text = await e.response.data.text();
        try {
          setError(JSON.parse(text)?.detail || "Generation failed");
        } catch {
          setError("Generation failed");
        }
      } else {
        setError(e?.response?.data?.detail || "Generation failed");
      }
    } finally {
      setGenerating(false);
    }
  }

  const selectedCount = selected.size;
  const visibleSids = visible.map((r) => r.sid);
  const allVisibleSelected = visibleSids.length > 0 && visibleSids.every((s) => selected.has(s));

  function fmtRate(val: string | null) {
    if (!val) return "—";
    const n = parseFloat(val);
    return isNaN(n) ? val : `${n.toFixed(2)}¢`;
  }

  function fmtFee(val: string | null) {
    if (!val || val === "0" || val === "0.00") return "$0";
    return val.startsWith("$") ? val : `$${val}`;
  }

  return (
    <Layout title="Enrollment">
      <div className="space-y-4">
        <EnrollmentNav />
        {/* Filter bar */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start Date From</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Start Date To</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <button
            onClick={loadRecords}
            disabled={loading}
            className="px-4 py-1.5 bg-sky-600 text-white text-sm font-medium rounded hover:bg-sky-700 disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load Records"}
          </button>
        </div>

        {/* Status messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
            {error}
          </div>
        )}
        {successMsg && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm px-4 py-2 rounded">
            {successMsg}
          </div>
        )}

        {/* Results */}
        {loaded && (
          <>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{records.length}</span> record
                  {records.length !== 1 ? "s" : ""} pending enrollment
                </span>
                {records.length > 0 && (
                  <select
                    value={brokerFilter}
                    onChange={(e) => { setBrokerFilter(e.target.value); setSelected(new Set()); }}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                  >
                    <option value="">All brokers ({records.length})</option>
                    {brokers.map(([code, name]) => (
                      <option key={code} value={code}>
                        {code} — {name} ({records.filter((r) => r.broker_code === code).length})
                      </option>
                    ))}
                  </select>
                )}
              </div>
              {selectedCount > 0 && (
                <button
                  onClick={generateMassRoll}
                  disabled={generating}
                  className="px-4 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50"
                >
                  {generating ? "Generating…" : `Generate MassRoll (${selectedCount})`}
                </button>
              )}
            </div>

            {visible.length === 0 ? (
              <p className="text-sm text-gray-400">No records match the current filter.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-gray-200">
                <table className="min-w-full text-xs text-gray-700">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-3 py-2 text-left">
                        <input
                          ref={selectAllRef}
                          type="checkbox"
                          checked={allVisibleSelected}
                          onChange={toggleAll}
                          className="rounded"
                        />
                      </th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">ESI ID</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Broker</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Rate</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Term</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Start Date</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Meter Fee</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">Paired Plan</th>
                      <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">LMP</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {visible.map((rec) => {
                      const isSelected = selected.has(rec.sid);
                      return (
                        <tr
                          key={`${rec.sid}-${rec.esiid ?? ""}`}
                          onClick={() => toggleRow(rec.sid)}
                          className={`cursor-pointer transition-colors ${
                            isSelected ? "bg-sky-50" : "hover:bg-gray-50"
                          }`}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleRow(rec.sid)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded"
                            />
                          </td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{rec.esiid || "—"}</td>
                          <td className="px-3 py-2 max-w-[180px] truncate" title={rec.customer_name}>
                            {rec.customer_name}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span className="font-medium">{rec.broker_code}</span>
                            {rec.broker_name && (
                              <span className="text-gray-400 ml-1">· {rec.broker_name}</span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtRate(rec.contract_rate)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{rec.term ? `${rec.term}mo` : "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{rec.start_date || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap tabular-nums">{fmtFee(rec.meter_fees)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {rec.suggested_plan ? (
                              <span title={rec.suggested_plan_name || ""} className="text-sky-700 font-medium">
                                {rec.suggested_plan}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {rec.paired_plan ? (
                              <span title={rec.paired_plan_name || ""} className="text-indigo-600">
                                {rec.paired_plan}
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {rec.lmp ? (
                              <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-medium">
                                LMP
                              </span>
                            ) : (
                              <span className="text-gray-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
