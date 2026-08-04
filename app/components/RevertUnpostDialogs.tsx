// Shared confirmation dialogs for the Revert / Unpost admin actions.
// Used by the per-period detail page (periods/[id].tsx) and the two
// global /billing/revert and /billing/unpost pages, so the accounting-risk
// warnings stay identical wherever these actions are triggered from.

import { useEffect, useState } from "react";

export const UNPOST_COOLDOWN_SECONDS = 4;

// Same non-blank-but-junk blacklist enforced server-side -- this is just
// the UI's early warning; the API is the real gate.
const PLACEHOLDER_REASONS = new Set([
  "n/a", "na", "none", "test", "testing", "asdf", "xxx", "xx", "x", "-",
  ".", "idk", "unpost", "reason", "why", "because", "n a", "placeholder",
  "todo", "tbd", "unknown", "asd", "qwerty", "123", "abc",
]);

export function isReasonValid(reason: string): boolean {
  const trimmed = reason.trim();
  if (trimmed.length < 10) return false;
  return !PLACEHOLDER_REASONS.has(trimmed.toLowerCase().replace(/\.$/, ""));
}

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

interface RevertConfirmDialogProps {
  periodId: number;
  chargesCount: number;
  invoiceNumber?: string | null;
  invoiceStatus?: string | null;
  busy: boolean;
  errorMsg: string;
  onCancel: () => void;
  onConfirm: () => void;
}

export function RevertConfirmDialog({
  periodId, chargesCount, invoiceNumber, invoiceStatus,
  busy, errorMsg, onCancel, onConfirm,
}: RevertConfirmDialogProps) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-red-200 bg-red-50">
          <p className="font-semibold text-red-700">Revert Period #{periodId} to Draft?</p>
        </div>
        <div className="px-6 py-4 space-y-3 text-sm text-gray-700">
          <p>This action cannot be undone. It will immediately:</p>
          <ul className="list-disc pl-5 space-y-1 text-gray-600">
            {invoiceNumber && (
              <li>Delete invoice <span className="font-mono">{invoiceNumber}</span> ({invoiceStatus}) entirely.</li>
            )}
            <li>Wipe all {chargesCount} charge line(s) (energy, meter fee, TDSP, addon, tax).</li>
            <li>Reset the period's status back to <span className="font-mono">draft</span>.</li>
            <li>Recompute contract rate, meter fee, energy charge, TDSP charges, and flags from the still-linked EDI data — no re-upload needed.</li>
          </ul>
          <p className="text-gray-500">The underlying EDI 867/810 records stay linked, so staff can re-approve this period afterward.</p>
          {errorMsg && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{errorMsg}</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white text-sm font-medium rounded hover:bg-red-700 disabled:opacity-40 transition-colors"
          >
            {busy && <Spinner />}
            Yes, Revert to Draft
          </button>
        </div>
      </div>
    </div>
  );
}

interface UnpostConfirmDialogProps {
  invoiceNumber: string;
  busy: boolean;
  errorMsg: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}

export function UnpostConfirmDialog({
  invoiceNumber, busy, errorMsg, onCancel, onConfirm,
}: UnpostConfirmDialogProps) {
  const [reason, setReason]           = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [cooldown, setCooldown]       = useState(UNPOST_COOLDOWN_SECONDS);

  // Deliberate friction: the confirm button stays disabled for a few
  // seconds after the dialog opens, so it can't be reflexively
  // double-clicked through the same way the routine Revert dialog can be.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const reasonOk  = isReasonValid(reason);
  const phraseOk  = confirmText.trim() === invoiceNumber;
  const canConfirm = !busy && cooldown <= 0 && reasonOk && phraseOk;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-amber-200 bg-amber-50">
          <p className="font-semibold text-amber-800">Unpost Invoice {invoiceNumber}?</p>
        </div>
        <div className="px-6 py-4 space-y-3 text-sm text-gray-700">
          <p className="text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
            Unposting a sent bill can create accounting discrepancies, especially if
            significant time has passed since it was sent. This should only be done
            shortly after sending, and the affected accounting period may need manual
            reconciliation.
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Why are you unposting this bill? <span className="text-red-500">(required)</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              disabled={busy}
              rows={2}
              placeholder="Explain the specific reason -- this is stored in the audit log."
              className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 text-gray-700 focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-40"
            />
            {reason.trim().length > 0 && !reasonOk && (
              <p className="text-xs text-red-500 mt-1">
                Enter a real, specific reason (at least 10 characters) -- placeholders aren&apos;t accepted.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Type the invoice number <span className="font-mono text-gray-800">{invoiceNumber}</span> to confirm
            </label>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              disabled={busy}
              placeholder={invoiceNumber}
              className="w-full text-sm border border-gray-300 rounded px-2.5 py-1.5 text-gray-700 font-mono focus:outline-none focus:ring-1 focus:ring-amber-400 disabled:opacity-40"
            />
          </div>

          {errorMsg && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{errorMsg}</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(reason.trim())}
            disabled={!canConfirm}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded hover:bg-amber-700 disabled:opacity-40 transition-colors"
          >
            {busy && <Spinner />}
            {cooldown > 0 ? `Yes, Unpost (${cooldown})` : "Yes, Unpost"}
          </button>
        </div>
      </div>
    </div>
  );
}
