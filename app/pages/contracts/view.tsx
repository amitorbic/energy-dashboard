"use client";
import { Fragment, useEffect, useState } from "react";
import ContractLayout from "../../components/ContractLayout";
import { useRouter } from "next/router";
import api from "../../utils/api";

interface Confirmation {
  sid: number;
  contract_no: string;
  customer_name: string;
  broker_code: string;
  broker_name: string;
  term: string;
  start_date: string;
  contract_rate: string;
  ap_quote: string;
  type_of_contract: string;
  lmp: number;
  sent_by: string;
  date_modified: string;
  asap: number;
  meter_read: number;
  prior_day: number;
  nodal: number;
  credit_status: number;
  contract_received: number;
  executed: number;
  forwarded: number;
  paper_bill: number;
  switch_flag: number;
  pmvi: number;
  mvi: number;
  cust_first_name: string;
  cust_last_name: string;
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  plan_group: string;
  plan_id: string;
}

const startTypeBadges = (r: Confirmation) => {
  const badges: string[] = [];
  if (r.asap) badges.push("ASAP");
  if (r.meter_read) badges.push("Meter Read");
  if (r.pmvi) badges.push("PMVI");
  if (r.mvi) badges.push("MVI");
  if (r.switch_flag) badges.push("Switch");
  return badges;
};

const yesNo = (v: number) => (v ? "Yes" : "No");

