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
      <h2 className="text-lg font-semibold mb-1" style={{ color: "var(--accent-light)" }}>
        Email Commission Files
      </h2>
      <p className="text-sm mb-5" style={{ color: "var(--ct-text-secondary)" }}>
        Generate and email commission Excel files to brokers. Leave broker
        selection blank to send to all active brokers.
      </p>

      <div className="rounded-[var(--r-md)] border p-5 mb-5" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <div className="grid grid-cols-2 gap-6">
          {/* Broker selection */}
          <div>
            <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>
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
              className="rounded-[var(--r-sm)] border px-2 py-1 text-sm h-40 w-full focus:outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            >
              {brokers.map((b) => (
                <option key={b.vendor} value={b.vendor}>
                  {b.company_name || b.vendor}
                </option>
              ))}
            </select>
            <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
              Hold Ctrl/Cmd for multiple
            </p>
          </div>

          {/* Month + send */}
          <div className="flex flex-col justify-between">
            <div>
              <label className="block text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>
                Commission Month
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm w-full focus:outline-none focus:border-[var(--accent-light)]"
                style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
              >
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 p-3 rounded-[var(--r-md)] border text-xs" style={{ background: "var(--info-light-tint)", borderColor: "var(--info-light-tint)", color: "var(--info-light)" }}>
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
              className="mt-4 px-6 py-2 rounded-[var(--r-sm)] text-sm font-medium transition-colors"
              style={loading || !selectedMonth
                ? { background: "var(--ct-text-muted)", color: "#ffffff", cursor: "not-allowed" }
                : { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
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
            <div className="rounded-[var(--r-md)] border p-4" style={{ background: "var(--success-light-tint)", borderColor: "var(--success-light-tint)" }}>
              <p className="text-sm font-medium mb-2" style={{ color: "var(--success-light)" }}>
                ✓ Sent successfully ({result.sent.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {result.sent.map((name) => (
                  <span
                    key={name}
                    className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs"
                    style={{ background: "var(--success-light-tint)", color: "var(--success-light)" }}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          )}
          {result.failed.length > 0 && (
            <div className="rounded-[var(--r-md)] border p-4" style={{ background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)" }}>
              <p className="text-sm font-medium mb-2" style={{ color: "var(--danger-light)" }}>
                ✗ Failed ({result.failed.length})
              </p>
              <div className="flex flex-wrap gap-1">
                {result.failed.map((name, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 rounded-[var(--r-sm)] text-xs"
                    style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}
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
