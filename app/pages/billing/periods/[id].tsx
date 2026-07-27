import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import BillingEngineLayout from "../../../components/BillingEngineLayout";
import api from "../../../utils/api";

// ── types ─────────────────────────────────────────────────────────────────────

interface Charge {
  id: number;
  charge_source: string;
  charge_category: string;
  charge_code: string | null;
  description: string | null;
  amount: number;
  quantity: number | null;
  unit_rate: number | null;
  unit: string | null;
  is_taxable: number;
  sort_order: number;
}

interface BillingPeriod {
  id: number;
  esi_id: string;
  service_start: string;
  service_end: string;
  billing_days: number;
  usage_kwh: number | null;
  contract_rate: number | null;
  meter_fee: number | null;
  energy_charge: number | null;
  has_810: number;
  flags: string | null;
  status: "draft" | "reviewed" | "approved" | "invoiced";
  created_at: string;
  charges: Charge[];
}

interface Invoice {
  id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  supplier_charge: number;
  tdsp_total: number;
  taxable_subtotal: number;
  non_taxable_subtotal: number;
  tax_total: number;
  total_amount: number;
  status: string;
  pre_tax_flag: boolean;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function fmt2(v: number | null | undefined): string {
  if (v == null) return "—";
  return Number(v).toFixed(2);
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

const STATUS_COLORS: Record<string, string> = {
  draft:    "bg-gray-100 text-gray-600",
  reviewed: "bg-blue-50 text-blue-700",
  approved: "bg-green-50 text-green-700",
  invoiced: "bg-purple-50 text-purple-700",
};

const SOURCE_COLORS: Record<string, string> = {
  supplier: "bg-green-50 text-green-700",
  tdsp:     "bg-blue-50 text-blue-700",
};

function FlagTag({ label }: { label: string }) {
  return (
    <span className="inline-flex px-1.5 py-0.5 rounded text-xs font-medium bg-yellow-50 text-yellow-700 border border-yellow-200">
      {label.replace(/_/g, " ")}
    </span>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-800 font-medium text-right">{value}</span>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function BillingPeriodDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [period, setPeriod]       = useState<BillingPeriod | null>(null);
  const [invoice, setInvoice]     = useState<Invoice | null>(null);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg]   = useState("");

  const load = useCallback(async (pid: string) => {
    setLoading(true);
    setError("");
    try {
      const res = await api.get(`/billing-engine/periods/${pid}`);
      setPeriod(res.data);

      // try to load existing invoice
      try {
        const inv = await api.get(`/billing-engine/invoices/by-period/${pid}`);
        setInvoice(inv.data);
      } catch {
        setInvoice(null);
      }
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? "Failed to load billing period.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof id === "string") load(id);
  }, [id, load]);

  const advanceStatus = async (newStatus: "reviewed" | "approved") => {
    if (!period) return;
    setActionBusy(true);
    setActionMsg("");
    try {
      await api.patch(`/billing-engine/periods/${period.id}/status`, { status: newStatus });
      setPeriod((p) => p ? { ...p, status: newStatus } : p);
    } catch (e: any) {
      setActionMsg(e?.response?.data?.detail ?? "Status update failed.");
    } finally {
      setActionBusy(false);
    }
  };

  const generateInvoice = async () => {
    if (!period) return;
    setActionBusy(true);
    setActionMsg("");
    try {
      const res = await api.post(`/billing-engine/invoices/generate/${period.id}`);
      setPeriod((p) => p ? { ...p, status: "invoiced" } : p);
      setInvoice(res.data);
    } catch (e: any) {
      setActionMsg(e?.response?.data?.detail ?? "Invoice generation failed.");
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <BillingEngineLayout title="Billing Period">
        <div className="flex items-center gap-2 text-sm text-gray-400 py-12 justify-center">
          <Spinner /> Loading…
        </div>
      </BillingEngineLayout>
    );
  }

  if (error || !period) {
    return (
      <BillingEngineLayout title="Billing Period">
        <div className="px-4 py-3 bg-red-50 border border-red-200 rounded text-sm text-red-600">
          {error || "Period not found."}
        </div>
      </BillingEngineLayout>
    );
  }

  const flags: string[] = (() => {
    try { return period.flags ? JSON.parse(period.flags) : []; }
    catch { return []; }
  })();

  const isMultiSegment   = flags.includes("multi_contract_period");
  const blockingFlags    = flags.filter((f) => f === "expired_contract" || f === "contract_coverage_gap");
  const approvalBlocked  = blockingFlags.length > 0;
  const supplierRows  = period.charges.filter((c) => c.charge_source === "supplier");
  const tdspRows      = period.charges.filter((c) => c.charge_source === "tdsp");
  const tdspTotal     = tdspRows.reduce((s, c) => s + Number(c.amount), 0);
  const energyCharge  = period.energy_charge != null ? Number(period.energy_charge) : 0;
  const meterFee      = period.meter_fee     != null ? Number(period.meter_fee)     : 0;
  const supplierTotal = energyCharge + meterFee;
  const grandTotal    = supplierTotal + tdspTotal;

  return (
    <BillingEngineLayout title="Billing Period">
      {/* breadcrumb */}
      <div className="mb-5 flex items-center gap-2 text-xs text-gray-400">
        <Link href="/billing/periods">
          <span className="hover:text-green-600 cursor-pointer">Billing Periods</span>
        </Link>
        <span>›</span>
        <span className="text-gray-600 font-medium">Period #{period.id}</span>
      </div>

      <div className="grid grid-cols-3 gap-4">

        {/* ── left: period details ─────────────────────────────────────────── */}
        <div className="col-span-1 space-y-4">

          {/* period card */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Period Info</span>
              <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[period.status] ?? "bg-gray-100 text-gray-600"}`}>
                {period.status}
              </span>
            </div>
            <div className="px-4 py-2">
              <InfoRow label="ESI ID"        value={<span className="font-mono">{period.esi_id}</span>} />
              <InfoRow label="Service Start"  value={period.service_start} />
              <InfoRow label="Service End"    value={period.service_end} />
              <InfoRow label="Billing Days"   value={period.billing_days} />
              <InfoRow label="Usage (kWh)"    value={period.usage_kwh != null ? Number(period.usage_kwh).toFixed(4) : "—"} />
              {!isMultiSegment && (
                <InfoRow
                  label="Contract Rate"
                  value={period.contract_rate != null
                    ? `${(Number(period.contract_rate) * 100).toFixed(4)} ¢/kWh`
                    : "—"}
                />
              )}
              <InfoRow label="Energy Charge"  value={`$${fmt2(period.energy_charge)}`} />
              <InfoRow label="Meter Fee"      value={`$${fmt2(period.meter_fee)}`} />
              <InfoRow label="810 Received"   value={period.has_810 ? "Yes" : "No"} />
            </div>
            {flags.length > 0 && (
              <div className="px-4 pb-3">
                <div className="flex flex-wrap gap-1">
                  {flags.map((f) => <FlagTag key={f} label={f} />)}
                </div>
              </div>
            )}
          </div>

          {/* totals card */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">Charge Summary</span>
            </div>
            <div className="px-4 py-2">
              <InfoRow label="Energy Charge"  value={`$${energyCharge.toFixed(2)}`} />
              <InfoRow label="Meter Fee"      value={`$${meterFee.toFixed(2)}`} />
              <InfoRow label="Supplier Total" value={<span className="font-semibold">${supplierTotal.toFixed(2)}</span>} />
              <InfoRow label="TDSP Total"     value={`$${tdspTotal.toFixed(2)}`} />
              <div className="flex justify-between py-2 mt-1 border-t border-gray-200">
                <span className="text-xs font-semibold text-gray-700">Grand Total</span>
                <span className="text-sm font-bold text-gray-900">${grandTotal.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* workflow actions */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
              <span className="text-sm font-semibold text-gray-700">Actions</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              {period.status === "draft" && (
                <button
                  onClick={() => advanceStatus("reviewed")}
                  disabled={actionBusy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700 disabled:opacity-40 transition-colors"
                >
                  {actionBusy && <Spinner />}
                  Mark as Reviewed
                </button>
              )}
              {period.status === "reviewed" && !approvalBlocked && (
                <button
                  onClick={() => advanceStatus("approved")}
                  disabled={actionBusy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-40 transition-colors"
                >
                  {actionBusy && <Spinner />}
                  Approve
                </button>
              )}
              {period.status === "reviewed" && approvalBlocked && (
                <div className="px-3 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
                  <p className="font-medium mb-0.5">Approval blocked</p>
                  <p>{blockingFlags.map((f) => f.replace(/_/g, " ")).join(", ")} — resolve the contract issue first.</p>
                </div>
              )}
              {period.status === "approved" && !invoice && (
                <button
                  onClick={generateInvoice}
                  disabled={actionBusy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white text-sm font-medium rounded hover:bg-purple-700 disabled:opacity-40 transition-colors"
                >
                  {actionBusy && <Spinner />}
                  Generate Invoice
                </button>
              )}
              {period.status === "invoiced" && (
                <p className="text-xs text-center text-gray-400 py-1">
                  Invoice generated — no further actions.
                </p>
              )}
              {(period.status === "draft" || (period.status === "reviewed" && !approvalBlocked)) && !actionBusy && !actionMsg && (
                <p className="text-xs text-center text-gray-400">
                  {period.status === "draft"
                    ? "Review before approving."
                    : "Approve when charges are confirmed."}
                </p>
              )}
              {actionMsg && (
                <p className="text-xs text-red-500 text-center">{actionMsg}</p>
              )}
            </div>
          </div>

          {/* invoice card */}
          {invoice && (
            <div className="bg-white border border-purple-200 rounded-lg overflow-hidden">
              <div className="px-4 py-3 bg-purple-50 border-b border-purple-100">
                <span className="text-sm font-semibold text-purple-800">Invoice</span>
              </div>
              <div className="px-4 py-2">
                <InfoRow label="Invoice #"      value={<span className="font-mono">{invoice.invoice_number}</span>} />
                <InfoRow label="Date"           value={invoice.invoice_date} />
                <InfoRow label="Status"         value={invoice.status} />
                <InfoRow label="Supplier"       value={`$${fmt2(invoice.supplier_charge)}`} />
                <InfoRow label="TDSP"           value={`$${fmt2(invoice.tdsp_total)}`} />
                <InfoRow label="Tax"            value={invoice.pre_tax_flag ? <span className="text-yellow-600">$0.00 (pre-tax)</span> : `$${fmt2(invoice.tax_total)}`} />
                <div className="flex justify-between py-2 mt-1 border-t border-purple-100">
                  <span className="text-xs font-semibold text-gray-700">Total</span>
                  <span className="text-sm font-bold text-purple-800">${fmt2(invoice.total_amount)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── right: charges tables ────────────────────────────────────────── */}
        <div className="col-span-2 space-y-4">

          {/* supplier charges */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">Supplier Charges</span>
              <span className="text-xs text-green-700 font-medium">${supplierTotal.toFixed(2)}</span>
            </div>
            {supplierRows.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                No supplier charge rows (single-segment — energy_charge stored on period).
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Category</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Qty</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Rate</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Amount</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-medium">Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {supplierRows.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${SOURCE_COLORS["supplier"]}`}>
                            {c.charge_category}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{c.description ?? "—"}</td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {c.quantity != null ? Number(c.quantity).toFixed(4) : "—"}
                          {c.unit ? <span className="text-gray-400 ml-1">{c.unit}</span> : null}
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700">
                          {c.unit_rate != null ? Number(c.unit_rate).toFixed(6) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800">
                          ${Number(c.amount).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.is_taxable ? (
                            <span className="text-green-600 text-xs">✓</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* TDSP charges */}
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <span className="text-sm font-semibold text-gray-700">TDSP Charges</span>
              <span className="text-xs text-blue-700 font-medium">${tdspTotal.toFixed(2)}</span>
            </div>
            {tdspRows.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-gray-400">
                {period.has_810 ? "No charge line items from 810." : "No 810 uploaded for this period."}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Code</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Description</th>
                      <th className="px-3 py-2 text-left text-gray-500 font-medium">Category</th>
                      <th className="px-3 py-2 text-right text-gray-500 font-medium">Amount</th>
                      <th className="px-3 py-2 text-center text-gray-500 font-medium">Tax</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {tdspRows.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2">
                          <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                            {c.charge_code ?? "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600">{c.description ?? "—"}</td>
                        <td className="px-3 py-2 text-gray-500">{c.charge_category}</td>
                        <td className="px-3 py-2 text-right font-medium text-gray-800">
                          ${Number(c.amount).toFixed(2)}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {c.is_taxable ? (
                            <span className="text-green-600 text-xs">✓</span>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-200 bg-gray-50">
                      <td colSpan={3} className="px-3 py-2 text-xs font-medium text-gray-600">TDSP Total</td>
                      <td className="px-3 py-2 text-right text-sm font-bold text-gray-800">${tdspTotal.toFixed(2)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </div>

        </div>
      </div>
    </BillingEngineLayout>
  );
}
