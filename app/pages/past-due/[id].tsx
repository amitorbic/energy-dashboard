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

const TIER_STYLE: Record<string, string> = {
  CRITICAL: "bg-red-100 text-red-700",
  HIGH: "bg-orange-100 text-orange-700",
  MEDIUM: "bg-amber-100 text-amber-700",
  LOW: "bg-green-100 text-green-700",
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

const EVENT_COLOR: Record<string, string> = {
  PAYMENT_RECEIVED: "text-green-600",
  PAYMENT_PARTIAL: "text-blue-600",
  PAYMENT_BOUNCED: "text-red-600",
  DNP_EXECUTED: "text-red-600",
  DNP_NOTICE_SENT: "text-orange-600",
  LEGAL_FILED: "text-red-700",
  ETF_FLAGGED: "text-amber-600",
  APPROVAL_DENIED: "text-red-600",
  APPROVAL_GRANTED: "text-green-600",
  STAGE_CHANGED: "text-indigo-600",
  ACCOUNT_RESOLVED: "text-green-600",
};

const ACTOR_BADGE: Record<string, string> = {
  HUMAN: "bg-blue-100 text-blue-700",
  LLM_AGENT: "bg-purple-100 text-purple-700",
  SYSTEM: "bg-gray-100 text-gray-500",
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Change stage</h3>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            New stage
          </label>
          <select
            value={newStage}
            onChange={(e) => setNewStage(e.target.value)}
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500"
          >
            {STAGES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-600 block mb-1">
            Reason
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="Why is this stage changing?"
            className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 resize-none"
          />
        </div>
        {error && (
          <p className="text-sm text-red-600">Failed to save: {error}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!reason.trim() || saving}
            className="flex-1 py-2 text-sm bg-sky-500 text-white rounded hover:bg-sky-600 disabled:opacity-40"
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
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md p-6 space-y-4">
        <h3 className="text-base font-semibold text-gray-900">Add note</h3>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={4}
          placeholder="Enter note..."
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-sky-500 resize-none"
        />
        {error && (
          <p className="text-sm text-red-600">Failed to save: {error}</p>
        )}
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 py-2 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!note.trim() || saving}
            className="flex-1 py-2 text-sm bg-sky-500 text-white rounded hover:bg-sky-600 disabled:opacity-40"
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
        <div className="py-20 text-center text-gray-400">Loading...</div>
      </PastDueLayout>
    );
  if (error)
    return (
      <PastDueLayout title="Account">
        <div className="py-20 text-center text-red-500">Failed to load account: {error}</div>
      </PastDueLayout>
    );
  if (!account)
    return (
      <PastDueLayout title="Account">
        <div className="py-20 text-center text-gray-400">Account not found</div>
      </PastDueLayout>
    );

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
        className="text-sm text-gray-400 hover:text-gray-700 mb-4 flex items-center gap-1"
      >
        ← Back to portal
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* ── Left: Account info + actions ── */}
        <div className="space-y-4">
          {/* Identity card */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-base font-semibold text-gray-900">
                  {account.customer_name}
                </h2>
                <p className="text-xs text-gray-400 font-mono mt-0.5">
                  {account.esiid}
                </p>
              </div>
              <span
                className={`px-2 py-0.5 rounded text-xs font-medium ${TIER_STYLE[account.delinquency_tier]}`}
              >
                {account.delinquency_tier}
              </span>
            </div>
            <div className="space-y-1.5 text-xs text-gray-600">
              <div className="flex justify-between">
                <span className="text-gray-400">Account #</span>
                <span>{account.account_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Track</span>
                <span
                  className={`px-1.5 py-0.5 rounded font-medium ${account.track === "ACTIVE" ? "bg-blue-100 text-blue-700" : "bg-indigo-100 text-indigo-700"}`}
                >
                  {account.track}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400">Stage</span>
                <div className="flex items-center gap-1">
                  <span className="font-medium text-gray-700">
                    {account.stage.replace(/_/g, " ")}
                  </span>
                  <button
                    onClick={() => setShowStage(true)}
                    className="text-sky-500 hover:text-sky-700 text-xs"
                  >
                    Edit
                  </button>
                </div>
              </div>
              {account.broker_name && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Broker</span>
                  <span>{account.broker_name}</span>
                </div>
              )}
              {account.customer_email && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Email</span>
                  <span className="truncate max-w-[140px]">
                    {account.customer_email}
                  </span>
                </div>
              )}
              {account.customer_phone && (
                <div className="flex justify-between">
                  <span className="text-gray-400">Phone</span>
                  <span>{account.customer_phone}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-400">Days overdue</span>
                <span
                  className={`font-semibold ${account.days_overdue > 90 ? "text-red-600" : account.days_overdue > 60 ? "text-orange-600" : account.days_overdue > 30 ? "text-amber-600" : "text-gray-700"}`}
                >
                  {account.days_overdue}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Priority</span>
                <span className="font-medium">{account.priority}</span>
              </div>
            </div>

            {/* Active flags */}
            {(account.is_legal ||
              account.is_dnp_active ||
              account.is_flagged ||
              account.is_disputed) && (
              <div className="flex flex-wrap gap-1 mt-3 pt-3 border-t border-gray-100">
                {account.is_legal && (
                  <span className="px-2 py-0.5 rounded text-xs bg-red-100 text-red-700">
                    In Legal
                  </span>
                )}
                {account.is_dnp_active && (
                  <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-700">
                    DNP Active
                  </span>
                )}
                {account.is_flagged && (
                  <span className="px-2 py-0.5 rounded text-xs bg-yellow-100 text-yellow-700">
                    Flagged
                  </span>
                )}
                {account.is_disputed && (
                  <span className="px-2 py-0.5 rounded text-xs bg-purple-100 text-purple-700">
                    Disputed
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Balance card */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Balance</h3>
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Usage balance</span>
                <span className="text-sm font-semibold text-gray-900">
                  {fmt(account.usage_balance)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">ETF</span>
                <span
                  className={`text-sm font-semibold ${account.etf_flag ? "text-amber-600" : "text-gray-900"}`}
                >
                  {fmt(account.etf_amount)}
                  {account.etf_flag && (
                    <span className="ml-1 text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                      OPEN
                    </span>
                  )}
                </span>
              </div>
              <div className="border-t border-gray-100 pt-2 flex justify-between items-center">
                <span className="text-xs font-medium text-gray-600">
                  Total due
                </span>
                <span className="text-base font-bold text-gray-900">
                  {fmt(account.total_due)}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-400">Total paid</span>
                <span className="text-sm text-green-600 font-medium">
                  {fmt(account.amount_paid)}
                </span>
              </div>
              {account.last_payment_date && (
                <div className="flex justify-between items-center">
                  <span className="text-xs text-gray-400">Last payment</span>
                  <span className="text-xs text-gray-600">
                    {fmt(account.last_payment_amount || 0)} ·{" "}
                    {new Date(account.last_payment_date).toLocaleDateString()}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Actions card */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h3 className="text-sm font-medium text-gray-700 mb-3">Actions</h3>
            <div className="space-y-2">
              <button
                onClick={() => setShowNote(true)}
                className="w-full py-2 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
              >
                + Add note
              </button>
              <button
                onClick={() => setShowStage(true)}
                className="w-full py-2 text-sm border border-gray-300 rounded text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Change stage
              </button>

              {/* DNP Notice — active track only */}
              {account.track === "ACTIVE" && !account.is_dnp_active && (
                <div className="border border-orange-200 rounded p-3 space-y-2 bg-orange-50">
                  <p className="text-xs font-medium text-orange-700">
                    Queue DNP Notice
                  </p>
                  <p className="text-xs text-orange-600">
                    PUC 10-day rule enforced. Goes to approval queue.
                  </p>
                  {dnpSent ? (
                    <p className="text-xs text-green-600 font-medium">
                      ✓ Queued for approval
                    </p>
                  ) : (
                    <>
                      <input
                        value={dnpReason}
                        onChange={(e) => setDnpReason(e.target.value)}
                        placeholder="Reason for DNP..."
                        className="w-full border border-orange-300 rounded px-2 py-1.5 text-xs outline-none focus:ring-1 focus:ring-orange-400"
                      />
                      {dnpError && (
                        <p className="text-xs text-red-600">{dnpError}</p>
                      )}
                      <button
                        onClick={handleDNPNotice}
                        disabled={!dnpReason.trim() || dnpLoading}
                        className="w-full py-1.5 text-xs bg-orange-500 text-white rounded hover:bg-orange-600 disabled:opacity-40"
                      >
                        {dnpLoading ? "Queuing..." : "Queue DNP notice"}
                      </button>
                    </>
                  )}
                </div>
              )}

              {/* DNP eligible info */}
              {account.dnp_eligible_after && (
                <div className="bg-blue-50 border border-blue-200 rounded p-2 text-xs text-blue-700">
                  DNP eligible after:{" "}
                  <strong>
                    {new Date(account.dnp_eligible_after).toLocaleDateString()}
                  </strong>
                </div>
              )}

              {/* ETF actions */}
              {account.etf_flag && (
                <div className="border border-amber-200 rounded p-3 bg-amber-50">
                  <p className="text-xs font-medium text-amber-700 mb-1">
                    ETF open — {fmt(account.etf_amount)}
                  </p>
                  <p className="text-xs text-amber-600">
                    ETF status: {account.etf_status}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Right: Timeline ── */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">
                Activity timeline
              </h3>
              <span className="text-xs text-gray-400">
                {timeline.length} events
              </span>
            </div>

            <div className="divide-y divide-gray-100 max-h-[700px] overflow-y-auto">
              {timeline.length === 0 ? (
                <div className="py-12 text-center text-gray-400 text-sm">
                  No activity yet
                </div>
              ) : (
                timeline.map((entry) => (
                  <div key={entry.id} className="px-5 py-3 hover:bg-gray-50">
                    <div className="flex items-start gap-3">
                      <span
                        className={`text-base mt-0.5 ${EVENT_COLOR[entry.event_type] || "text-gray-400"}`}
                      >
                        {EVENT_ICON[entry.event_type] || "·"}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-800">
                            {entry.subject ||
                              entry.event_type.replace(/_/g, " ").toLowerCase()}
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-xs ${ACTOR_BADGE[entry.actor_type] || "bg-gray-100 text-gray-500"}`}
                          >
                            {entry.actor_name}
                          </span>
                        </div>
                        {entry.body && (
                          <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
                            {entry.body}
                          </p>
                        )}
                        <p className="text-xs text-gray-300 mt-1">
                          {new Date(entry.created_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </PastDueLayout>
  );
}
