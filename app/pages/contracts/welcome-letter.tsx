"use client";
import { useEffect, useState } from "react";
import ContractLayout from "../../components/ContractLayout";
import api from "../../utils/api";

const inputCls =
  "w-full rounded-[var(--r-sm)] px-3 py-1.5 text-sm border focus:outline-none focus:border-[var(--accent-light)]";
const inputStyle = { background: "var(--ct-surface)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" };
const labelCls = "text-sm font-medium w-40 flex-shrink-0";
const labelStyle = { color: "var(--ct-text-secondary)" };

interface Confirmation {
  sid: number;
  date_modified: string;
  customer_name: string;
  broker_name: string;
  contract_rate: string;
  commission: string;
  mill: string;
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
              className="rounded-[var(--r-md)] px-3 py-1.5 text-sm w-64 border focus:outline-none focus:border-[var(--accent-light)]"
              style={inputStyle}
              placeholder="Search customer or broker..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadList(1, search)}
            />
            <button
              onClick={() => loadList(1, search)}
              className="px-4 py-1.5 text-sm rounded-[var(--r-md)] transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              Search
            </button>
            <button
              onClick={() => {
                setSearch("");
                loadList(1, "");
              }}
              className="px-4 py-1.5 text-sm rounded-[var(--r-md)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
            >
              Browse all
            </button>
            <span className="text-xs ml-auto" style={{ color: "var(--ct-text-muted)" }}>
              {total} records
            </span>
          </div>

