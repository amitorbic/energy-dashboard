import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../../components/Layout";
import { isLoggedIn } from "../../utils/auth";
import { getToken } from "../../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const TDUS = ["oncor", "centerpoint", "aep", "tnmp"] as const;
const TDU_LABELS: Record<string, string> = {
  oncor: "Oncor",
  centerpoint: "CenterPoint",
  aep: "AEP Texas",
  tnmp: "TNMP",
};

/**
 * Mirrors loa_form.php — Letter of Authorization form.
 * Generates LOA PDF (StreamingResponse) via POST /broker/forms/loa.
 * TDU checkboxes are mutually exclusive (mirrors PHP JS validateForm).
 * sentmail1 defaults to "operations@Orbic.com".
 */
export default function LoaPage() {
  const router = useRouter();

  const [dateStr,         setDateStr]         = useState("");
  const [expirationDate,  setExpirationDate]  = useState("");
  const [tdu,             setTdu]             = useState("");
  const [sentMail,        setSentMail]        = useState("operations@Orbic.com");
  const [esiNums,         setEsiNums]         = useState(["","","","","",""]);
  const [serviceAddresses,setServiceAddresses]= useState(["","","","","",""]);
  const [companyName,     setCompanyName]     = useState("");
  const [contactName,     setContactName]     = useState("");
  const [address,         setAddress]         = useState("");
  const [cityStateZip,    setCityStateZip]    = useState("");
  const [phone,           setPhone]           = useState("");
  const [fax,             setFax]             = useState("");
  const [email,           setEmail]           = useState("");
  const [printedName,     setPrintedName]     = useState("");
  const [title_,          setTitle_]          = useState("");
  const [authDate,        setAuthDate]        = useState("");
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  function updateEsi(idx: number, val: string) {
    const a = [...esiNums]; a[idx] = val; setEsiNums(a);
  }
  function updateAddr(idx: number, val: string) {
    const a = [...serviceAddresses]; a[idx] = val; setServiceAddresses(a);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tdu) { alert("Please select a TDU"); return; }
    setLoading(true); setError("");
    try {
      const res = await axios.post(
        `${API}/broker/forms/loa`,
        {
          date_str: dateStr, expiration_date: expirationDate,
          tdu, sent_mail: sentMail,
          esi_nums: esiNums, service_addresses: serviceAddresses,
          company_name: companyName, contact_name: contactName,
          address, city_state_zip: cityStateZip,
          phone, fax, email,
          printed_name: printedName, title_: title_, auth_date: authDate,
        },
        {
          responseType: "blob",
          headers: { Authorization: `Bearer ${getToken()}` },
        },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "LOA.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm";

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Generate LOA</h2>
        <p className="text-[#CC0000] text-sm mt-1">* Required Fields</p>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form name="myForm" onSubmit={handleSubmit}>
        <table>
          <tbody>
            <tr>
              <td className="pr-3 py-1 w-40">Date :</td>
              <td className="py-1">
                <input type="date" className={inputCls} value={dateStr}
                  onChange={e => setDateStr(e.target.value)} />
              </td>
            </tr>
            <tr>
              <td className="pr-3 py-1">Expiration Date :</td>
              <td className="py-1">
                <input type="date" className={inputCls} value={expirationDate}
                  onChange={e => setExpirationDate(e.target.value)} />
              </td>
            </tr>

            {/* TDU checkboxes — mutually exclusive (mirrors PHP JS) */}
            <tr>
              <td className="pr-3 py-2 align-top">TDU :</td>
              <td className="py-2">
                {TDUS.map(t => (
                  <label key={t} className="mr-4 text-sm">
                    <input
                      type="checkbox"
                      className="mr-1"
                      checked={tdu === t}
                      onChange={() => setTdu(prev => prev === t ? "" : t)}
                    />
                    {TDU_LABELS[t]}
                  </label>
                ))}
              </td>
            </tr>

            <tr>
              <td className="pr-3 py-1">Send To :</td>
              <td className="py-1">
                <input type="text" name="sentmail1" className={`${inputCls} w-64`}
                  value={sentMail} onChange={e => setSentMail(e.target.value)} />
              </td>
            </tr>

            {/* ESI / Service Address rows */}
            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm">ESI IDs &amp; Service Addresses</td></tr>
            {[0,1,2,3,4,5].map(i => (
              <tr key={i}>
                <td className="pr-3 py-1 text-sm text-gray-500">Row {i+1}</td>
                <td className="py-1 flex gap-2">
                  <input type="text" placeholder={`ESI ID ${i+1}`}
                    className={`${inputCls} w-48`}
                    value={esiNums[i]} onChange={e => updateEsi(i, e.target.value)} />
                  <input type="text" placeholder={`Service Address ${i+1}`}
                    className={`${inputCls} w-72`}
                    value={serviceAddresses[i]} onChange={e => updateAddr(i, e.target.value)} />
                </td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-4 pb-1 font-semibold text-sm">Customer Information</td></tr>
            {[
              ["Company Name",   companyName,   setCompanyName],
              ["Contact Name",   contactName,   setContactName],
              ["Address",        address,       setAddress],
              ["City/State/Zip", cityStateZip,  setCityStateZip],
              ["Phone",          phone,         setPhone],
              ["Fax",            fax,           setFax],
              ["Email",          email,         setEmail],
            ].map(([label, val, setter]) => (
              <tr key={label as string}>
                <td className="pr-3 py-1">{label as string} :</td>
                <td className="py-1">
                  <input type="text" className={`${inputCls} w-64`}
                    value={val as string}
                    onChange={e => (setter as (v:string)=>void)(e.target.value)} />
                </td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-4 pb-1 font-semibold text-sm">Authorization</td></tr>
            {[
              ["Printed Name", printedName, setPrintedName],
              ["Title",        title_,      setTitle_],
              ["Auth Date",    authDate,    setAuthDate],
            ].map(([label, val, setter]) => (
              <tr key={label as string}>
                <td className="pr-3 py-1">{label as string} :</td>
                <td className="py-1">
                  <input type="text" className={`${inputCls} w-64`}
                    value={val as string}
                    onChange={e => (setter as (v:string)=>void)(e.target.value)} />
                </td>
              </tr>
            ))}

            <tr>
              <td className="h-10">&nbsp;</td>
              <td>
                <input type="submit" value={loading ? "Generating…" : "Generate LOA PDF"}
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
