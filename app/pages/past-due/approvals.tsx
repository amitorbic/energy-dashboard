import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import PastDueLayout from "../../components/PastDueLayout";

const API = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8001";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Approval {
  id: number;
  account_id: number;
  action_type: string;
  case_summary: string;
  case_data: any;
  recommended_action: string | null;
  risk_level: string;
  puc_compliant: boolean | null;
  puc_notes: string | null;
  status: string;
  expires_at: string;
  created_by: string;
  created_at: string;
  customer_name: string | null;
  esiid: string | null;
  track: string | null;
  stage: string | null;
  total_due: number | null;
  days_overdue: number | null;
  delinquency_tier: string | null;
  broker_name: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );

const RISK_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700 border-red-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  LOW: "bg-green-100 text-green-700 border-green-200",
};

const ACTION_LABEL: Record<string, string> = {
  SEND_DNP_NOTICE: "Send DNP Notice",
  EXECUTE_DNP: "Execute DNP ⚡",
  EXECUTE_MVO: "Execute MVO 🔴",
  SEND_DEMAND_LETTER: "Send Demand Letter",
  MOVE_TO_LEGAL: "Move to Legal ⚖",
  OFFER_PAYMENT_PLAN: "Offer Payment Plan",
  WAIVE_ETF: "Waive ETF",
  APPLY_LATE_FEE: "Apply Late Fee",
  WRITE_OFF_ACCOUNT: "Write Off Account",
  CONTACT_BROKER: "Contact Broker",
  OVERRIDE_ESCALATION_RULE: "Override Rule",
};

const IRREVERSIBLE = [
  "EXECUTE_DNP",
  "EXECUTE_MVO",
  "MOVE_TO_LEGAL",
  "WRITE_OFF_ACCOUNT",
];

// ── Review Panel ──────────────────────────────────────────────────────────────