          <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
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
                      className="text-left px-2 py-2.5 font-semibold uppercase tracking-wide whitespace-nowrap"
                      style={{ color: "var(--ct-text-muted)" }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={16} className="text-center py-8" style={{ color: "var(--ct-text-muted)" }}>
                      Loading...
                    </td>
                  </tr>
                ) : rows.length === 0 ? (
                  <tr>
                    <td colSpan={16} className="text-center py-8" style={{ color: "var(--ct-text-muted)" }}>
                      No records found
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr
                      key={r.sid}
                      className="border-b"
                      style={{ borderColor: "var(--ct-border-subtle)", background: i % 2 === 0 ? "transparent" : "var(--ct-canvas)" }}
                    >
                      <td className="px-2 py-2" style={{ color: "var(--ct-text-secondary)" }}>
                        {(page - 1) * limit + i + 1}
                      </td>
                      <td className="px-2 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>
                        {r.date_modified}
                      </td>
                      <td className="px-2 py-2 font-medium" style={{ color: "var(--ct-text-primary)" }}>
                        {r.customer_name}
                      </td>
                      <td className="px-2 py-2">
                        <button
                          onClick={() => handleSelect(r)}
                          className="px-2 py-1 rounded-[var(--r-sm)] text-xs whitespace-nowrap transition-colors"
                          style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                        >
                          Open →
                        </button>
                      </td>
                      <td className="px-2 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_name}</td>
                      <td className="px-2 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_rate}</td>
                      <td className="px-2 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.commission}</td>
                      <td className="px-2 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.mill}</td>
                      <td className="px-2 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.ap_quote}</td>
                      <td className="px-2 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.term}</td>
                      <td className="px-2 py-2 whitespace-nowrap" style={{ color: "var(--ct-text-secondary)" }}>
                        {r.start_date}
                      </td>
                      <td className="px-2 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.type_of_contract}</td>
                      <td className="px-2 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.esid_count}</td>
                      <td className="px-2 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.meter_fees}</td>
                      <td className="px-2 py-2 max-w-32 truncate" style={{ color: "var(--ct-text-secondary)" }}>
                        {r.comment}
                      </td>
                      <td className="px-2 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.sent_by}</td>
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
                className="px-3 py-1 text-sm rounded-[var(--r-md)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              >
                ← Prev
              </button>
              <span className="text-sm" style={{ color: "var(--ct-text-muted)" }}>
                Page {page} of {totalPages}
              </span>
              <button
                disabled={page === totalPages}
                onClick={() => loadList(page + 1)}
                className="px-3 py-1 text-sm rounded-[var(--r-md)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
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
            className="text-xs hover:underline"
            style={{ color: "var(--accent-light)" }}
          >
            ← Back to list
          </button>
          <span className="text-sm font-medium" style={{ color: "var(--ct-text-secondary)" }}>
            {selected?.customer_name}
          </span>
        </div>

        <div className="rounded-[var(--r-lg)] border p-5 mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--ct-text-muted)" }}>
            Customer Details
          </h2>

          <div className="flex items-center gap-3 mb-3">
            <span className={labelCls} style={labelStyle}>Customer Email</span>
            <input
              className={inputCls}
              style={inputStyle}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Multiple emails comma separated"
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={labelCls} style={labelStyle}>Company Name</span>
            <input
              className={inputCls}
              style={inputStyle}
              value={selected?.customer_name || ""}
              disabled
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={labelCls} style={labelStyle}>Signor&apos;s Name (Attn)</span>
            <input
              className={inputCls}
              style={inputStyle}
              value={sname}
              onChange={(e) => setSname(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={labelCls} style={labelStyle}>Address Line 1</span>
            <input
              className={inputCls}
              style={inputStyle}
              value={addr1}
              onChange={(e) => setAddr1(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={labelCls} style={labelStyle}>Address Line 2</span>
            <input
              className={inputCls}
              style={inputStyle}
              value={addr2}
              onChange={(e) => setAddr2(e.target.value)}
            />
          </div>
        </div>

        <div className="rounded-[var(--r-lg)] border p-5 mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--ct-text-muted)" }}>
            Contract Details
          </h2>

          <div className="flex items-center gap-3 mb-3">
            <span className={labelCls} style={labelStyle}>Contract Start Date</span>
            <input
              className={inputCls}
              style={inputStyle}
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={labelCls} style={labelStyle}>Term (months)</span>
            <input
              className={inputCls}
              style={inputStyle}
              value={term}
              onChange={(e) => setTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={labelCls} style={labelStyle}>Date</span>
            <input
              className={inputCls}
              style={inputStyle}
              value={curDate}
              onChange={(e) => setCurDate(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-3 mb-3">
            <span className={labelCls} style={labelStyle}>TDSP</span>
            <select
              className={inputCls}
              style={inputStyle}
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

        <div className="rounded-[var(--r-lg)] border p-5 mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold uppercase tracking-widest" style={{ color: "var(--ct-text-muted)" }}>
              ESI IDs
            </h2>
            <button
              onClick={addEsidRow}
              className="text-xs hover:underline"
              style={{ color: "var(--accent-light)" }}
            >
              + Add row
            </button>
          </div>
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_1.5fr_1.5fr_auto] gap-2 text-xs font-medium px-1" style={{ color: "var(--ct-text-muted)" }}>
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
                  className={inputCls}
                  style={inputStyle}
                  value={row.esid}
                  onChange={(e) => updateEsidRow(i, "esid", e.target.value)}
                  placeholder="ESI ID"
                />
                <input
                  className={inputCls}
                  style={inputStyle}
                  value={row.service_address}
                  onChange={(e) =>
                    updateEsidRow(i, "service_address", e.target.value)
                  }
                  placeholder="Address"
                />
                <input
                  className={inputCls}
                  style={inputStyle}
                  value={row.city_state_zip}
                  onChange={(e) =>
                    updateEsidRow(i, "city_state_zip", e.target.value)
                  }
                  placeholder="City, ST ZIP"
                />
                <button
                  onClick={() => removeEsidRow(i)}
                  className="text-sm px-1 transition-colors hover:text-[var(--danger-light)]"
                  style={{ color: "var(--ct-text-muted)" }}
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        </div>

        {result && (
          <div
            className="text-sm px-4 py-2 rounded-[var(--r-md)] mb-3"
            style={
              result.includes("Failed")
                ? { background: "var(--danger-light-tint)", color: "var(--danger-light)" }
                : { background: "var(--success-light-tint)", color: "var(--success-light)" }
            }
          >
            {result}
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={handleDownloadPdf}
            disabled={generating}
            className="px-5 py-2 text-sm rounded-[var(--r-md)] border disabled:opacity-50 transition-colors hover:bg-[var(--ct-surface-hover)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
          >
            {generating ? "Generating..." : "Download PDF"}
          </button>
          <button
            onClick={handleSendEmail}
            disabled={sending}
            className="px-5 py-2 text-sm font-medium rounded-[var(--r-md)] disabled:opacity-50 transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            {sending ? "Sending..." : "Send to Customer"}
          </button>
        </div>
      </div>
    </ContractLayout>
  );
}
