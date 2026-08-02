import React, { useState, useRef, useEffect } from "react";
import api from "../../utils/api";

export default function InsertPayments() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [months, setMonths] = useState<{ label: string; value: string }[]>([]);
  const [selectedMonth, setSelectedMonth] = useState("");

  // Use a ref to manually clear the file input field
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uid = 1;
  const userName = "admin";
  useEffect(() => {
    api.get('/commission/months').then(res => {
      const m: { label: string; value: string }[] = res.data;
      setMonths(m);
      if (m.length > 0) setSelectedMonth(m[0].value);
    });
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMsg({ type: "error", text: "Please select a file." });
      return;
    }

    setLoading(true);
    setMsg(null);

    try {
      const form = new FormData();
      form.append("file", file);
      form.append("uid", String(uid));
      form.append("user_name", userName);
      form.append("month", selectedMonth);

      const res = await api.post('/commission/payments/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const json = res.data;
      setMsg({
        type: "success",
        text: `Payment summary uploaded for ${json.month} — ${json.inserted} vendors processed.`,
      });
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (err: unknown) {
      console.error("Upload error:", err);
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail;
      setMsg({ type: "error", text: typeof detail === 'string' ? detail : "Upload failed." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg p-6">
      <h2 className="text-lg font-semibold mb-4" style={{ color: "var(--accent-light)" }}>
        Insert Payments
      </h2>

      <div className="rounded-[var(--r-md)] border p-6 shadow-sm" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
        <p className="text-sm mb-5" style={{ color: "var(--ct-text-secondary)" }}>
          Upload the monthly payment summary Excel file. The file must contain
          the current month in the header row.
          <br />
          <br />
          <span className="font-mono text-xs p-1 rounded-[var(--r-sm)]" style={{ background: "var(--ct-surface-hover)" }}>
            Column 2 = Vendor Code
          </span>
          <br />
          <span className="font-mono text-xs p-1 rounded-[var(--r-sm)]" style={{ background: "var(--ct-surface-hover)" }}>
            Column 4 = Payment Amount
          </span>
        </p>

        {msg && (
          <div
            className="mb-4 p-3 rounded-[var(--r-md)] text-sm border"
            style={msg.type === "success"
              ? { background: "var(--success-light-tint)", borderColor: "var(--success-light-tint)", color: "var(--success-light)" }
              : { background: "var(--danger-light-tint)", borderColor: "var(--danger-light-tint)", color: "var(--danger-light)" }}
          >
            {msg.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="border-2 border-dashed rounded-[var(--r-lg)] p-4 transition-colors hover:border-[var(--accent-light)]" style={{ borderColor: "var(--ct-border-default)" }}>
            <label className="block text-xs font-bold uppercase mb-2" style={{ color: "var(--ct-text-muted)" }}>
              Select Excel File (.xlsx, .xls)
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm w-full file:mr-4 file:py-2 file:px-4 file:rounded-[var(--r-md)] file:border-0 file:text-sm file:font-semibold cursor-pointer file:bg-[var(--accent-light-tint)] file:text-[var(--accent-light)] hover:file:bg-[var(--accent-light-tint)]"
              style={{ color: "var(--ct-text-secondary)" }}
              required
            />
            <div>
              <label className="block text-sm mb-1" style={{ color: "var(--ct-text-secondary)" }}>
                Select Month :
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="rounded-[var(--r-sm)] border px-3 py-1.5 text-sm min-w-[180px]"
                style={{ borderColor: "var(--ct-border-default)" }}
                required
              >
                <option value="">Select month...</option>
                {months.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 rounded-[var(--r-sm)] text-sm font-bold uppercase tracking-wider transition-all disabled:cursor-not-allowed active:scale-95"
            style={loading
              ? { background: "var(--ct-text-muted)", color: "#ffffff" }
              : { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            {loading ? "Processing..." : "Submit Payments"}
          </button>
        </form>
      </div>
    </div>
  );
}
