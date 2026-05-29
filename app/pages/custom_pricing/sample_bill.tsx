import React, { useState } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { useRouter } from "next/router";

const TAX_OPTIONS = [
  { value: 0, label: "Standard (City + GRT + PUC)" },
  { value: 1, label: "Full Exempt (GRT + PUC only)" },
  { value: 2, label: "City Exempt (City + GRT + PUC, no State)" },
  { value: 3, label: "All Taxes (including State Tax)" },
];

const SampleBill = () => {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [form, setForm] = useState({
    name: "",
    address: "",
    rate: "",
    usage: "",
    tdsp: "",
    fee: "",
    bill_month: "",
    tax_exempt: "0",
  });

  // Live calculations
  const rate = parseFloat(form.rate) || 0;
  const usage = parseFloat(form.usage) || 0;
  const tdsp = parseFloat(form.tdsp) || 0;
  const fee = parseFloat(form.fee) || 0;
  const te = parseInt(form.tax_exempt);

  const comm_charge = rate * usage;
  const base = comm_charge + tdsp + fee;
  const state_tax = te === 3 ? base * 0.0625 : 0;
  const city_tax = te === 0 || te === 2 || te === 3 ? base * 0.01 : 0;
  const puc_tax = base * 0.00167;
  const grt = (base + state_tax + city_tax) * 0.01997;
  const total_due = base + state_tax + city_tax + puc_tax + grt;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>,
  ) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
    setPreviewUrl(null);
  };

  const handleGenerate = async () => {
    setError("");
    if (!form.name || !form.rate || !form.usage) {
      setError("Name, rate and usage are required.");
      return;
    }
    setGenerating(true);
    try {
      const res = await api.post(
        "/sample-bill/generate",
        {
          name: form.name,
          address: form.address,
          rate: parseFloat(form.rate),
          usage: parseFloat(form.usage),
          tdsp: parseFloat(form.tdsp) || 0,
          fee: parseFloat(form.fee) || 0,
          bill_month:
            form.bill_month ||
            `${String(new Date().getMonth() + 1).padStart(2, "0")}/${new Date().getFullYear()}`,
          tax_exempt: parseInt(form.tax_exempt),
        },
        { responseType: "blob" },
      );

      const url = window.URL.createObjectURL(
        new Blob([res.data], { type: "application/pdf" }),
      );
      setPreviewUrl(url);
    } catch {
      setError("Generation failed.");
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = () => {
    if (!previewUrl) return;
    const link = document.createElement("a");
    link.href = previewUrl;
    link.setAttribute("download", "Sample_Bill.pdf");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const inputCls =
    "w-full bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500";
  const labelCls = "text-xs text-slate-400 mb-1 block";

  return (
    <Layout title="Sample Bill">
      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 border-b border-slate-800 pb-5">
          <button
            onClick={() => router.push("/pricing")}
            className="text-slate-400 hover:text-white text-sm"
          >
            ← Pricing
          </button>
          <div>
            <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
              Sample Bill
            </h1>
            <p className="text-slate-400 text-xs mt-0.5">
              Generate a sample electricity bill PDF
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          {/* ── LEFT — Form ── */}
          <div className="space-y-5">
            {/* Customer Info */}
            <div className="bg-slate-800 rounded-lg p-5 space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-700 pb-2">
                Customer info
              </p>
              <div className="space-y-3">
                <div>
                  <label className={labelCls}>Customer name</label>
                  <input
                    name="name"
                    value={form.name}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g. ABC Corp"
                  />
                </div>
                <div>
                  <label className={labelCls}>Service address</label>
                  <input
                    name="address"
                    value={form.address}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g. 123 Main St, Houston TX 77001"
                  />
                </div>
                <div>
                  <label className={labelCls}>Bill month (MM/YYYY)</label>
                  <input
                    name="bill_month"
                    value={form.bill_month}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g. 04/2026"
                  />
                </div>
              </div>
            </div>

            {/* Charges */}
            <div className="bg-slate-800 rounded-lg p-5 space-y-4">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-700 pb-2">
                Charges
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelCls}>Rate ($/kWh)</label>
                  <input
                    name="rate"
                    type="number"
                    step="0.0001"
                    value={form.rate}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g. 0.0750"
                  />
                </div>
                <div>
                  <label className={labelCls}>Usage (kWh)</label>
                  <input
                    name="usage"
                    type="number"
                    value={form.usage}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g. 5000"
                  />
                </div>
                <div>
                  <label className={labelCls}>TDSP charges ($)</label>
                  <input
                    name="tdsp"
                    type="number"
                    step="0.01"
                    value={form.tdsp}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g. 45.00"
                  />
                </div>
                <div>
                  <label className={labelCls}>Base / fee charges ($)</label>
                  <input
                    name="fee"
                    type="number"
                    step="0.01"
                    value={form.fee}
                    onChange={handleChange}
                    className={inputCls}
                    placeholder="e.g. 9.95"
                  />
                </div>
              </div>
            </div>

            {/* Tax Exemption */}
            <div className="bg-slate-800 rounded-lg p-5 space-y-3">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-700 pb-2">
                Tax exemption
              </p>
              <select
                name="tax_exempt"
                value={form.tax_exempt}
                onChange={handleChange}
                className={inputCls}
              >
                {TAX_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {error && <p className="text-red-400 text-xs">{error}</p>}

            <button
              onClick={handleGenerate}
              disabled={generating}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white py-3 rounded text-sm font-bold uppercase transition"
            >
              {generating ? "Generating..." : "Generate Sample Bill"}
            </button>
          </div>

          {/* ── RIGHT — Preview + Summary ── */}
          <div className="space-y-5">
            {/* Live calculation summary */}
            {(rate > 0 || usage > 0) && (
              <div className="bg-slate-800 rounded-lg p-5 space-y-3">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide border-b border-slate-700 pb-2">
                  Calculation preview
                </p>
                <div className="space-y-1.5 text-xs">
                  {[
                    ["Commodity charge", `$${comm_charge.toFixed(2)}`],
                    ["TDSP charges", `$${tdsp.toFixed(2)}`],
                    ["Base charges", `$${fee.toFixed(2)}`],
                    ...(city_tax > 0
                      ? [["City tax (1%)", `$${city_tax.toFixed(2)}`]]
                      : []),
                    ...(state_tax > 0
                      ? [["State tax (6.25%)", `$${state_tax.toFixed(2)}`]]
                      : []),
                    ["GRT (1.997%)", `$${grt.toFixed(2)}`],
                    ["PUC assessment (0.167%)", `$${puc_tax.toFixed(2)}`],
                  ].map(([label, val]) => (
                    <div key={label} className="flex justify-between">
                      <span className="text-slate-400">{label}</span>
                      <span className="text-slate-200 font-mono">{val}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-slate-700 pt-2 font-bold">
                    <span className="text-white">Total Due</span>
                    <span className="text-green-400 font-mono text-sm">
                      ${total_due.toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* PDF Preview */}
            {previewUrl && (
              <div className="bg-slate-800 rounded-lg p-5 space-y-3">
                <div className="flex justify-between items-center border-b border-slate-700 pb-2">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                    Preview
                  </p>
                  <button
                    onClick={handleDownload}
                    className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded text-xs font-bold uppercase"
                  >
                    Download PDF
                  </button>
                </div>
                <iframe
                  src={previewUrl}
                  className="w-full rounded border border-slate-700"
                  style={{ height: "600px" }}
                  title="Sample Bill Preview"
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default SampleBill;
