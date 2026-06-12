import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../../components/Layout";
import { isLoggedIn, isAdmin, getToken } from "../../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/**
 * Mirrors payment_form.php — Payment Plan Agreement (admin only).
 * 4 installment rows: date + amount each.
 * Bank info at bottom.
 */
export default function PaymentPlanPage() {
  const router = useRouter();

  const [tdate,        setTdate]        = useState("");
  const [cusName,      setCusName]      = useState("");
  const [outBal,       setOutBal]       = useState("");
  const [finsDate,     setFinsDate]     = useState("");
  const [finstAmount,  setFinstAmount]  = useState("");
  const [sinsDate,     setSinsDate]     = useState("");
  const [sinstAmount,  setSinstAmount]  = useState("");
  const [tinsDate,     setTinsDate]     = useState("");
  const [tinstAmount,  setTinstAmount]  = useState("");
  const [foinsDate,    setFoinsDate]    = useState("");
  const [foinstAmount, setFoinstAmount] = useState("");
  const [bankName,     setBankName]     = useState("");
  const [accName,      setAccName]      = useState("");
  const [routingName,  setRoutingName]  = useState("");
  const [accNo,        setAccNo]        = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    if (!isAdmin())    { router.replace("/home"); return; }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await axios.post(
        `${API}/broker/forms/payment-plan`,
        {
          tdate, cus_name: cusName, out_bal: outBal,
          fins_date: finsDate, finst_amount: finstAmount,
          sins_date: sinsDate, sinst_amount: sinstAmount,
          tins_date: tinsDate, tinst_amount: tinstAmount,
          foins_date: foinsDate, foinst_amount: foinstAmount,
          bank_name: bankName, acc_name: accName,
          routing_name: routingName, acc_no: accNo,
        },
        { responseType: "blob", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "Payment_Plan.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF.");
    } finally {
      setLoading(false);
    }
  }

  const inp  = "border border-gray-300 rounded px-2 py-1 text-sm w-64";
  const inp2 = "border border-gray-300 rounded px-2 py-1 text-sm w-36";

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Payment Plan</h2>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form onSubmit={handleSubmit}>
        <table>
          <tbody>
            {[
              ["Date",                 tdate,   setTdate,   "tdate"],
              ["Customer Name",        cusName, setCusName, "cus_name"],
              ["Outstanding Balance",  outBal,  setOutBal,  "out_bal"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 w-48 text-sm">{label as string} :</td>
                <td><input className={inp} name={name as string} value={val as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Installment Schedule</td></tr>
            {([
              {label:"1st Installment", date:finsDate,  setDate:setFinsDate,  amt:finstAmount,  setAmt:setFinstAmount,  nd:"fins_date",  na:"finst_amount"},
              {label:"2nd Installment", date:sinsDate,  setDate:setSinsDate,  amt:sinstAmount,  setAmt:setSinstAmount,  nd:"sins_date",  na:"sinst_amount"},
              {label:"3rd Installment", date:tinsDate,  setDate:setTinsDate,  amt:tinstAmount,  setAmt:setTinstAmount,  nd:"tins_date",  na:"tinst_amount"},
              {label:"4th Installment", date:foinsDate, setDate:setFoinsDate, amt:foinstAmount, setAmt:setFoinstAmount, nd:"foins_date", na:"foinst_amount"},
            ] as const).map(({label, date, setDate, amt, setAmt, nd, na}) => (
              <tr key={nd}>
                <td className="pr-3 py-1 text-sm">{label} :</td>
                <td className="py-1 flex gap-2">
                  <input type="date" className={inp2} name={nd} value={date}
                    onChange={e => setDate(e.target.value)} />
                  <input type="text" placeholder="Amount" className={inp2} name={na} value={amt}
                    onChange={e => setAmt(e.target.value)} />
                </td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Bank Information</td></tr>
            {[
              ["Bank Name",       bankName,    setBankName,    "bank_name"],
              ["Account Name",    accName,     setAccName,     "acc_name"],
              ["Routing Number",  routingName, setRoutingName, "routing_name"],
              ["Account Number",  accNo,       setAccNo,       "acc_no"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 text-sm">{label as string} :</td>
                <td><input className={inp} name={name as string} value={val as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            <tr>
              <td className="h-10">&nbsp;</td>
              <td>
                <input type="submit" value={loading ? "Generating…" : "Generate PDF"}
                  disabled={loading}
                  className="border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-sm px-4 py-1 cursor-pointer" />
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    </Layout>
  );
}
