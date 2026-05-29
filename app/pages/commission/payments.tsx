import React, { useState, useRef, useEffect } from "react";
const API =
  process.env.NEXT_PUBLIC_API_URL || "${process.env.NEXT_PUBLIC_API_URL}/api";

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
    fetch(`${API}/commission/months`)
      .then((r) => r.json())
      .then((m: { label: string; value: string }[]) => {
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

      const res = await fetch(`${API}/commission/payments/upload`, {
        method: "POST",
        body: form,
      });
      const json = await res.json();

      if (res.ok) {
        setMsg({
          type: "success",
          text: `Payment summary uploaded for ${json.month} — ${json.inserted} vendors processed.`,
        });
        setFile(null);
        // Reset the physical input field
        if (fileInputRef.current) fileInputRef.current.value = "";
      } else {
        setMsg({
          type: "error",
          text:
            typeof json.detail === "string" ? json.detail : "Upload failed.",
        });
      }
    } catch (err) {
      console.error("Upload error:", err);
      setMsg({ type: "error", text: "Network error." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-lg p-6">
      <h2 className="text-lg font-semibold text-orange-600 mb-4">
        Insert Payments
      </h2>

      <div className="bg-white border border-gray-200 rounded p-6 shadow-sm">
        <p className="text-sm text-gray-600 mb-5">
          Upload the monthly payment summary Excel file. The file must contain
          the current month in the header row.
          <br />
          <br />
          <span className="font-mono text-xs bg-gray-50 p-1">
            Column 2 = Vendor Code
          </span>
          <br />
          <span className="font-mono text-xs bg-gray-50 p-1">
            Column 4 = Payment Amount
          </span>
        </p>

        {msg && (
          <div
            className={`mb-4 p-3 rounded text-sm border ${
              msg.type === "success"
                ? "bg-green-50 border-green-200 text-green-800"
                : "bg-red-50 border-red-200 text-red-800"
            }`}
          >
            {msg.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 hover:border-orange-300 transition-colors">
            <label className="block text-xs font-bold text-gray-400 uppercase mb-2">
              Select Excel File (.xlsx, .xls)
            </label>
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              className="text-sm text-gray-700 w-full file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-orange-50 file:text-orange-700 hover:file:bg-orange-100 cursor-pointer"
              required
            />
            <div>
              <label className="block text-sm text-gray-700 mb-1">
                Select Month :
              </label>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm min-w-[180px]"
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
            className={`w-full py-2 rounded text-white text-sm font-bold uppercase tracking-wider transition-all ${
              loading
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-orange-500 hover:bg-orange-600 active:transform active:scale-95"
            }`}
          >
            {loading ? "Processing..." : "Submit Payments"}
          </button>
        </form>
      </div>
    </div>
  );
}
