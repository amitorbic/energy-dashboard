import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../../components/Layout";
import { isLoggedIn, getToken } from "../../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/**
 * Mirrors Cancellation_form.php — Service Cancellation Request.
 * Reason checkboxes: move, switch, other.
 * Includes forwarding info + refund bank/credit card info.
 */
export default function CancellationPage() {
  const router = useRouter();

  const [custName,     setCustName]     = useState("");
  const [accNumb,      setAccNumb]      = useState("");
  const [phoneNum,     setPhoneNum]     = useState("");
  const [serviceAdd,   setServiceAdd]   = useState("");
  const [cityStZip,    setCityStZip]    = useState("");
  const [cancellDate,  setCancellDate]  = useState("");
  const [conEndate,    setConEndate]    = useState("");
  const [contRate,     setContRate]     = useState("");
  const [coment,       setComent]       = useState("");
  const [move,         setMove]         = useState(false);
  const [switch_,      setSwitch_]      = useState(false);
  const [other,        setOther]        = useState(false);
  const [otherText,    setOtherText]    = useState("");
  const [fAddress,     setFAddress]     = useState("");
  const [fCitystZip,   setFCitystZip]   = useState("");
  const [fPhone,       setFPhone]       = useState("");
  const [fEmail,       setFEmail]       = useState("");
  const [finalInst,    setFinalInst]    = useState("");
  const [invAddr,      setInvAddr]      = useState("");
  const [routNo,       setRoutNo]       = useState("");
  const [invAcc,       setInvAcc]       = useState("");
  const [crName,       setCrName]       = useState("");
  const [crNo,         setCrNo]         = useState("");
  const [exDate,       setExDate]       = useState("");
  const [secCode,      setSecCode]      = useState("");
  const [invAdd,       setInvAdd]       = useState("");
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await axios.post(
        `${API}/broker/forms/cancellation`,
        {
          cust_name: custName, acc_numb: accNumb, phone_num: phoneNum,
          service_add: serviceAdd, city_st_zip: cityStZip,
          cancell_datea: cancellDate, con_endate: conEndate,
          cont_rate: contRate, coment,
          move, switch: switch_, other, other_text: otherText,
          f_address: fAddress, f_cityst_zip: fCitystZip,
          f_phone: fPhone, f_email: fEmail,
          final_institution: finalInst, inv_addr: invAddr,
          rout_no: routNo, inv_acc: invAcc,
          cr_name: crName, cr_no: crNo,
          ex_date: exDate, sec_code: secCode, inv_add: invAdd,
        },
        { responseType: "blob", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "Cancellation.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF.");
    } finally {
      setLoading(false);
    }
  }

  const inp = "border border-gray-300 rounded px-2 py-1 text-sm w-64";

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Cancellation Request</h2>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form onSubmit={handleSubmit}>
        <table>
          <tbody>
            <tr><td colSpan={2} className="pb-1 font-semibold text-sm">Account Information</td></tr>
            {[
              ["Customer Name",        custName,    setCustName,    "cust_name"],
              ["Account Number",       accNumb,     setAccNumb,     "acc_numb"],
              ["Phone",                phoneNum,    setPhoneNum,    "phone_num"],
              ["Service Address",      serviceAdd,  setServiceAdd,  "service_add"],
              ["City/State/Zip",       cityStZip,   setCityStZip,   "city_st_zip"],
              ["Cancellation Date",    cancellDate, setCancellDate, "cancell_datea"],
              ["Contract End Date",    conEndate,   setConEndate,   "con_endate"],
              ["Contract Rate",        contRate,    setContRate,    "cont_rate"],
              ["Comments",             coment,      setComent,      "coment"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 w-48 text-sm">{label as string} :</td>
                <td><input className={inp} name={name as string} value={val as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            {/* Reason checkboxes */}
            <tr>
              <td className="pr-3 py-2 align-top text-sm">Reason :</td>
              <td className="py-2">
                <label className="mr-4 text-sm">
                  <input type="checkbox" name="move" className="mr-1"
                    checked={move} onChange={e => setMove(e.target.checked)} />
                  Moving
                </label>
                <label className="mr-4 text-sm">
                  <input type="checkbox" name="switch" className="mr-1"
                    checked={switch_} onChange={e => setSwitch_(e.target.checked)} />
                  Switching Provider
                </label>
                <label className="text-sm">
                  <input type="checkbox" name="other" className="mr-1"
                    checked={other} onChange={e => setOther(e.target.checked)} />
                  Other
                </label>
                {other && (
                  <input type="text" placeholder="Specify" name="other_text"
                    className={`${inp} ml-2`} value={otherText}
                    onChange={e => setOtherText(e.target.value)} />
                )}
              </td>
            </tr>

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Forwarding Information</td></tr>
            {[
              ["Forwarding Address",  fAddress,   setFAddress,   "f_address"],
              ["City/State/Zip",      fCitystZip, setFCitystZip, "f_cityst_zip"],
              ["Phone",               fPhone,     setFPhone,     "f_phone"],
              ["Email",               fEmail,     setFEmail,     "f_email"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 text-sm">{label as string} :</td>
                <td><input className={inp} name={name as string} value={val as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Bank / Refund Information</td></tr>
            {[
              ["Financial Institution", finalInst, setFinalInst, "final_institution"],
              ["Inv. Address",          invAddr,   setInvAddr,   "inv_addr"],
              ["Routing Number",        routNo,    setRoutNo,    "rout_no"],
              ["Account Number",        invAcc,    setInvAcc,    "inv_acc"],
              ["Inv. Add.",             invAdd,    setInvAdd,    "inv_add"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 text-sm">{label as string} :</td>
                <td><input className={inp} name={name as string} value={val as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Credit Card (optional)</td></tr>
            {[
              ["Name on Card",  crName,  setCrName,  "cr_name"],
              ["Card Number",   crNo,    setCrNo,    "cr_no"],
              ["Exp. Date",     exDate,  setExDate,  "ex_date"],
              ["Security Code", secCode, setSecCode, "sec_code"],
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
