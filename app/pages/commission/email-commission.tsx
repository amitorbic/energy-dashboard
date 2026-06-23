import { useState, useEffect } from "react";
import api from "../../utils/api";

const uid = 1;
const userName = "admin";

type BrokerOption = { vendor: string; company_name: string };
type MonthOption = { label: string; value: string };

export default function EmailCommission() {
  const [brokers, setBrokers] = useState<BrokerOption[]>([]);
  const [months, setMonths] = useState<MonthOption[]>([]);
  const [selectedVendors, setSelectedVendors] = useState<string[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    sent: string[];
    failed: string[];
  } | null>(null);

  useEffect(() => {
    api.get('/commission/vendors').then(res => setBrokers(res.data));
    api.get('/commission/months').then(res => {
      const m: MonthOption[] = res.data;
      setMonths(m);
      if (m.length > 0) setSelectedMonth(m[0].value);
    });
  }, []);

  async function handleSend() {
    if (
      !confirm(
        selectedVendors.length > 0
          ? `Send commission emails to ${selectedVendors.length} selected broker(s)?`
          : "Send commission emails to ALL brokers with commission_flag=1?",
      )
    )
      return;

    setLoading(true);
    setResult(null);
    try {
      const res = await api.post('/commission/email', {
        vendor_ids: selectedVendors,
        month: selectedMonth,
        uid,
        user_name: userName,
      });
      setResult(res.data);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-lg font-semibold text-orange-600 mb-1">
        Email Commission Files
      </h2>
      <p className="text-sm text-gray-500 mb-5">
        Generate and email commission Excel files to brokers. Leave broker
        selection blank to send to all active brokers.
      </p>

      <div className="bg-white border border-gray-200 rounded p-5 mb-5">
        <div className="grid grid-cols-2 gap-6">
          {/* Broker selection */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              Select Brokers (blank = all)
            </label>
            <select
              multiple
              value={selectedVendors}
              onChange={(e) =>
                setSelectedVendors(
                  Array.from(e.target.selectedOptions, (o) => o.value),
                )
              }
              className="border border-gray-300 rounded px-2 py-1 text-sm h-40 w-full"
            >
              {brokers.map((b) => (
                <option key={b.vendor} value={b.vendor}>
                  {b.company_name || b.vendor}
                </option>
              ))}
            </select>
            <p className="text-xs text-gray-400 mt-0.5">
              Hold Ctrl/Cmd for multiple
            </p>
          </div>

          {/* Month + send */}
          <div className="flex flex-col justify-between">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                Commission Month
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm w-full"
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-100 rounded text-xs text-blue-700">
              Each broker will receive an Excel file with:
              <ul className="mt-1 space-y-0.5 list-disc list-inside">
                <li>Last 12 months summary</li>
                <li>Current month commission details</li>
                <li>Commission analysis grid</li>
              </ul>
            </div>

            <button
              onClick={handleSend}
              disabled={loading || !selectedMonth}
              className={`mt-4 px-6 py-2 rounded text-white text-sm font-medium ${
                loading || !selectedMonth
                  ? "bg-gray-400 cursor-not-allowed"
                  : "bg-orange-500 hover:bg-orange-600"
              }`}
            >
              {loading ? "Sending..." : "Send Commission Emails"}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {result && (
        <div className="space-y-3">
          {result.sent.length > 0 && (
            <div className="bg-green-50 border border-green-200 rounded p-4">
              <p className="text-sm font-medium text-green-800 mb-2">
                ✓ Sent successfully ({result.sent.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {result.sent.map((name) => (
                  <span
                    key={name}
                    className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.failed.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-4">
              <p className="text-sm font-medium text-red-800 mb-2">
                ✗ Failed ({result.failed.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {result.failed.map((name, i) => (
                  <span
                    key={i}
                    className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs"
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