function ReviewPanel({
  approval,
  onClose,
  onReview,
}: {
  approval: Approval;
  onClose: () => void;
  onReview: () => void;
}) {
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const isIrreversible = IRREVERSIBLE.includes(approval.action_type);

  const handleDecision = async (decision: "APPROVED" | "DENIED") => {
    if (decision === "APPROVED" && isIrreversible && !confirm) {
      setConfirm(true);
      return;
    }
    setLoading(true);
    await fetch(`${API}/api/collections/approvals/${approval.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision, reviewer_notes: notes }),
    });
    setLoading(false);
    onReview();
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between border ${RISK_STYLE[approval.risk_level]}`}
        >
          <div>
            <p className="font-semibold text-gray-900">
              {ACTION_LABEL[approval.action_type] || approval.action_type}
            </p>
            <p className="text-xs text-gray-500 mt-0.5">
              {approval.customer_name} · {approval.esiid}
            </p>
          </div>
          <span
            className={`px-2 py-0.5 rounded text-xs font-medium border ${RISK_STYLE[approval.risk_level]}`}
          >
            {approval.risk_level}
          </span>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Case summary */}
          <div>
            <p className="text-xs font-medium text-gray-500 mb-1">
              Case summary
            </p>
            <p className="text-sm text-gray-800 leading-relaxed">
              {approval.case_summary}
            </p>
          </div>

          {/* Recommendation */}
          {approval.recommended_action && (
            <div className="bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-xs font-medium text-blue-700 mb-1">
                Recommended action
              </p>
              <p className="text-sm text-blue-800">
                {approval.recommended_action}
              </p>
            </div>
          )}

          {/* PUC notes */}
          {approval.puc_notes && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3">
              <p className="text-xs font-medium text-amber-700 mb-1">
                PUC compliance
              </p>
              <p className="text-sm text-amber-800">{approval.puc_notes}</p>
            </div>
          )}

          {/* Account snapshot */}
          <div className="grid grid-cols-3 gap-3 text-xs">
            {[
              { label: "Total due", value: fmt(approval.total_due || 0) },
              {
                label: "Days overdue",
                value: String(approval.days_overdue || 0),
              },
              {
                label: "Track/Stage",
                value: `${approval.track} · ${approval.stage?.replace(/_/g, " ")}`,
              },
            ].map((s) => (
              <div key={s.label} className="bg-gray-50 rounded p-2">
                <p className="text-gray-400 mb-0.5">{s.label}</p>
                <p className="font-medium text-gray-800">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Reviewer notes */}
          <div>
            <label className="text-xs font-medium text-gray-600 block mb-1">
              Reviewer notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add any notes before approving or denying..."
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 resize-none"
            />
          </div>

          {/* Irreversible warning */}
          {isIrreversible && confirm && (
            <div className="bg-red-50 border border-red-300 rounded p-3">
              <p className="text-sm font-semibold text-red-700">
                ⚠ This action is irreversible
              </p>
              <p className="text-xs text-red-600 mt-1">
                {approval.action_type === "EXECUTE_DNP" &&
                  "This will disconnect power. Customer will need a move-in transaction to restore."}
                {approval.action_type === "EXECUTE_MVO" &&
                  "This permanently removes the customer. Power cannot be restored without a new enrollment."}
                {approval.action_type === "MOVE_TO_LEGAL" &&
                  "This triggers formal legal collections and attorney involvement."}
                {approval.action_type === "WRITE_OFF_ACCOUNT" &&
                  "This permanently writes off the balance from the financial records."}
              </p>
              <p className="text-xs text-red-700 font-medium mt-2">
                Click Approve again to confirm.
              </p>
            </div>
          )}

          {/* Expires */}
          <p className="text-xs text-gray-400">
            Expires: {new Date(approval.expires_at).toLocaleString()}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex gap-2">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => handleDecision("DENIED")}
            disabled={loading}
            className="px-4 py-2 text-sm bg-gray-100 border border-gray-300 rounded text-gray-700 hover:bg-red-50 hover:border-red-300 hover:text-red-600 disabled:opacity-40 transition-colors"
          >
            Deny
          </button>
          <button
            onClick={() => handleDecision("APPROVED")}
            disabled={loading}
            className={`flex-1 py-2 text-sm rounded font-medium disabled:opacity-40 transition-colors
              ${
                isIrreversible && !confirm
                  ? "bg-amber-500 text-white hover:bg-amber-600"
                  : "bg-sky-500 text-white hover:bg-sky-600"
              }`}
          >
            {loading
              ? "Processing..."
              : confirm
                ? "Confirm — Approve"
                : "Approve"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ApprovalsPage() {
  const router = useRouter();

  const [approvals, setApprovals] = useState<Approval[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Approval | null>(null);
  const [riskFilter, setRiskFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: "1", page_size: "50" });
    if (riskFilter) params.set("risk_level", riskFilter);
    if (actionFilter) params.set("action_type", actionFilter);

    const res = await fetch(`${API}/api/collections/approvals?${params}`);
    if (res.ok) {
      const data = await res.json();
      setApprovals(data.results ?? []);
      setTotal(data.total ?? 0);
    }
    setLoading(false);
  }, [riskFilter, actionFilter]);

  useEffect(() => {
    fetchApprovals();
  }, [fetchApprovals]);

  const expiresIn = (dt: string) => {
    const diff = new Date(dt).getTime() - Date.now();
    const hrs = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m`;
    return "Expired";
  };

  return (
    <PastDueLayout title="Approval Queue">
      {selected && (
        <ReviewPanel
          approval={selected}
          onClose={() => setSelected(null)}
          onReview={fetchApprovals}
        />
      )}

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/past-due")}
            className="text-sm text-gray-400 hover:text-gray-700"
          >
            ← Back
          </button>
          <span
            className={`px-2.5 py-1 rounded-full text-xs font-semibold
            ${total > 0 ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"}`}
          >
            {total} pending
          </span>
        </div>
        <div className="flex gap-2">
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">All risk levels</option>
            {["CRITICAL", "HIGH", "MEDIUM", "LOW"].map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-600 outline-none focus:ring-2 focus:ring-sky-500"
          >
            <option value="">All actions</option>
            {Object.entries(ACTION_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-gray-400">Loading...</div>
      ) : approvals.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 py-20 text-center">
          <p className="text-gray-400 text-sm">No pending approvals</p>
          <p className="text-gray-300 text-xs mt-1">All caught up ✓</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => (
            <div
              key={a.id}
              onClick={() => setSelected(a)}
              className={`bg-white rounded-lg border cursor-pointer hover:shadow-sm transition-all p-5
                ${a.risk_level === "CRITICAL" ? "border-red-200" : a.risk_level === "HIGH" ? "border-orange-200" : "border-gray-200"}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="text-sm font-semibold text-gray-900">
                      {ACTION_LABEL[a.action_type] || a.action_type}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-xs font-medium border ${RISK_STYLE[a.risk_level]}`}
                    >
                      {a.risk_level}
                    </span>
                    {IRREVERSIBLE.includes(a.action_type) && (
                      <span className="px-2 py-0.5 rounded text-xs bg-red-50 text-red-600 border border-red-200">
                        Irreversible
                      </span>
                    )}
                    {a.puc_compliant === true && (
                      <span className="px-2 py-0.5 rounded text-xs bg-blue-50 text-blue-600">
                        PUC ✓
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-700 font-medium">
                    {a.customer_name}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                    {a.case_summary}
                  </p>
                </div>
                <div className="text-right flex-shrink-0 space-y-1">
                  <p className="text-sm font-semibold text-gray-900">
                    {fmt(a.total_due || 0)}
                  </p>
                  <p className="text-xs text-gray-400">{a.days_overdue} days</p>
                  <p
                    className={`text-xs font-medium ${
                      expiresIn(a.expires_at) === "Expired"
                        ? "text-red-500"
                        : "text-gray-400"
                    }`}
                  >
                    Expires in {expiresIn(a.expires_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
                <div className="flex gap-2 text-xs text-gray-400">
                  <span>{a.track}</span>
                  <span>·</span>
                  <span>{a.stage?.replace(/_/g, " ")}</span>
                  {a.broker_name && (
                    <>
                      <span>·</span>
                      <span>{a.broker_name}</span>
                    </>
                  )}
                </div>
                <button className="text-xs text-sky-600 font-medium hover:text-sky-800">
                  Review →
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </PastDueLayout>
  );
}
