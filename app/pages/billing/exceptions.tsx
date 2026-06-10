import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import BillingLayout from "../../components/BillingLayout";
import api from "../../utils/api";

// ── check metadata ────────────────────────────────────────────────────────────
const CHECKS = [
  { key: "check_tax_zero", label: "Check 1 — Tax amount is zero" },
  {
    key: "check_kh_qty_energy_zero",
    label: "Check 2 — KH Qty not zero and energy charge zero",
  },
  {
    key: "check_kh_qty_metered_mismatch",
    label: "Check 3 — KH Qty and metered usage does not match",
  },
  {
    key: "check_residential_puc_grt_city",
    label: "Check 4 — Residential: 100 under PUC, GRT, City tax",
  },
  {
    key: "check_residential_tax_exempt",
    label: "Check 5 — Residential: exempt from all taxes",
  },
  {
    key: "check_mcpe_bills",
    label: "Check 6 — MCPE bills billing period start date",
  },
  { key: "check_lmp_rate_range", label: "Check 7 — LMP rate > 8¢ or < 4¢/kWh" },
  {
    key: "check_sub_only_no_master",
    label: "Check 8 — Sub only accounts with no master",
  },
  {
    key: "check_commercial_tdsp",
    label: "Check 9 — Commercial TDSP < 30% of energy charges",
  },
  {
    key: "check_residential_price_low",
    label: "Check 10 — Residential price < 7.50¢/kWh",
  },
  {
    key: "check_residential_price_high",
    label: "Check 11 — Residential price > 15¢/kWh",
  },
  {
    key: "check_commercial_price_high",
    label: "Check 12 — Commercial > 13¢/kWh",
  },
  {
    key: "check_commercial_price_low",
    label: "Check 13 — Commercial < 3.6¢/kWh",
  },
  {
    key: "check_negative_balance",
    label: "Check 14 — Negative or low total balance",
  },
  { key: "check_zero_usage", label: "Check 15 — Zero usage customers" },
  {
    key: "check_partial_payment",
    label: "Check 16 — Partial payment customers",
  },
  { key: "check_zero_meter_fee", label: "Check 17 — Zero meter fees" },
  { key: "check_first_bill", label: "Check 18 — First bill" },
  { key: "check_final_bill", label: "Check 19 — Final bill" },
  {
    key: "check_master_sub_final",
    label: "Check 20 — Master/Sub account final billed",
  },
  { key: "check_state_tax_100", label: "Check 21 — State Tax Exempted" },
  {
    key: "check_credit_card_final",
    label: "Check 22 — Credit card final bill service fee",
  },
  {
    key: "check_autopay_balance",
    label: "Check 23 — Auto pay customer with balance",
  },
  { key: "check_wrong_meter_fee", label: "Check 24 — Wrong meter fee" },
  {
    key: "check_renewal_energy_high",
    label: "Check 25 — Renewal energy charges ≥ 0.13",
  },
  {
    key: "check_paid_amount_variance",
    label: "Check 26 — Paid amount variance > 80%",
  },
  {
    key: "check_single_bill_under_100",
    label: "Check 27 — Single bills under $100",
  },
  {
    key: "check_multi_contract_invoice",
    label: "Check 28 — Invoice billed with 2+ contracts",
  },
  {
    key: "check_old_autopay_balance",
    label: "Check 29 — Old auto pay customer with balance",
  },
  { key: "check_deposit_charges", label: "Check 30 — Deposit charges" },
  {
    key: "check_first_bill_going_final",
    label: "Check 31 — First bill going final",
  },
  { key: "check_potential_final", label: "Check 32 — Potential final billing" },
  { key: "check_difference_one_day", label: "Check 33 — Difference 1 day" },
  { key: "check_different_due_date", label: "Check 34 — Different due date" },
  {
    key: "check_master_sub_autopay_type",
    label: "Check 35 — Master/Sub different auto pay type",
  },
  {
    key: "check_master_sub_bill_mode",
    label: "Check 36 — Master/Sub different bill mode",
  },
];

