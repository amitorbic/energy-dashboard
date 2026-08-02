import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import PastDueLayout from "../../components/PastDueLayout";
import api from "../../utils/api";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Account {
  id: number;
  customer_name: string;
  account_number: string;
  esiid: string;
  premise_address: string;
  customer_email: string | null;
  customer_phone: string | null;
  broker_name: string | null;
  track: string;
  stage: string;
  usage_balance: number;
  etf_amount: number;
  etf_status: string;
  etf_flag: boolean;
  total_due: number;
  amount_paid: number;
  last_payment_date: string | null;
  last_payment_amount: number | null;
  days_overdue: number;
  due_date: string;
  delinquency_score: number;
  delinquency_tier: string;
  is_paid: boolean;
  is_legal: boolean;
  is_dnp_active: boolean;
  is_mvo: boolean;
  is_disputed: boolean;
  is_payment_plan: boolean;
  is_flagged: boolean;
  flag_reason: string | null;
  dnp_notice_sent_at: string | null;
  dnp_eligible_after: string | null;
  assigned_to: string | null;
  priority: string;
  demand_letter_type: string;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}

interface TimelineEntry {
  id: number;
  account_id: number;
  actor_type: string;
  actor_name: string;
  event_type: string;
  subject: string | null;
  body: string | null;
  event_metadata: any;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    n,
  );

// Same danger/amber/success/info/neutral vocabulary used across the rest of
// the past-due module (see index.tsx SEMANTIC / approvals.tsx SEMANTIC).
const SEMANTIC: Record<string, { background: string; color: string }> = {
  danger: { background: "var(--danger-light-tint)", color: "var(--danger-light)" },
  amber: { background: "var(--amber-light-tint)", color: "var(--amber-light)" },
  success: { background: "var(--success-light-tint)", color: "var(--success-light)" },
  info: { background: "var(--info-light-tint)", color: "var(--info-light)" },
  neutral: { background: "var(--ct-surface-hover)", color: "var(--ct-text-secondary)" },
};

const TIER_TONE: Record<string, keyof typeof SEMANTIC> = {
  CRITICAL: "danger",
  HIGH: "danger",
  MEDIUM: "amber",
  LOW: "success",
};

const EVENT_ICON: Record<string, string> = {
  EMAIL_SENT: "✉",
  CALL_MADE: "📞",
  CALL_ATTEMPTED: "📵",
  PAYMENT_RECEIVED: "✓",
  PAYMENT_PARTIAL: "◑",
  PAYMENT_BOUNCED: "✕",
  STAGE_CHANGED: "→",
  DNP_NOTICE_SENT: "⚠",
  DNP_EXECUTED: "🔴",
  DNP_RESTORED: "🟢",
  DEMAND_LETTER_SENT: "📄",
  LEGAL_FILED: "⚖",
  ETF_FLAGGED: "⚑",
  ETF_WAIVED: "✓",
  ETF_COLLECTED: "✓",
  APPROVAL_REQUESTED: "⏳",
  APPROVAL_GRANTED: "✓",
  APPROVAL_DENIED: "✕",
  NOTE_ADDED: "💬",
  ACCOUNT_RESOLVED: "✓",
  BROKER_NOTIFIED: "🤝",
};

// Icon color: genuine good/bad/caution signal per event, collapsed onto the
// same 4-hue semantic vocabulary. STAGE_CHANGED/BROKER_NOTIFIED etc. are
// purely informational (no status), so they fall back to muted neutral.
const EVENT_TONE: Record<string, keyof typeof SEMANTIC> = {
  PAYMENT_RECEIVED: "success",
  PAYMENT_PARTIAL: "info",
  PAYMENT_BOUNCED: "danger",
  DNP_EXECUTED: "danger",
  DNP_NOTICE_SENT: "amber",
  LEGAL_FILED: "danger",
  ETF_FLAGGED: "amber",
  APPROVAL_DENIED: "danger",
  APPROVAL_GRANTED: "success",
  ACCOUNT_RESOLVED: "success",
};

// ── Stage Change Modal ────────────────────────────────────────────────────────

