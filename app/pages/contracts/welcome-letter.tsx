"use client";
import { useEffect, useState } from "react";
import ContractLayout from "../../components/ContractLayout";
import api from "../../utils/api";

const INPUT =
  "w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-400";
const LABEL = "text-sm font-medium text-gray-600 w-40 flex-shrink-0";

interface Confirmation {
  sid: number;
  date_modified: string;
  customer_name: string;
  broker_name: string;
  contract_rate: string;
  commission: string;
  ameripower_mill: string;
  ap_quote: string;
  term: string;
  start_date: string;
  type_of_contract: string;
  esid_count: string;
  meter_fees: string;
  comment: string;
  sent_by: string;
  customer_email: string;
  esiid: string;
}

interface EsidRow {
  esid: string;
  service_address: string;
  city_state_zip: string;
}

type View = "list" | "form";

export default function WelcomeLetterPage() {
  const [view, setView] = useState<View>("list");
  const [rows, setRows] = useState<Confirmation[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<Confirmation | null>(null);
  const [sending, setSending] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState("");

  // Form state
  const [email, setEmail] = useState("");
  const [sname, setSname] = useState("");
  const [addr1, setAddr1] = useState("");
  const [addr2, setAddr2] = useState("");
  const [startDate, setStartDate] = useState("");
  const [term, setTerm] = useState("");
  const [curDate, setCurDate] = useState(
    new Date().toLocaleDateString("en-US"),
  );
  const [tdsp, setTdsp] = useState("Oncor");
  const [esidRows, setEsidRows] = useState<EsidRow[]>([
    { esid: "", service_address: "", city_state_zip: "" },
  ]);

  const limit = 50;

  const loadList = async (p = 1, q = search) => {
    setLoading(true);
    try {
      const r = await api.get(
        `/contracts/welcome-letter/list?page=${p}&limit=${limit}&search=${encodeURIComponent(q)}`,
      );
      setRows(r.data.data);
      setTotal(r.data.total);
      setPage(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadList(1, "");
  }, []);

  const handleSelect = (row: Confirmation) => {
    setSelected(row);
    setEmail(row.customer_email || "");
    setStartDate(row.start_date || "");
    setTerm(row.term || "");
    // Pre-fill esid rows from esiid field
    if (row.esiid) {
      const esids = row.esiid
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean);
      setEsidRows(
        esids.map((e) => ({
          esid: e,
          service_address: "",
          city_state_zip: "",
        })),
      );
    } else {
      setEsidRows([{ esid: "", service_address: "", city_state_zip: "" }]);
    }
    setView("form");
    setResult("");
  };

  const addEsidRow = () =>
    setEsidRows((prev) => [
      ...prev,
      { esid: "", service_address: "", city_state_zip: "" },
    ]);

  const removeEsidRow = (i: number) =>
    setEsidRows((prev) => prev.filter((_, idx) => idx !== i));

  const updateEsidRow = (i: number, field: keyof EsidRow, val: string) =>
    setEsidRows((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)),
    );

  const buildPayload = () => ({
    company_name: selected?.customer_name || "",
    email,
    sname,
    caddress1: addr1,
    caddress2: addr2,
    start_date: startDate,
    term,
    cur_date: curDate,
    tdsp,
    esids: esidRows.filter((r) => r.esid),
    sent_by: selected?.sent_by || "",
    confirmation_sid: selected?.sid,
  });

  const handleDownloadPdf = async () => {
    setGenerating(true);
    try {
      const r = await api.post(
        "/contracts/welcome-letter/generate-pdf",
        buildPayload(),
        {
          responseType: "blob",
        },
      );
      const url = URL.createObjectURL(
        new Blob([r.data], { type: "application/pdf" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `Welcome_Letter_${selected?.customer_name}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      setResult("PDF downloaded successfully.");
    } catch {
      setResult("Failed to generate PDF. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const handleSendEmail = async () => {
    if (!email) {
      setResult("Please enter customer email.");
      return;
    }
    setSending(true);
    try {
      await api.post("/contracts/welcome-letter/send-email", buildPayload());
      setResult(`Welcome letter sent to ${email}`);
    } catch {
      setResult("Failed to send email. Try again.");
    } finally {
      setSending(false);
    }
  };

  const totalPages = Math.ceil(total / limit);

  // ── LIST VIEW ─────────────────────────────────────────────────────────────
  if (view === "list")
    return (
      <ContractLayout title="Welcome Letter">
        <div className="max-w-6xl">
          <div className="flex items-center gap-3 mb-4">
            <input
              className="border border-gray-300 rounded px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-1 focus:ring-sky-400"
              placeholder="Search customer or broker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadList(1, search)}
            />
            <button
              onClick={() => loadList(1, search)}
              className="px-4 py-1.5 text-sm bg-sky-600 text-white rounded hover:bg-sky-700"
            >
              Search
            </button>
            <button
              onClick={() => {
                setSearch("");
                loadList(1, "");
              }}
              className="px-4 py-1.5 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
            >
              Browse all
            </button>
            <span className="text-xs text-gray-400 ml-auto">
              {total} records
            </span>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  {[
                    "#",
                    "Date",
                    "Customer Name",
                    "Welcome Letter",
                    "Broker",
                    "Rate",
                    "Commission",
                    "AP Mill",
                    "AP Quote",
                    "Term",
                    "Start",
                    "Type",
                    "ESIIDs",
                    "Meter Fees",
                    "Comments",
                    "Sent By",
                  ].map((h) => (
                    <th
                      key={h}
                      className="text-left px-2 py-2.5 font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={16} className="text-center py-8 text-gray-400">
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="text-center py-8 text-gray-400">
                      No records found
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr
                      key={r.sid}
                      className={`border-b border-gray-100 ${i % 2 === 0 ? "" : "bg-gray-50/50"}`}
                    >
                      <td className="px-2 py-2">
                        {(page - 1) * limit + i + 1}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {r.date_modified}
                      </td>
                      <td className="px-2 py-2 font-medium text-gray-800">
                        {r.customer_name}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => handleSelect(r)}
                          className="px-2 py-1 bg-sky-600 text-white rounded text-xs hover:bg-sky-700 whitespace-nowrap"
                        >
                          Open →
                        </button>
                      </td>
                      <td className="px-2 py-2">{r.broker_name}</td>
                      <td className="px-2 py-2">{r.contract_rate}</td>
                      <td className="px-2 py-2">{r.commission}</td>
                      <td className="px-2 py-2">{r.ameripower_mill}</td>
                      <td className="px-2 py-2">{r.ap_quote}</td>
                      <td className="px-2 py-2">{r.term}</td>
                      <td className="px-2 py-2 whitespace-nowrap">
                        {r.start_date}
                      </td>
                      <td className="px-2 py-2">{r.type_of_contract}</td>
                      <td className="px-2 py-2">{r.esid_count}</td>
                      <td className="px-2 py-2">{r.meter_fees}</td>
                      <td className="px-2 py-2 max-w-32 truncate">
                        {r.comment}
                      </td>
                      <td className="px-2 py-2">{r.sent_by}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center gap-2 mt-4 justify-end">
              <button
                disabled={page === 1}
                onClick={() => loadList(page - 1)}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-500">
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => loadList(page + 1)}
                className="px-3 py-1 text-sm border rounded disabled:opacity-40 hover:bg-gray-50"
              >
                Next →
              </button>
            </div>
          )}
        </div>
      </ContractLayout>
    );

  // ── FORM VIEW ─────────────────────────────────────────────────────────────
  return (
    <ContractLayout title="Welcome Letter">
      <div className="max-w-2xl">
        <div className="flex items-center gap-3 mb-5">
          <button
            onClick={() => setView("list")}
            className="text-xs text-sky-600 hover:underline"
          >
            ← Back to list
          </button>
          <span className="text-sm font-medium text-gray-700">
            {selected?.customer_name}
          </span>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Customer Details
          </h2>

          <div className="flex items-center gap-3 mb-3">
            <span className={LABEL}>Customer Email</span>
            <input
              className={INPUT}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Multiple emails comma separated"
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={LABEL}>Company Name</span>
            <input
              className={INPUT}
              value={selected?.customer_name || ""}
              disabled
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={LABEL}>Signor&apos;s Name (Attn)</span>
            <input
              className={INPUT}
              value={sname}
              onChange={(e) => setSname(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={LABEL}>Address Line 1</span>
            <input
              className={INPUT}
              value={addr1}
              onChange={(e) => setAddr1(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={LABEL}>Address Line 2</span>
            <input
              className={INPUT}
              value={addr2}
              onChange={(e) => setAddr2(e.target.value)}
            />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Contract Details
          </h2>

          <div className="flex items-center gap-3 mb-3">
            <span className={LABEL}>Contract Start Date</span>
            <input
              className={INPUT}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={LABEL}>Term (months)</span>
            <input
              className={INPUT}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={LABEL}>Date</span>
            <input
              className={INPUT}
              value={curDate}
              onChange={(e) => setCurDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={LABEL}>TDSP</span>
            <select
              className={INPUT}
              value={tdsp}
              onChange={(e) => setTdsp(e.target.value)}
            >
              <option>Oncor</option>
              <option>CenterPoint</option>
              <option>AEP</option>
              <option>TNMP</option>
              <option>Sharyland LLC</option>
              <option>Sharyland Utilities</option>
            </select>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest">
              ESI IDs
            </h2>
            <button
              onClick={addEsidRow}
              className="text-xs text-sky-600 hover:underline"
            >
              + Add row
            </button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1.5fr_1.5fr_auto] gap-2 text-xs font-medium text-gray-500 px-1">
              <span>ESI ID</span>
              <span>Service Address</span>
              <span>City/State/Zip</span>
              <span></span>
            </div>
            {esidRows.map((row, i) => (
              <div
                key={i}
                className="grid grid-cols-[1fr_1.5fr_1.5fr_auto] gap-2"
              >
                <input
                  className={INPUT}
                  value={row.esid}
                  onChange={(e) => updateEsidRow(i, "esid", e.target.value)}
                  placeholder="ESI ID"
                />
                <input
                  className={INPUT}
                  value={row.service_address}
                  onChange={(e) =>
                    updateEsidRow(i, "service_address", e.target.value)
                  }
                  placeholder="Address"
                />
                <input
                  className={INPUT}
                  value={row.city_state_zip}
                  onChange={(e) =>
                    updateEsidRow(i, "city_state_zip", e.target.value)
                  }
                  placeholder="City, ST ZIP"
                />
                <button
                  onClick={() => removeEsidRow(i)}
                  className="text-gray-400 hover:text-red-500 text-sm px-1"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {result && (
          <div
            className={`text-sm px-4 py-2 rounded mb-3 ${result.includes("Failed") ? "bg-red-50 text-red-700" : "bg-green-50 text-green-700"}`}
          >
            {result}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleDownloadPdf}
            disabled={generating}
            className="px-5 py-2 text-sm rounded border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {generating ? "Generating..." : "Download PDF"}
          </button>
          <button
            onClick={handleSendEmail}
            disabled={sending}
            className="px-5 py-2 text-sm font-medium rounded bg-sky-600 text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {sending ? "Sending..." : "Send to Customer"}
          </button>
        </div>
      </div>
    </ContractLayout>
  );
}