// ── exception table columns per check ────────────────────────────────────────
const EXTRA_COLS: Record<string, string[]> = {
  check_kh_qty_energy_zero: ["energy_charge", "kh_qty"],
  check_kh_qty_metered_mismatch: ["kh_qty", "metered_usage"],
  check_residential_puc_grt_city: ["gros_tax", "pugra_tax"],
  check_residential_tax_exempt: ["gros_tax", "pugra_tax"],
  check_mcpe_bills: ["service_start", "service_end"],
  check_lmp_rate_range: ["computed_rate"],
  check_commercial_tdsp: ["energy_charge", "passthru_charge"],
  check_residential_price_low: ["computed_rate"],
  check_residential_price_high: ["computed_rate"],
  check_commercial_price_high: ["computed_rate"],
  check_commercial_price_low: ["computed_rate"],
  check_negative_balance: [
    "curr_amount",
    "tax_amount",
    "due_amount",
    "computed",
    "bill_handling_code",
  ],
  check_partial_payment: ["curr_amount", "pay_amount"],
  check_master_sub_final: ["cust_type"],
  check_autopay_balance: ["auto_pay_type", "bal_fwd_amount", "pay_amount"],
  check_wrong_meter_fee: ["other_charge"],
  check_renewal_energy_high: ["computed_rate"],
  check_paid_amount_variance: ["curr_amount", "pay_amount"],
  check_single_bill_under_100: [
    "bill_mode",
    "cust_email",
    "auto_pay_type",
    "curr_amount",
  ],
  check_multi_contract_invoice: ["no_of_contracts_billed"],
  check_old_autopay_balance: [
    "auto_pay_type",
    "bal_fwd_amount",
    "pay_amount",
    "cust_type",
  ],
  check_deposit_charges: ["deposit_charges", "bill_handling_code", "cust_type"],
  check_difference_one_day: ["service_start", "service_end"],
  check_different_due_date: [
    "bill_to_id",
    "premise_id",
    "due_date",
    "master_due_date",
  ],
  check_master_sub_autopay_type: ["master_auto_pay", "sub_auto_pay"],
  check_master_sub_bill_mode: ["master_bill_mode", "sub_bill_mode"],
  check_state_tax_100: ["state_tax", "load_profile"],
  check_potential_final: [
    "service_start",
    "service_end",
    "days",
    "bill_handling_code",
  ],
};

