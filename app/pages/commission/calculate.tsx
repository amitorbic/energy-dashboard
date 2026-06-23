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
      <h2 className="text-lg font-semibold text-orange-600 mb-4">
        Calculate Commission
      </h2>

      <div className="bg-white border border-gray-200 rounded p-6">
        {/* 3. Fixed the unescaped apostrophe by using &apos; */}
        <p className="text-sm text-gray-600 mb-6">
          Run final commission calculation after uploading the payment summary.
          This updates owed and balance with actual payment amounts received.
          Note: Commission is also calculated automatically on file upload — use
          this button only after uploading the final payment sheet.
        </p>

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
            <p className="font-medium">Commission calculated successfully!</p>
            <p className="mt-1">
              Month: {result.month} — {result.vendors_updated} vendors updated
            </p>
            <a
              href="/commission/summary"
              className="mt-2 inline-block text-blue-600 underline text-xs"
            >
              View Review Summary →
            </a>
          </div>
        )}

        <button
          onClick={handleCalculate}
          disabled={loading}
          className={`px-6 py-2 rounded text-white text-sm font-medium transition-colors ${
            loading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-orange-500 hover:bg-orange-600"
          }`}
        >
          {loading ? "Calculating..." : "Calculate Commission"}
        </button>
      </div>
    </div>
  );
}