function StageModal({
  account,
  onClose,
  onSave,
}: {
  account: Account;
  onClose: () => void;
  onSave: () => void;
}) {
  const STAGES = [
    "REMINDER",
    "DNP_NOTICE",
    "DNP_ACTIVE",
    "MVO",
    "EMAIL_OUTREACH",
    "CHASING",
    "DEMAND_SENT",
    "IN_LEGAL",
    "RESOLVED",
    "WRITTEN_OFF",
  ];
  const [newStage, setNewStage] = useState(account.stage);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!reason.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/collections/accounts/${account.id}/stage`, { new_stage: newStage, reason });
      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="rounded-[var(--r-lg)] shadow-xl w-full max-w-md p-6 space-y-4" style={{ background: "var(--ct-surface)" }}>
        <h3 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>Change stage</h3>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--ct-text-secondary)" }}>
            New stage
          </label>
          <select
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
            className="w-full rounded-[var(--r-sm)] border px-3 py-2 text-sm outline-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium block mb-1" style={{ color: "var(--ct-text-secondary)" }}>
            Reason
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this stage changing?"
            className="w-full rounded-[var(--r-sm)] border px-3 py-2 text-sm outline-none resize-none focus:border-[var(--accent-light)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
          />
        </div>
        {error && (
          <p className="text-sm" style={{ color: "var(--danger-light)" }}>Failed to save: {error}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!reason.trim() || saving}
            className="flex-1 py-2 text-sm rounded-[var(--r-sm)] font-medium disabled:opacity-40 transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Note Modal ────────────────────────────────────────────────────────────────

function NoteModal({
  accountId,
  onClose,
  onSave,
}: {
  accountId: number;
  onClose: () => void;
  onSave: () => void;
}) {
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!note.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await api.post(`/collections/accounts/${accountId}/notes`, { note, is_internal: true });
      onSave();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="rounded-[var(--r-lg)] shadow-xl w-full max-w-md p-6 space-y-4" style={{ background: "var(--ct-surface)" }}>
        <h3 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>Add note</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Enter note..."
          className="w-full rounded-[var(--r-sm)] border px-3 py-2 text-sm outline-none resize-none focus:border-[var(--accent-light)]"
          style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
        />
        {error && (
          <p className="text-sm" style={{ color: "var(--danger-light)" }}>Failed to save: {error}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
            style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!note.trim() || saving}
            className="flex-1 py-2 text-sm rounded-[var(--r-sm)] font-medium disabled:opacity-40 transition-colors"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            {saving ? "Saving..." : "Add note"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AccountDetailPage() {
  const router = useRouter();
  const { id } = router.query;

  const [account, setAccount] = useState<Account | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showStage, setShowStage] = useState(false);
  const [showNote, setShowNote] = useState(false);
  const [dnpReason, setDnpReason] = useState("");
  const [dnpLoading, setDnpLoading] = useState(false);
  const [dnpSent, setDnpSent] = useState(false);
  const [dnpError, setDnpError] = useState<string | null>(null);

  const fetchData = async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      const [acctRes, tlRes] = await Promise.all([
        api.get(`/collections/accounts/${id}`),
        api.get(`/collections/accounts/${id}/timeline?limit=100`),
      ]);
      setAccount(acctRes.data);
      setTimeline(tlRes.data ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [id]);

  const handleDNPNotice = async () => {
    if (!dnpReason.trim() || !account) return;
    setDnpLoading(true);
    setDnpError(null);
    try {
      await api.post(`/collections/accounts/${account.id}/dnp-notice`, { reason: dnpReason });
      setDnpSent(true);
      fetchData();
    } catch (err) {
      setDnpError(err instanceof Error ? err.message : "Failed to queue DNP notice");
    } finally {
      setDnpLoading(false);
    }
  };

  if (loading)
    return (
      <PastDueLayout title="Account">
        <div className="py-20 text-center" style={{ color: "var(--ct-text-muted)" }}>Loading...</div>
      </PastDueLayout>
    );
  if (error)
    return (
      <PastDueLayout title="Account">
        <div className="py-20 text-center" style={{ color: "var(--danger-light)" }}>Failed to load account: {error}</div>
      </PastDueLayout>
    );
  if (!account)
    return (
      <PastDueLayout title="Account">
        <div className="py-20 text-center" style={{ color: "var(--ct-text-muted)" }}>Account not found</div>
      </PastDueLayout>
    );

  const tierTone = SEMANTIC[TIER_TONE[account.delinquency_tier]] || SEMANTIC.neutral;
  const daysOverdueStyle =
    account.days_overdue > 90
      ? { color: "var(--danger-light)" }
      : account.days_overdue > 30
        ? { color: "var(--amber-light)" }
        : { color: "var(--ct-text-secondary)" };

  return (
    <PastDueLayout title={account.customer_name}>
      {showStage && (
        <StageModal
          account={account}
          onClose={() => setShowStage(false)}
          onSave={fetchData}
        />
      )}
      {showNote && (
        <NoteModal
          accountId={account.id}
          onClose={() => setShowNote(false)}
          onSave={fetchData}
        />
      )}

      {/* Back */}
      <button
        onClick={() => router.push("/past-due")}
        className="text-sm mb-4 flex items-center gap-1 transition-colors hover:text-[var(--ct-text-secondary)]"
        style={{ color: "var(--ct-text-muted)" }}
      >
        ← Back to portal
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left: Account info + actions ── */}
        <div className="space-y-4">
          {/* Identity card */}
          <div className="rounded-[var(--r-lg)] border p-5" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                  {account.customer_name}
                </h2>
                <p className="text-xs font-mono mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
                  {account.esiid}
                </p>
              </div>
              <span
                className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-medium"
                style={tierTone}
              >
                {account.delinquency_tier}
              </span>
            </div>
            <div className="space-y-1.5 text-xs" style={{ color: "var(--ct-text-secondary)" }}>
              <div className="flex justify-between">
                <span style={{ color: "var(--ct-text-muted)" }}>Account #</span>
                <span>{account.account_number}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--ct-text-muted)" }}>Track</span>
                <span
                  className="px-1.5 py-0.5 rounded-[var(--r-sm)] font-medium"
                  style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
                >
                  {account.track}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: "var(--ct-text-muted)" }}>Stage</span>
                <div className="flex items-center gap-1">
                  <span className="font-medium" style={{ color: "var(--ct-text-secondary)" }}>
                    {account.stage.replace(/_/g, " ")}
                  </span>
                  <button
                    onClick={() => setShowStage(true)}
                    className="text-xs transition-colors hover:opacity-80"
                    style={{ color: "var(--accent-light)" }}
                  >
                    Edit
                  </button>
                </div>
              </div>
              {account.broker_name && (
                <div className="flex justify-between">
                  <span style={{ color: "var(--ct-text-muted)" }}>Broker</span>
                  <span>{account.broker_name}</span>
                </div>
              )}
              {account.customer_email && (
                <div className="flex justify-between">
                  <span style={{ color: "var(--ct-text-muted)" }}>Email</span>
                  <span className="truncate max-w-[140px]">
                    {account.customer_email}
                  </span>
                </div>
              )}
              {account.customer_phone && (
                <div className="flex justify-between">
                  <span style={{ color: "var(--ct-text-muted)" }}>Phone</span>
                  <span>{account.customer_phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span style={{ color: "var(--ct-text-muted)" }}>Days overdue</span>
                <span className="font-semibold" style={daysOverdueStyle}>
                  {account.days_overdue}
                </span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: "var(--ct-text-muted)" }}>Priority</span>
                <span className="font-medium" style={{ color: "var(--ct-text-primary)" }}>{account.priority}</span>
              </div>
            </div>

            {/* Active flags */}
            {(account.is_legal ||
              account.is_dnp_active ||
              account.is_flagged ||
              account.is_disputed) && (
              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t" style={{ borderColor: "var(--ct-border-subtle)" }}>
                {account.is_legal && (
                  <span className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs" style={SEMANTIC.danger}>
                    In Legal
                  </span>
                )}
                {account.is_dnp_active && (
                  <span className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs" style={SEMANTIC.danger}>
                    DNP Active
                  </span>
                )}
                {account.is_flagged && (
                  <span className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs" style={SEMANTIC.amber}>
                    Flagged
                  </span>
                )}
                {account.is_disputed && (
                  <span className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs" style={SEMANTIC.amber}>
                    Disputed
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Balance card */}
          <div className="rounded-[var(--r-lg)] border p-5" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <h3 className="text-sm font-medium mb-3" style={{ color: "var(--ct-text-secondary)" }}>Balance</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>Usage balance</span>
                <span className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                  {fmt(account.usage_balance)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>ETF</span>
                <span
                  className="text-sm font-semibold"
                  style={{ color: account.etf_flag ? "var(--amber-light)" : "var(--ct-text-primary)" }}
                >
                  {fmt(account.etf_amount)}
                  {account.etf_flag && (
                    <span className="ml-1 text-xs px-1.5 py-0.5 rounded-[var(--r-sm)]" style={SEMANTIC.amber}>
                      OPEN
                    </span>
                  )}
                </span>
              </div>
              <div className="border-t pt-2 flex justify-between items-center" style={{ borderColor: "var(--ct-border-subtle)" }}>
                <span className="text-xs font-medium" style={{ color: "var(--ct-text-secondary)" }}>
                  Total due
                </span>
                <span className="text-base font-bold" style={{ color: "var(--ct-text-primary)" }}>
                  {fmt(account.total_due)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>Total paid</span>
                <span className="text-sm font-medium" style={{ color: "var(--success-light)" }}>
                  {fmt(account.amount_paid)}
                </span>
              </div>
              {account.last_payment_date && (
                <div className="flex justify-between items-center">
                  <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>Last payment</span>
                  <span className="text-xs" style={{ color: "var(--ct-text-secondary)" }}>
                    {fmt(account.last_payment_amount || 0)} ·{" "}
                    {new Date(account.last_payment_date).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions card */}
          <div className="rounded-[var(--r-lg)] border p-5" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <h3 className="text-sm font-medium mb-3" style={{ color: "var(--ct-text-secondary)" }}>Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => setShowNote(true)}
                className="w-full py-2 text-sm rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
              >
                + Add note
              </button>
              <button
                onClick={() => setShowStage(true)}
                className="w-full py-2 text-sm rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
              >
                Change stage
              </button>

              {/* DNP Notice — active track only */}
              {account.track === "ACTIVE" && !account.is_dnp_active && (
                <div className="rounded-[var(--r-md)] border p-3 space-y-2" style={{ borderColor: "var(--amber-light-tint)", background: "var(--amber-light-tint)" }}>
                  <p className="text-xs font-medium" style={{ color: "var(--amber-light)" }}>
                    Queue DNP Notice
                  </p>
                  <p className="text-xs" style={{ color: "var(--amber-light)" }}>
                    PUC 10-day rule enforced. Goes to approval queue.
                  </p>
                  {dnpSent ? (
                    <p className="text-xs font-medium" style={{ color: "var(--success-light)" }}>
                      ✓ Queued for approval
                    </p>
                  ) : (
                    <>
                      <input
                        value={dnpReason}
                        onChange={(e) => setDnpReason(e.target.value)}
                        placeholder="Reason for DNP..."
                        className="w-full rounded-[var(--r-sm)] border px-2 py-1.5 text-xs outline-none focus:border-[var(--accent-light)]"
                        style={{ borderColor: "var(--amber-light)", color: "var(--ct-text-primary)" }}
                      />
                      {dnpError && (
                        <p className="text-xs" style={{ color: "var(--danger-light)" }}>{dnpError}</p>
                      )}
                      <button
                        onClick={handleDNPNotice}
                        disabled={!dnpReason.trim() || dnpLoading}
                        className="w-full py-1.5 text-xs rounded-[var(--r-sm)] font-medium disabled:opacity-40 transition-colors"
                        style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                      >
                        {dnpLoading ? "Queuing..." : "Queue DNP notice"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* DNP eligible info */}
              {account.dnp_eligible_after && (
                <div className="rounded-[var(--r-md)] border p-2 text-xs" style={{ background: "var(--info-light-tint)", borderColor: "var(--info-light-tint)", color: "var(--info-light)" }}>
                  DNP eligible after:{" "}
                  <strong>
                    {new Date(account.dnp_eligible_after).toLocaleDateString()}
                  </strong>
                </div>
              )}

              {/* ETF actions */}
              {account.etf_flag && (
                <div className="rounded-[var(--r-md)] border p-3" style={{ borderColor: "var(--amber-light-tint)", background: "var(--amber-light-tint)" }}>
                  <p className="text-xs font-medium mb-1" style={{ color: "var(--amber-light)" }}>
                    ETF open — {fmt(account.etf_amount)}
                  </p>
                  <p className="text-xs" style={{ color: "var(--amber-light)" }}>
                    ETF status: {account.etf_status}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Timeline ── */}
        <div className="lg:col-span-2">
          <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: "var(--ct-border-default)" }}>
              <h3 className="text-sm font-medium" style={{ color: "var(--ct-text-secondary)" }}>
                Activity timeline
              </h3>
              <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>
                {timeline.length} events
              </span>
            </div>

            <div className="max-h-[700px] overflow-y-auto">
              {timeline.length === 0 ? (
                <div className="py-12 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
                  No activity yet
                </div>
              ) : (
                timeline.map((entry) => {
                  const tone = EVENT_TONE[entry.event_type];
                  return (
                    <div
                      key={entry.id}
                      className="px-5 py-3 border-b last:border-0 hover:bg-[var(--ct-surface-hover)]"
                      style={{ borderColor: "var(--ct-border-subtle)" }}
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className="text-base mt-0.5"
                          style={{ color: tone ? SEMANTIC[tone].color : "var(--ct-text-muted)" }}
                        >
                          {EVENT_ICON[entry.event_type] || "·"}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium" style={{ color: "var(--ct-text-primary)" }}>
                              {entry.subject ||
                                entry.event_type.replace(/_/g, " ").toLowerCase()}
                            </span>
                            <span
                              className="px-1.5 py-0.5 rounded-[var(--r-sm)] text-xs"
                              style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
                            >
                              {entry.actor_name}
                            </span>
                          </div>
                          {entry.body && (
                            <p className="text-xs mt-0.5 leading-relaxed" style={{ color: "var(--ct-text-secondary)" }}>
                              {entry.body}
                            </p>
                          )}
                          <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                            {new Date(entry.created_at).toLocaleString()}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>
    </PastDueLayout>
  );
}
