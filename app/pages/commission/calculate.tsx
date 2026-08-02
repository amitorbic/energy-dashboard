import { useState } from "react";
import api from "../../utils/api";

interface CalcResult {
  month: string;
  vendors_updated: number;
}

const uid = 1;
const userName = "admin";

export default function CalculateCommission() {
  const [loading, setLoading] = useState(false);
  // 2. Use the interface instead of 'any'
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCalculate() {
    if (
      !confirm(
        "This will calculate commissions for the current month. Continue?",
      )
    )
      return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await api.post('/commission/calculate', { uid, user_name: userName });
      setResult(res.data);
    } catch (err: unknown) {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : 'Calculation failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg p-6">
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--accent-light)" }}>
        Calculate Commission
      </h2>

      <div className="rounded-[var(--r-md)] border p-6" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        {/* 3. Fixed the unescaped apostrophe by using &apos; */}
        <p className="text-sm mb-6" style={{ color: "var(--ct-text-secondary)" }}>
          Run final commission calculation after uploading the payment summary.
          This updates owed and balance with actual payment amounts received.
          Note: Commission is also calculated automatically on file upload — use
          this button only after uploading the final payment sheet.
        </p>

        {error && (
          <div className="mb-4 p-3 rounded-[var(--r-md)] border text-sm" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}>
            {error}
          </div>
        )}

        {result && (
          <div className="mb-4 p-3 rounded-[var(--r-md)] border text-sm" style={{ background: "var(--success-light-tint)", borderColor: "var(--success-light-tint)", color: "var(--success-light)" }}>
            <p className="font-medium">Commission calculated successfully!</p>
            <p className="mt-1">
              Month: {result.month} — {result.vendors_updated} vendors updated
            </p>
            <a
              href="/commission/summary"
              className="mt-2 inline-block underline text-xs"
              style={{ color: "var(--accent-light)" }}
            >
              View Review Summary →
            </a>
          </div>
        )}

        <button
          onClick={handleCalculate}
          disabled={loading}
          className="px-6 py-2 rounded-[var(--r-sm)] text-sm font-medium transition-colors"
          style={loading
            ? { background: "var(--ct-text-muted)", color: "#ffffff", cursor: "not-allowed" }
            : { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
        >
          {loading ? "Calculating..." : "Calculate Commission"}
        </button>
      </div>
    </div>
  );
}
