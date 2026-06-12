import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../components/Layout";
import { isLoggedIn, getToken } from "../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const ZONES = ["CNP", "ONCOR", "AEP", "TNMP"] as const;

interface BillCalc {
  comm_charge: number;
  tdsp: number;
  fee: number;
  state_tax: number;
  city_tax: number;
  puc_tax: number;
  grt: number;
  total_due: number;
  avg_rate: number;
  zone_esid: string;
  bill_date: string;
  due_date: string;
  rate_per_kwh: number;
}

/**
 * Mirrors billing_form.php + bill.php + sample_bill_pdf.php.
 *
 * Tax logic (mirrors bill.php lines 64-94):
 *   default:             state_tax + city_tax + puc_tax + grt
 *   residential_tax_exemp: state_tax = 0
 *   tax_exempt:          state_tax = 0, city_tax = 0
 *
 * Rate input is in cents (e.g. 12 = $0.12/kWh) — matches PHP.
 * Bill date = 3rd of start month; due date = 18th.
 * Zone → fake ESI ID hardcoded (sample_bill_pdf.php lines 47-58).
 */
export default function BillSamplePage() {
  const router = useRouter();

  const [name,        setName]        = useState("");
  const [zone,        setZone]        = useState<typeof ZONES[number]>("CNP");
  const [txtdate,     setTxtdate]     = useState("");
  const [txtdate1,    setTxtdate1]    = useState("");
  const [tdsp,        setTdsp]        = useState("");
  const [rate,        setRate]        = useState("");
  const [usage,       setUsage]       = useState("");
  const [fee,         setFee]         = useState("");
  const [address,     setAddress]     = useState("");
  const [taxExempt,   setTaxExempt]   = useState(false);
  const [resTaxExempt,setResTaxExempt]= useState(false);

  const [calc,    setCalc]    = useState<BillCalc | null>(null);
  const [loading, setLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  function buildBody() {
    return {
      name, zone,
      txtdate, txtdate1,
      tdsp:  parseFloat(tdsp)  || 0,
      rate:  parseFloat(rate)  || 0,
      usage: parseFloat(usage) || 0,
      fee:   parseFloat(fee)   || 0,
      address,
      tax_exempt:            taxExempt,
      residential_tax_exemp: resTaxExempt,
    };
  }

  async function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError(""); setCalc(null);
    try {
      const res = await axios.post<BillCalc>(
        `${API}/broker/bill/calculate`,
        buildBody(),
        { headers: { Authorization: `Bearer ${getToken()}` } },
      );
      setCalc(res.data);
    } catch {
      setError("Calculation failed. Please check inputs.");
    } finally {
      setLoading(false);
    }
  }

  async function handleGenerate() {
    setGenLoading(true); setError("");
    try {
      const res = await axios.post(
        `${API}/broker/bill/generate`,
        buildBody(),
        { responseType: "blob", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "Sample_Bill.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("PDF generation failed.");
    } finally {
      setGenLoading(false);
    }
  }

  const inp = "border border-gray-300 rounded px-2 py-1 text-sm w-48";

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Bill Sample</h2>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {/* Input Form — mirrors billing_form.php */}
      <form onSubmit={handleCalculate}>
        <table>
          <tbody>
            {/* Customer Name */}
            <tr>
              <td className="pr-3 py-1 w-44 text-sm">Customer Name :</td>
              <td><input className={inp} value={name} name="name"
                onChange={e => setName(e.target.value)} /></td>
            </tr>

            {/* Zone */}
            <tr>
              <td className="pr-3 py-1 text-sm">Zone :</td>
              <td>
                <select className="border border-gray-300 rounded px-2 py-1 text-sm"
                  value={zone} name="zone"
                  onChange={e => setZone(e.target.value as typeof ZONES[number])}>
                  {ZONES.map(z => <option key={z}>{z}</option>)}
                </select>
              </td>
            </tr>

            {/* Start date */}
            <tr>
              <td className="pr-3 py-1 text-sm">Bill Start Date :</td>
              <td><input type="date" className={inp} value={txtdate} name="txtdate"
                onChange={e => setTxtdate(e.target.value)} /></td>
            </tr>

            {/* End date */}
            <tr>
              <td className="pr-3 py-1 text-sm">Bill End Date :</td>
              <td><input type="date" className={inp} value={txtdate1} name="txtdate1"
                onChange={e => setTxtdate1(e.target.value)} /></td>
            </tr>

            {/* TDSP charges */}
            <tr>
              <td className="pr-3 py-1 text-sm">TDSP Charges ($) :</td>
              <td><input type="number" step="0.01" className={inp} value={tdsp} name="tdsp"
                onChange={e => setTdsp(e.target.value)} /></td>
            </tr>

            {/* Rate — in cents */}
            <tr>
              <td className="pr-3 py-1 text-sm">$ Rate (¢/kWh) :</td>
              <td><input type="number" step="0.0001" className={inp} value={rate} name="rate"
                onChange={e => setRate(e.target.value)} /></td>
            </tr>

            {/* Usage */}
            <tr>
              <td className="pr-3 py-1 text-sm">Usage kWh :</td>
              <td><input type="number" step="0.01" className={inp} value={usage} name="usage"
                onChange={e => setUsage(e.target.value)} /></td>
            </tr>

            {/* Meter Fee */}
            <tr>
              <td className="pr-3 py-1 text-sm">Meter Fee ($) :</td>
              <td><input type="number" step="0.01" className={inp} value={fee} name="fee"
                onChange={e => setFee(e.target.value)} /></td>
            </tr>

            {/* Address */}
            <tr>
              <td className="pr-3 py-1 text-sm align-top">Address :</td>
              <td><textarea rows={3} className={`${inp} w-64`} value={address} name="address"
                onChange={e => setAddress(e.target.value)} /></td>
            </tr>

            {/* Tax exemption checkboxes */}
            <tr>
              <td className="pr-3 py-2 align-top text-sm">Tax Exempt :</td>
              <td className="py-2">
                <label className="block text-sm mb-1">
                  <input type="checkbox" name="tax_exempt" className="mr-2"
                    checked={taxExempt}
                    onChange={e => { setTaxExempt(e.target.checked); if (e.target.checked) setResTaxExempt(false); }} />
                  Full Tax Exempt
                </label>
                <label className="block text-sm">
                  <input type="checkbox" name="residential_tax_exemp" className="mr-2"
                    checked={resTaxExempt}
                    onChange={e => { setResTaxExempt(e.target.checked); if (e.target.checked) setTaxExempt(false); }} />
                  Residential Tax Exempt (state only)
                </label>
              </td>
            </tr>

            {/* Buttons */}
            <tr>
              <td className="h-10">&nbsp;</td>
              <td className="flex gap-3 items-center">
                <input type="submit" value={loading ? "Calculating…" : "Calculate"}
                  disabled={loading}
                  className="border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-sm px-4 py-1 cursor-pointer" />
                {calc && (
                  <button type="button" onClick={handleGenerate} disabled={genLoading}
                    className="border border-blue-600 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white text-sm px-4 py-1 rounded cursor-pointer">
                    {genLoading ? "Generating…" : "Download PDF"}
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </form>

      {/* Calculation Preview — mirrors bill.php display */}
      {calc && (
        <div className="mt-6 border border-gray-200 rounded p-4 max-w-lg bg-gray-50">
          <h3 className="font-bold text-gray-800 mb-3 text-sm">Bill Preview</h3>

          <table className="text-sm w-full">
            <tbody>
              <tr className="bg-blue-50">
                <td className="py-1 pr-4 font-medium">Bill Date</td>
                <td>{calc.bill_date}</td>
                <td className="pl-4 font-medium">Due Date</td>
                <td>{calc.due_date}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 font-medium">ESI ID (sample)</td>
                <td colSpan={3} className="text-xs text-gray-500">{calc.zone_esid}</td>
              </tr>

              <tr className="border-t border-gray-200 mt-2">
                <td className="py-1 pr-4">Comm. KWH Charge</td>
                <td colSpan={3}>${calc.comm_charge.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4">TDSP Pass-Through</td>
                <td colSpan={3}>${calc.tdsp.toFixed(2)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4">Base (Meter Fee)</td>
                <td colSpan={3}>${calc.fee.toFixed(2)}</td>
              </tr>

              {!taxExempt && !resTaxExempt && (
                <tr>
                  <td className="py-1 pr-4 text-gray-500">State Tax @ 6.25%</td>
                  <td colSpan={3}>${calc.state_tax.toFixed(2)}</td>
                </tr>
              )}
              {!taxExempt && (
                <tr>
                  <td className="py-1 pr-4 text-gray-500">City Tax @ 1%</td>
                  <td colSpan={3}>${calc.city_tax.toFixed(2)}</td>
                </tr>
              )}
              <tr>
                <td className="py-1 pr-4 text-gray-500">PUC @ 0.167%</td>
                <td colSpan={3}>${calc.puc_tax.toFixed(4)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 text-gray-500">GRT @ 1.997%</td>
                <td colSpan={3}>${calc.grt.toFixed(4)}</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 text-gray-500">District Tax</td>
                <td colSpan={3}>$0.00</td>
              </tr>

              <tr className="border-t border-gray-300 font-bold bg-blue-50">
                <td className="py-2 pr-4">Total Amount Due</td>
                <td colSpan={3}>${calc.total_due.toFixed(2)}</td>
              </tr>

              <tr className="border-t border-gray-200">
                <td className="py-1 pr-4 text-gray-500">Avg Rate</td>
                <td colSpan={3}>{calc.avg_rate.toFixed(4)} ¢/kWh</td>
              </tr>
              <tr>
                <td className="py-1 pr-4 text-gray-500">Rate ($/kWh)</td>
                <td colSpan={3}>${calc.rate_per_kwh.toFixed(4)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