export default function ViewConfirmations() {
  const router = useRouter();
  const [rows, setRows]       = useState<Confirmation[]>([]);
  const [total, setTotal]     = useState(0);
  const [page, setPage]       = useState(1);
  const [search, setSearch]   = useState("");
  const [loading, setLoading] = useState(false);
  const [expandedSid, setExpandedSid] = useState<number | null>(null);
  const limit = 50;

  const load = async (p = 1, q = search) => {
    setLoading(true);
    try {
      const r = await api.get(`/contracts/list?page=${p}&limit=${limit}&search=${encodeURIComponent(q)}`);
      setRows(r.data.data);
      setTotal(r.data.total);
      setPage(p);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(1, ""); }, []);

  const totalPages = Math.ceil(total / limit);

  return (
    <ContractLayout title="View All Confirmations">
      <div className="max-w-6xl">

        {/* Search */}
        <div className="flex items-center gap-3 mb-4">
          <input
            className="rounded-[var(--r-md)] px-3 py-1.5 text-sm w-72 border focus:outline-none focus:border-[var(--accent-light)]"
            style={{ background: "var(--ct-surface)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            placeholder="Search customer, contract no, broker..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => e.key === "Enter" && load(1, search)}
          />
          <button
            onClick={() => load(1, search)}
            className="px-4 py-1.5 text-sm rounded-[var(--r-md)] transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            Search
          </button>
          {search && (
            <button
              onClick={() => { setSearch(""); load(1, ""); }}
              className="text-xs transition-colors"
              style={{ color: "var(--ct-text-muted)" }}
            >
              Clear
            </button>
          )}
          <span className="text-xs ml-auto" style={{ color: "var(--ct-text-muted)" }}>{total} records</span>
        </div>

        {/* Table */}
        <div
          className="rounded-[var(--r-lg)] border overflow-x-auto"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
        >
          <table className="w-full text-sm" style={{ minWidth: 1100 }}>
            <thead>
              <tr className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                {["Contract No", "Customer", "Broker", "Term", "Start Date", "Start Type", "Rate", "Company Quote", "Type", "Sent By", "Date", ""].map(h => (
                  <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={12} className="text-center py-8 text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading...</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-8 text-sm" style={{ color: "var(--ct-text-muted)" }}>No confirmations found</td></tr>
              ) : rows.map((r, i) => (
                <Fragment key={r.sid}>
                  <tr className="border-b cursor-pointer transition-colors hover:bg-[var(--ct-surface-hover)]"
                    style={{ borderColor: "var(--ct-border-subtle)", background: i % 2 === 0 ? "transparent" : "var(--ct-canvas)" }}
                    onClick={() => router.push(`/contracts/edit?sid=${r.sid}`)}>
                    <td className="px-3 py-2 font-mono text-xs" style={{ color: "var(--accent-light)" }}>{r.contract_no}</td>
                    <td className="px-3 py-2 font-medium" style={{ color: "var(--ct-text-primary)" }}>{r.customer_name}</td>
                    <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.broker_name || r.broker_code}</td>
                    <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.term}mo</td>
                    <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.start_date}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1 flex-wrap">
                        {startTypeBadges(r).length === 0 ? (
                          <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>—</span>
                        ) : startTypeBadges(r).map(b => (
                          <span key={b} className="text-[10px] px-1.5 py-0.5 rounded-[var(--r-sm)] font-medium"
                            style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)", border: "1px solid var(--ct-border-default)" }}>
                            {b}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.contract_rate}</td>
                    <td className="px-3 py-2" style={{ color: "var(--ct-text-secondary)" }}>{r.ap_quote}</td>
                    <td className="px-3 py-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-[var(--r-sm)] font-medium"
                        style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
                      >
                        {r.lmp ? "LMP" : r.type_of_contract}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>{r.sent_by}</td>
                    <td className="px-3 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>{r.date_modified}</td>
                    <td className="px-3 py-2 text-xs" onClick={(e) => { e.stopPropagation(); setExpandedSid(expandedSid === r.sid ? null : r.sid); }}>
                      <span style={{ color: "var(--accent-light)" }}>{expandedSid === r.sid ? "Hide ▲" : "Details ▼"}</span>
                    </td>
                  </tr>
                  {expandedSid === r.sid && (
                    <tr style={{ background: "var(--ct-surface-hover)" }}>
                      <td colSpan={12} className="px-5 py-4">
                        <div className="grid grid-cols-4 gap-x-6 gap-y-2 text-xs">
                          <div><span style={{ color: "var(--ct-text-muted)" }}>Credit Approved:</span> <span style={{ color: "var(--ct-text-primary)" }}>{yesNo(r.credit_status)}</span></div>
                          <div><span style={{ color: "var(--ct-text-muted)" }}>Contract Received/Signed:</span> <span style={{ color: "var(--ct-text-primary)" }}>{yesNo(r.contract_received)}</span></div>
                          <div><span style={{ color: "var(--ct-text-muted)" }}>Executed:</span> <span style={{ color: "var(--ct-text-primary)" }}>{yesNo(r.executed)}</span></div>
                          <div><span style={{ color: "var(--ct-text-muted)" }}>Forwarded for Enrollment:</span> <span style={{ color: "var(--ct-text-primary)" }}>{yesNo(r.forwarded)}</span></div>
                          <div><span style={{ color: "var(--ct-text-muted)" }}>Paper Bill Required:</span> <span style={{ color: "var(--ct-text-primary)" }}>{yesNo(r.paper_bill)}</span></div>
                          <div><span style={{ color: "var(--ct-text-muted)" }}>Prior Day Pricing:</span> <span style={{ color: "var(--ct-text-primary)" }}>{yesNo(r.prior_day)}</span></div>
                          <div><span style={{ color: "var(--ct-text-muted)" }}>Nodal:</span> <span style={{ color: "var(--ct-text-primary)" }}>{yesNo(r.nodal)}</span></div>
                          <div><span style={{ color: "var(--ct-text-muted)" }}>Plan Group / ID:</span> <span style={{ color: "var(--ct-text-primary)" }}>{r.plan_group || "—"} / {r.plan_id || "—"}</span></div>
                          <div className="col-span-2"><span style={{ color: "var(--ct-text-muted)" }}>Customer Name:</span> <span style={{ color: "var(--ct-text-primary)" }}>{[r.cust_first_name, r.cust_last_name].filter(Boolean).join(" ") || "—"}</span></div>
                          <div className="col-span-2"><span style={{ color: "var(--ct-text-muted)" }}>Billing Address:</span> <span style={{ color: "var(--ct-text-primary)" }}>{[r.billing_address, r.billing_city, r.billing_state, r.billing_zip].filter(Boolean).join(", ") || "—"}</span></div>
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center gap-2 mt-4 justify-end">
            <button disabled={page === 1} onClick={() => load(page - 1)}
              className="px-3 py-1 text-sm rounded-[var(--r-md)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}>← Prev</button>
            <span className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Page {page} of {totalPages}</span>
            <button disabled={page === totalPages} onClick={() => load(page + 1)}
              className="px-3 py-1 text-sm rounded-[var(--r-md)] border disabled:opacity-40 transition-colors hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}>Next →</button>
          </div>
        )}
      </div>
    </ContractLayout>
  );
}
