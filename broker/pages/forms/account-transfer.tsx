import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../../components/Layout";
import { isLoggedIn, getToken } from "../../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/**
 * Mirrors Account_transfer_form.php — Account Transfer Request.
 * Current account info + new service info.
 */
export default function AccountTransferPage() {
  const router = useRouter();

  const [custName,   setCustName]   = useState("");
  const [accName,    setAccName]    = useState("");
  const [phNo,       setPhNo]       = useState("");
  const [servName,   setServName]   = useState("");
  const [citySz,     setCitySz]     = useState("");
  const [reqDate,    setReqDate]    = useState("");
  const [currEdate,  setCurrEdate]  = useState("");
  const [currCrate,  setCurrCrate]  = useState("");
  const [notes,      setNotes]      = useState("");
  const [nserAdd,    setNserAdd]    = useState("");
  const [ncitySz,    setNcitySz]    = useState("");
  const [nEsiid,     setNEsiid]     = useState("");
  const [nPhone,     setNPhone]     = useState("");
  const [nReqDate,   setNReqDate]   = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await axios.post(
        `${API}/broker/forms/account-transfer`,
        {
          cust_name: custName, acc_name: accName, ph_no: phNo,
          serv_name: servName, city_sz: citySz, req_date: reqDate,
          curr_edate: currEdate, curr_crate: currCrate, notes,
          nser_add: nserAdd, ncity_sz: ncitySz, n_esiid: nEsiid,
          n_phone: nPhone, n_req_date: nReqDate,
        },
        { responseType: "blob", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "Account_Transfer.pdf"; a.click();
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
        <h2 className="text-xl font-bold text-gray-800">Account Transfer</h2>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form onSubmit={handleSubmit}>
        <table>
          <tbody>
            <tr><td colSpan={2} className="pb-1 font-semibold text-sm">Current Account</td></tr>
            {[
              ["Customer Name",              custName,  setCustName,  "cust_name"],
              ["Account Name",               accName,   setAccName,   "acc_name"],
              ["Phone",                      phNo,      setPhNo,      "ph_no"],
              ["Service Name",               servName,  setServName,  "serv_name"],
              ["City/State/Zip",             citySz,    setCitySz,    "city_sz"],
              ["Requested Transfer Date",    reqDate,   setReqDate,   "req_date"],
              ["Current Contract End Date",  currEdate, setCurrEdate, "curr_edate"],
              ["Current Contract Rate",      currCrate, setCurrCrate, "curr_crate"],
              ["Notes",                      notes,     setNotes,     "notes"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 w-56 text-sm">{label as string} :</td>
                <td><input className={inp} name={name as string} value={val as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">New Service Information</td></tr>
            {[
              ["New Service Address", nserAdd,  setNserAdd,  "nser_add"],
              ["City/State/Zip",      ncitySz,  setNcitySz,  "ncity_sz"],
              ["New ESIID",           nEsiid,   setNEsiid,   "n_esiid"],
              ["New Phone",           nPhone,   setNPhone,   "n_phone"],
              ["Requested Date",      nReqDate, setNReqDate, "n_req_date"],
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