function colLabel(col: string): string {
  return col.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── exception table ───────────────────────────────────────────────────────────
function ExceptionTable({ data }: { data: any[] }) {
  if (!data.length) return null;
  const extraCols = Object.keys(data[0]).filter(
    (k) => !["cust_id", "bill_no", "company_name", "cust_name"].includes(k),
  );

  return (
    <div className="overflow-x-auto rounded border border-gray-200 mt-3">
      <table className="w-full text-xs">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">
              #
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">
              Cust ID
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap">
              Bill No
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">
              Company
            </th>
            <th className="px-3 py-2 text-left font-medium text-gray-500">
              Customer
            </th>
            {extraCols.map((c) => (
              <th
                key={c}
                className="px-3 py-2 text-left font-medium text-gray-500 whitespace-nowrap"
              >
                {colLabel(c)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {data.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              <td className="px-3 py-2 text-gray-400">{i + 1}</td>
              <td className="px-3 py-2 text-gray-800 font-mono">
                {row.cust_id}
              </td>
              <td className="px-3 py-2 text-gray-600 font-mono">
                {row.bill_no}
              </td>
              <td className="px-3 py-2 text-gray-700">{row.company_name}</td>
              <td className="px-3 py-2 text-gray-700">{row.cust_name}</td>
              {extraCols.map((c) => (
                <td key={c} className="px-3 py-2 text-gray-600">
                  {row[c]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────
export default function BillingExceptionsPage() {
  const router = useRouter();
  const { date } = router.query;

  const [loading, setLoading] = useState(true);
  const [uploadId, setUploadId] = useState<number | null>(null);
  const [uploadDate, setUploadDate] = useState("");
  const [exceptions, setExceptions] = useState<Record<string, any[]>>({});
  const [comments, setComments] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [sendMsg, setSendMsg] = useState("");
  const [phpCounts, setPhpCounts] = useState<Record<string, number>>({});

  // ── load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!router.isReady) return;
    const endpoint = date
      ? `/billing/exceptions/${date}`
      : "/billing/exceptions/last";
    fetchExceptions(endpoint);
  }, [router.isReady, date]);

  const fetchExceptions = async (endpoint: string) => {
    setLoading(true);
    try {
      const res = await api.get(endpoint);
      const rows: any[] = res.data;

      const excRow = rows.find((r) => r.row_type === "exception");
      const comRow = rows.find((r) => r.row_type === "comment");

      if (excRow) {
        setUploadId(excRow.upload_id);
        setUploadDate(excRow.upload_date);
        const parsed: Record<string, any[]> = {};
        CHECKS.forEach(({ key }) => {
          try {
            parsed[key] = excRow[key] ? JSON.parse(excRow[key]) : [];
          } catch {
            parsed[key] = [];
          }
        });
        setExceptions(parsed);
      }
      if (excRow) {
        // existing code...
        // add this at the end:
        try {
          const phpRes = await api.get(
            `/billing/php-comparison/${excRow.upload_id}`,
          );
          setPhpCounts(phpRes.data);
        } catch {
          // no PHP comparison available
        }
      }

      if (comRow) {
        const loaded: Record<string, string> = {};
        CHECKS.forEach(({ key }) => {
          loaded[key] = comRow[key] || "";
        });
        setComments(loaded);
      }
    } catch (err: any) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // ── save comments ────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!uploadId) return;
    setSaving(true);
    setSaveMsg("");
    try {
      await api.post("/billing/comments/save", {
        upload_id: uploadId,
        ...comments,
      });
      setSaveMsg("Comments saved successfully.");
    } catch {
      setSaveMsg("Failed to save comments.");
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(""), 3000);
    }
  };

  // ── send email ───────────────────────────────────────────────────────────────
  const handleSendEmail = async () => {
    if (!uploadId) return;
    setSending(true);
    setSendMsg("");
    try {
      await api.post("/billing/send-email", { upload_id: uploadId });
      setSendMsg("Email sent successfully.");
    } catch {
      setSendMsg("Failed to send email.");
    } finally {
      setSending(false);
      setTimeout(() => setSendMsg(""), 4000);
    }
  };
  const handleRerun = async () => {
    setLoading(true);
    try {
      await api.post("/billing/rerun-checks");
      fetchExceptions(
        date ? `/billing/exceptions/${date}` : "/billing/exceptions/last",
      );
    } catch {
      setLoading(false);
    }
  };

  const totalExceptions = Object.values(exceptions).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );

  // ── render ───────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <BillingLayout title="Billing Module">
        <div className="flex items-center gap-2 text-gray-500 text-sm mt-10">
          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Loading exceptions...
        </div>
      </BillingLayout>
    );
  }

  return (
    <BillingLayout title="Billing Module">
      {/* ── header bar ── */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-base font-semibold text-gray-800">
            Billing Exceptions
          </h2>
          {uploadDate && (
            <p className="text-xs text-gray-400 mt-0.5">
              Upload date: {uploadDate} — {totalExceptions} total exceptions
              across 36 checks
            </p>
          )}
        </div>

        {/* send email */}
        <div className="flex items-center gap-3">
          {sendMsg && (
            <span
              className={`text-xs ${sendMsg.includes("success") ? "text-green-600" : "text-red-500"}`}
            >
              {sendMsg}
            </span>
          )}
          <button
            onClick={handleSendEmail}
            disabled={sending}
            className="px-4 py-2 bg-slate-800 text-white text-sm rounded hover:bg-slate-700 disabled:opacity-40 transition-colors flex items-center gap-2"
          >
            {sending ? (
              <>
                <svg
                  className="w-4 h-4 animate-spin"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                Sending...
              </>
            ) : (
              <>
                <svg
                  className="w-4 h-4"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                Send Email
              </>
            )}
          </button>
          <button
            onClick={handleRerun}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 transition-colors"
          >
            Re-run Checks
          </button>
        </div>
      </div>

      {/* ── 36 checks ── */}
      <div className="space-y-4">
        {CHECKS.map(({ key, label }) => {
          const rows = exceptions[key] || [];
          const hasExceptions = rows.length > 0;

          return (
            <div
              key={key}
              className="bg-white rounded-lg border border-gray-200 overflow-hidden"
            >
              {/* check header */}
              <div
                className={`flex items-center justify-between px-4 py-3 border-b border-gray-100 ${
                  hasExceptions ? "bg-red-50" : "bg-green-50"
                }`}
              >
                <span className="text-sm font-medium text-gray-800">
                  {label}
                </span>
                {hasExceptions ? (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                    {rows.length} exception{rows.length > 1 ? "s" : ""}
                  </span>
                ) : (
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                    No exceptions
                  </span>
                )}
              </div>

              <div className="px-4 py-3">
                {/* exception table */}
                {hasExceptions && <ExceptionTable data={rows} />}
                {phpCounts && phpCounts[key] !== undefined && (
                  <div className="flex items-center gap-3 mt-2 px-1">
                    <span className="text-xs text-gray-500">
                      Our count: <strong>{rows.length}</strong>
                    </span>
                    <span className="text-xs text-gray-500">
                      PHP count: <strong>{phpCounts[key]}</strong>
                    </span>
                    {rows.length === phpCounts[key] ? (
                      <span className="text-xs text-green-600 font-medium">
                        ✅ Match
                      </span>
                    ) : (
                      <span className="text-xs text-red-500 font-medium">
                        ⚠️ Diff: {Math.abs(rows.length - phpCounts[key])}
                      </span>
                    )}
                  </div>
                )}

                {/* comment box */}
                <div className="mt-3">
                  <textarea
                    rows={2}
                    placeholder="Add comment..."
                    value={comments[key] || ""}
                    onChange={(e) =>
                      setComments((prev) => ({
                        ...prev,
                        [key]: e.target.value,
                      }))
                    }
                    className="w-full text-sm border border-gray-200 rounded px-3 py-2 text-gray-700 placeholder-gray-300 focus:outline-none focus:ring-1 focus:ring-green-400 focus:border-green-400 resize-none"
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── save comments button ── */}
      <div className="mt-6 flex items-center gap-4 pb-10">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-40 transition-colors flex items-center gap-2"
        >
          {saving ? (
            <>
              <svg
                className="w-4 h-4 animate-spin"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Saving...
            </>
          ) : (
            "Save Comments"
          )}
        </button>
        {saveMsg && (
          <span
            className={`text-sm ${saveMsg.includes("success") ? "text-green-600" : "text-red-500"}`}
          >
            {saveMsg}
          </span>
        )}
      </div>
    </BillingLayout>
  );
}
