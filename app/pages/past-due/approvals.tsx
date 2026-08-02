import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/router";
import PastDueLayout from "../../components/PastDueLayout";
import api from "../../utils/api";

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

// Same semantic-tier vocabulary as past-due/index.tsx: only danger/amber/
// success are available, so CRITICAL and HIGH both map to danger.
const SEMANTIC: Record<string, { background: string; color: string; borderColor: string }> = {
  danger: { background: "var(--danger-light-tint)", color: "var(--danger-light)", borderColor: "var(--danger-light)" },
  amber: { background: "var(--amber-light-tint)", color: "var(--amber-light)", borderColor: "var(--amber-light)" },
  success: { background: "var(--success-light-tint)", color: "var(--success-light)", borderColor: "var(--success-light)" },
};

const RISK_TONE: Record<string, keyof typeof SEMANTIC> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "amber",
  LOW: "success",
};

const riskStyle = (risk: string) => SEMANTIC[RISK_TONE[risk]] || SEMANTIC.amber;

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
  const [error, setError] = useState<string | null>(null);
  const isIrreversible = IRREVERSIBLE.includes(approval.action_type);
  const risk = riskStyle(approval.risk_level);

  const handleDecision = async (decision: "APPROVED" | "DENIED") => {
    if (decision === "APPROVED" && isIrreversible && !confirm) {
      setConfirm(true);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await api.patch(`/collections/approvals/${approval.id}`, { decision, reviewer_notes: notes });
      onReview();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit decision");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="rounded-[var(--r-lg)] shadow-xl w-full max-w-2xl overflow-hidden" style={{ background: "var(--ct-surface)" }}>
        {/* Header */}
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ background: risk.background, borderColor: risk.color }}
        >
          <div>
            <p className="font-semibold" style={{ color: "var(--ct-text-primary)" }}>
              {ACTION_LABEL[approval.action_type] || approval.action_type}
            </p>
            <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
              {approval.customer_name} · {approval.esiid}
            </p>
          </div>
          <span
            className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-medium border"
            style={{ background: risk.background, color: risk.color, borderColor: risk.color }}
          >
            {approval.risk_level}
          </span>
        </div>

        <div className="px-6 py-5 space-y-4">
          {/* Case summary */}
          <div>
            <p className="text-xs font-medium mb-1" style={{ color: "var(--ct-text-muted)" }}>
              Case summary
            </p>
            <p className="text-sm leading-relaxed" style={{ color: "var(--ct-text-primary)" }}>
              {approval.case_summary}
            </p>
          </div>

          {/* Recommendation */}
          {approval.recommended_action && (
            <div className="rounded-[var(--r-md)] border p-3" style={{ background: "var(--info-light-tint)", borderColor: "var(--info-light-tint)" }}>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--info-light)" }}>
                Recommended action
              </p>
              <p className="text-sm" style={{ color: "var(--info-light)" }}>
                {approval.recommended_action}
              </p>
            </div>
          )}

          {/* PUC notes */}
          {approval.puc_notes && (
            <div className="rounded-[var(--r-md)] border p-3" style={{ background: "var(--amber-light-tint)", borderColor: "var(--amber-light-tint)" }}>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--amber-light)" }}>
                PUC compliance
              </p>
              <p className="text-sm" style={{ color: "var(--amber-light)" }}>{approval.puc_notes}</p>
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
              <div key={s.label} className="rounded-[var(--r-md)] p-2" style={{ background: "var(--ct-surface-hover)" }}>
                <p className="mb-0.5" style={{ color: "var(--ct-text-muted)" }}>{s.label}</p>
                <p className="font-medium" style={{ color: "var(--ct-text-primary)" }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Reviewer notes */}
          <div>
            <label className="text-xs font-medium block mb-1" style={{ color: "var(--ct-text-secondary)" }}>
              Reviewer notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add any notes before approving or denying..."
              className="w-full rounded-[var(--r-sm)] border px-3 py-2 text-sm outline-none resize-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            />
          </div>

          {error && (
            <p className="text-sm" style={{ color: "var(--danger-light)" }}>Failed to submit: {error}</p>
          )}

          {/* Irreversible warning */}
          {isIrreversible && confirm && (
            <div className="rounded-[var(--r-md)] border p-3" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light)" }}>
              <p className="text-sm font-semibold" style={{ color: "var(--danger-light)" }}>
                ⚠ This action is irreversible
              </p>
              <p className="text-xs mt-1" style={{ color: "var(--danger-light)" }}>
                {approval.action_type === "EXECUTE_DNP" &&
                  "This will disconnect power. Customer will need a move-in transaction to restore."}
                {approval.action_type === "EXECUTE_MVO" &&
                  "This permanently removes the customer. Power cannot be restored without a new enrollment."}
                {approval.action_type === "MOVE_TO_LEGAL" &&
                  "This triggers formal legal collections and attorney involvement."}
                {approval.action_type === "WRITE_OFF_ACCOUNT" &&
                  "This permanently writes off the balance from the financial records."}
              </p>
              <p className="text-xs font-medium mt-2" style={{ color: "var(--danger-light)" }}>
                Click Approve again to confirm.
              </p>
            </div>
          )}

          {/* Expires */}
          <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
            Expires: {new Date(approval.expires_at).toLocaleString()}
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex gap-2" style={{ borderColor: "var(--ct-border-default)" }}>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={() => handleDecision("DENIED")}
            disabled={loading}
            className="px-4 py-2 text-sm rounded-[var(--r-sm)] border transition-colors disabled:opacity-40 hover:bg-[var(--danger-light-tint)] hover:border-[var(--danger-light)] hover:text-[var(--danger-light)]"
            style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
          >
            Deny
          </button>
          <button
            onClick={() => handleDecision("APPROVED")}
            disabled={loading}
            className="flex-1 py-2 text-sm rounded-[var(--r-sm)] font-medium disabled:opacity-40 transition-colors"
            style={isIrreversible && !confirm
              ? { background: "var(--amber-light)", color: "#ffffff" }
              : { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
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
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Approval | null>(null);
  const [riskFilter, setRiskFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");

  const fetchApprovals = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: "1", page_size: "50" });
    if (riskFilter) params.set("risk_level", riskFilter);
    if (actionFilter) params.set("action_type", actionFilter);

    try {
      const res = await api.get(`/collections/approvals?${params}`);
      const data = res.data;
      setApprovals(data.results ?? []);
      setTotal(data.total ?? 0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setApprovals([]);
    } finally {
      setLoading(false);
    }
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

      {error && (
        <div className="mb-4 rounded-[var(--r-lg)] border px-4 py-3 text-sm" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
          Failed to load approvals: {error}
        </div>
      )}

      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/past-due")}
            className="text-sm transition-colors hover:text-[var(--ct-text-secondary)]"
            style={{ color: "var(--ct-text-muted)" }}
          >
            ← Back
          </button>
          <span
            className="px-2.5 py-1 rounded-full text-xs font-semibold"
            style={total > 0
              ? { background: "var(--amber-light-tint)", color: "var(--amber-light)" }
              : { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
          >
            {total} pending
          </span>
        </div>
        <div className="flex gap-2">
          <select
            value={riskFilter}
            onChange={(e) => setRiskFilter(e.target.value)}
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
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
            className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
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
        <div className="py-20 text-center" style={{ color: "var(--ct-text-muted)" }}>Loading...</div>
      ) : approvals.length === 0 ? (
        <div className="rounded-[var(--r-lg)] border py-20 text-center" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>No pending approvals</p>
          <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>All caught up ✓</p>
        </div>
      ) : (
        <div className="space-y-3">
          {approvals.map((a) => {
            const isHighRisk = a.risk_level === "CRITICAL" || a.risk_level === "HIGH";
            const risk = riskStyle(a.risk_level);
            return (
              <div
                key={a.id}
                onClick={() => setSelected(a)}
                className="rounded-[var(--r-lg)] border cursor-pointer hover:shadow-sm transition-all p-5"
                style={{ background: "var(--ct-surface)", borderColor: isHighRisk ? risk.color : "var(--ct-border-default)" }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                        {ACTION_LABEL[a.action_type] || a.action_type}
                      </span>
                      <span
                        className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-medium border"
                        style={{ background: risk.background, color: risk.color, borderColor: risk.color }}
                      >
                        {a.risk_level}
                      </span>
                      {IRREVERSIBLE.includes(a.action_type) && (
                        <span className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs border" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)", borderColor: "var(--danger-light-tint)" }}>
                          Irreversible
                        </span>
                      )}
                      {a.puc_compliant === true && (
                        <span className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs" style={{ background: "var(--info-light-tint)", color: "var(--info-light)" }}>
                          PUC ✓
                        </span>
                      )}
                    </div>
                    <p className="text-sm font-medium" style={{ color: "var(--ct-text-secondary)" }}>
                      {a.customer_name}
                    </p>
                    <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "var(--ct-text-muted)" }}>
                      {a.case_summary}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-1">
                    <p className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                      {fmt(a.total_due || 0)}
                    </p>
                    <p className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{a.days_overdue} days</p>
                    <p
                      className="text-xs font-medium"
                      style={{ color: expiresIn(a.expires_at) === "Expired" ? "var(--danger-light)" : "var(--ct-text-muted)" }}
                    >
                      Expires in {expiresIn(a.expires_at)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-3 pt-3 border-t" style={{ borderColor: "var(--ct-border-subtle)" }}>
                  <div className="flex gap-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>
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
                  <button className="text-xs font-medium hover:underline" style={{ color: "var(--accent-light)" }}>
                    Review →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </PastDueLayout>
  );
}
