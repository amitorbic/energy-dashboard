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
  type_of_contract: string | null;
}

const ERCOT_TYPES = new Set(["New", "now", "Addition"]);
const INTERNAL_TYPES = new Set(["Renewal", "Assignment", "B&E", "Blend & Extend"]);

function typeBadge(t: string | null) {
  const v = t || "New";
  if (v === "New" || v === "now")
    return <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-sky-100 text-sky-700 font-medium">{v === "now" ? "New" : v}</span>;
  if (v === "Addition")
    return <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-teal-100 text-teal-700 font-medium">Addition</span>;
  if (v === "Renewal")
    return <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-indigo-100 text-indigo-700 font-medium">Renewal</span>;
  if (v === "Assignment")
    return <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-purple-100 text-purple-700 font-medium">Assignment</span>;
  return <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-medium">{v}</span>;
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

const TH = "px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider";

function RecordTable({
  records,
  selected,
  onToggleRow,
  onToggleAll,
  selectAllRef,
}: {
  records: PendingRecord[];
  selected: Set<number>;
  onToggleRow: (sid: number) => void;
  onToggleAll: () => void;
  selectAllRef: React.RefObject<HTMLInputElement | null>;
}) {
  const allSelected = records.length > 0 && records.every((r) => selected.has(r.sid));

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
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full text-xs text-gray-700">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-3 py-2 text-left">
              <input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={onToggleAll} className="rounded" />
            </th>
            <th className={`${TH} whitespace-nowrap`}>ESI ID</th>
            <th className={TH}>Customer</th>
            <th className={TH}>Broker</th>
            <th className={TH}>Type</th>
            <th className={`${TH} whitespace-nowrap`}>Rate</th>
            <th className={TH}>Term</th>
            <th className={`${TH} whitespace-nowrap`}>Start Date</th>
            <th className={`${TH} whitespace-nowrap`}>Meter Fee</th>
            <th className={TH}>Plan</th>
            <th className={`${TH} whitespace-nowrap`}>Paired Plan</th>
            <th className={TH}>LMP</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {records.map((rec) => {
            const isSelected = selected.has(rec.sid);
            return (
              <tr
                key={`${rec.sid}-${rec.esiid ?? ""}`}
                onClick={() => onToggleRow(rec.sid)}
                className={`cursor-pointer transition-colors ${isSelected ? "bg-sky-50" : "hover:bg-gray-50"}`}
              >
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleRow(rec.sid)}
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
                  {rec.broker_name && <span className="text-gray-400 ml-1">· {rec.broker_name}</span>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{typeBadge(rec.type_of_contract)}</td>
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
                    <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-amber-100 text-amber-700 font-medium">LMP</span>
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
  );
}

export default function EnrollmentEngine() {
  const [dateFrom, setDateFrom] = useState(todayMinus(7));
  const [dateTo, setDateTo] = useState(todayMinus(0));
  const [brokerFilter, setBrokerFilter] = useState("");
  const [records, setRecords] = useState<PendingRecord[]>([]);
  const [selectedErcot, setSelectedErcot] = useState<Set<number>>(new Set());
  const [selectedInternal, setSelectedInternal] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [creatingInternal, setCreatingInternal] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [skipped, setSkipped] = useState<{esi_id: string; customer_name: string; reason: string}[]>([]);
  const selectAllErcotRef = useRef<HTMLInputElement>(null);
  const selectAllInternalRef = useRef<HTMLInputElement>(null);

  const ercotRecords = records.filter(
    (r) => !r.type_of_contract || ERCOT_TYPES.has(r.type_of_contract)
  );
  const internalRecords = records.filter(
    (r) => r.type_of_contract !== null && INTERNAL_TYPES.has(r.type_of_contract)
  );

  const brokers = Array.from(
    new Map(records.map((r) => [r.broker_code, r.broker_name || r.broker_code])).entries()
  ).sort((a, b) => a[0].localeCompare(b[0]));

  const ercotVisible = brokerFilter ? ercotRecords.filter((r) => r.broker_code === brokerFilter) : ercotRecords;
  const internalVisible = brokerFilter ? internalRecords.filter((r) => r.broker_code === brokerFilter) : internalRecords;

  // Sync select-all indeterminate state for each table
  useEffect(() => {
    if (!selectAllErcotRef.current) return;
    const sids = ercotVisible.map((r) => r.sid);
    const sel = sids.filter((s) => selectedErcot.has(s));
    selectAllErcotRef.current.indeterminate = sel.length > 0 && sel.length < sids.length;
  }, [selectedErcot, ercotVisible]);

  useEffect(() => {
    if (!selectAllInternalRef.current) return;
    const sids = internalVisible.map((r) => r.sid);
    const sel = sids.filter((s) => selectedInternal.has(s));
    selectAllInternalRef.current.indeterminate = sel.length > 0 && sel.length < sids.length;
  }, [selectedInternal, internalVisible]);

  async function loadRecords() {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setSelectedErcot(new Set());
    setSelectedInternal(new Set());
    setSkipped([]);
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

  function toggleErcotRow(sid: number) {
    setSelectedErcot((prev) => {
      const next = new Set(prev);
      next.has(sid) ? next.delete(sid) : next.add(sid);
      return next;
    });
  }

  function toggleAllErcot() {
    const sids = ercotVisible.map((r) => r.sid);
    const allSel = sids.every((s) => selectedErcot.has(s));
    setSelectedErcot((prev) => {
      const next = new Set(prev);
      if (allSel) sids.forEach((s) => next.delete(s));
      else sids.forEach((s) => next.add(s));
      return next;
    });
  }

  function toggleInternalRow(sid: number) {
    setSelectedInternal((prev) => {
      const next = new Set(prev);
      next.has(sid) ? next.delete(sid) : next.add(sid);
      return next;
    });
  }

  function toggleAllInternal() {
    const sids = internalVisible.map((r) => r.sid);
    const allSel = sids.every((s) => selectedInternal.has(s));
    setSelectedInternal((prev) => {
      const next = new Set(prev);
      if (allSel) sids.forEach((s) => next.delete(s));
      else sids.forEach((s) => next.add(s));
      return next;
    });
  }

  async function generateMassRoll() {
    const sids = Array.from(selectedErcot);
    if (!sids.length) return;
    setGenerating(true);
    setError(null);
    setSuccessMsg(null);
    setSkipped([]);
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

      const skippedHeader = res.headers["x-enrollment-skipped"];
      const skippedList: {esi_id: string; customer_name: string; reason: string}[] = skippedHeader
        ? (() => { try { return JSON.parse(skippedHeader); } catch { return []; } })()
        : [];
      setSkipped(skippedList);

      const generatedSet = new Set(sids);
      setRecords((prev) => prev.filter((r) => !generatedSet.has(r.sid)));
      setSelectedErcot(new Set());
      const enrolledCount = sids.length - skippedList.length;
      setSuccessMsg(
        `MasterRoll generated — ${enrolledCount} record${enrolledCount !== 1 ? "s" : ""} enrolled. File: ${filename}`
      );
    } catch (e: any) {
      if (e?.response?.data instanceof Blob) {
        const text = await e.response.data.text();
        try { setError(JSON.parse(text)?.detail || "Generation failed"); }
        catch { setError("Generation failed"); }
      } else {
        setError(e?.response?.data?.detail || "Generation failed");
      }
    } finally {
      setGenerating(false);
    }
  }

  async function createInternalBatch() {
    const sids = Array.from(selectedInternal);
    if (!sids.length) return;
    setCreatingInternal(true);
    setError(null);
    setSuccessMsg(null);
    setSkipped([]);
    try {
      const res = await api.post("/enrollment-engine/create-internal-batch", { record_sids: sids });
      const { batch_no, inserted, skipped: sk } = res.data;
      setSkipped(sk || []);
      const processedSet = new Set(sids);
      setRecords((prev) => prev.filter((r) => !processedSet.has(r.sid)));
      setSelectedInternal(new Set());
      setSuccessMsg(
        `Internal batch #${batch_no} created — ${inserted} record${inserted !== 1 ? "s" : ""} queued. Go to Batch History to mark active.`
      );
    } catch (e: any) {
      setError(e?.response?.data?.detail || "Failed to create internal batch");
    } finally {
      setCreatingInternal(false);
    }
  }

  const ercotSelectedCount = Array.from(selectedErcot).filter((s) =>
    ercotVisible.some((r) => r.sid === s)
  ).length;
  const internalSelectedCount = Array.from(selectedInternal).filter((s) =>
    internalVisible.some((r) => r.sid === s)
  ).length;

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
        {skipped.length > 0 && (
          <div className="bg-yellow-50 border border-yellow-300 text-yellow-800 text-sm px-4 py-3 rounded space-y-1">
            <div className="font-semibold">
              {skipped.length} ESI ID{skipped.length !== 1 ? "s" : ""} skipped — active contract already exists:
            </div>
            <ul className="list-disc list-inside space-y-0.5 mt-1">
              {skipped.map((s) => (
                <li key={s.esi_id} className="font-mono text-xs">
                  {s.esi_id}{s.customer_name ? ` — ${s.customer_name}` : ""}
                </li>
              ))}
            </ul>
            <div className="text-xs text-yellow-600 mt-1">
              Cancel the existing contracts before re-enrolling these ESI IDs.
            </div>
          </div>
        )}

        {/* Results */}
        {loaded && (
          <>
            {/* Broker filter */}
            <div className="flex items-center gap-3">
              <span className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{records.length}</span> record
                {records.length !== 1 ? "s" : ""} pending enrollment
              </span>
              {records.length > 0 && (
                <select
                  value={brokerFilter}
                  onChange={(e) => { setBrokerFilter(e.target.value); setSelectedErcot(new Set()); setSelectedInternal(new Set()); }}
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

            {/* ── ERCOT Submissions ─────────────────────────────────── */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                    ERCOT Submissions
                  </h2>
                  <p className="text-xs text-gray-400">New enrollments · Additions</p>
                </div>
                {ercotSelectedCount > 0 && (
                  <button
                    onClick={generateMassRoll}
                    disabled={generating}
                    className="px-4 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {generating ? "Generating…" : `Generate MassRoll (${ercotSelectedCount})`}
                  </button>
                )}
              </div>
              {ercotVisible.length === 0 ? (
                <p className="text-sm text-gray-400 py-3">No pending records.</p>
              ) : (
                <RecordTable
                  records={ercotVisible}
                  selected={selectedErcot}
                  onToggleRow={toggleErcotRow}
                  onToggleAll={toggleAllErcot}
                  selectAllRef={selectAllErcotRef}
                />
              )}
            </div>

            {/* ── Internal Processing ───────────────────────────────── */}
            <div className="space-y-2 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800 uppercase tracking-wide">
                    Internal Processing
                  </h2>
                  <p className="text-xs text-gray-400">Renewals · Assignments · Blend &amp; Extend</p>
                </div>
                {internalSelectedCount > 0 && (
                  <button
                    onClick={createInternalBatch}
                    disabled={creatingInternal}
                    className="px-4 py-1.5 bg-indigo-600 text-white text-sm font-medium rounded hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {creatingInternal ? "Creating…" : `Create Internal Batch (${internalSelectedCount})`}
                  </button>
                )}
              </div>
              {internalVisible.length === 0 ? (
                <p className="text-sm text-gray-400 py-3">No pending records.</p>
              ) : (
                <RecordTable
                  records={internalVisible}
                  selected={selectedInternal}
                  onToggleRow={toggleInternalRow}
                  onToggleAll={toggleAllInternal}
                  selectAllRef={selectAllInternalRef}
                />
              )}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
