import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../../components/Layout";
import { isLoggedIn, getToken } from "../../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/**
 * Mirrors residential_contract_form.php — Residential Electricity Contract.
 * Term: option1-4 checkboxes.
 * ASAP toggle mirrors PHP JS.
 */
export default function ContractResidentialPage() {
  const router = useRouter();

  const [dateDay,   setDateDay]   = useState("");
  const [dateMonth, setDateMonth] = useState("");
  const [cname,     setCname]     = useState("");
  const [ssecurit,  setSsecurit]  = useState("");
  const [driverl,   setDriverl]   = useState("");
  const [strAdd,    setStrAdd]    = useState("");
  const [cityAdd,   setCityAdd]   = useState("");
  const [state,     setState]     = useState("");
  const [zip,       setZip]       = useState("");
  const [attn,      setAttn]      = useState("");
  const [phone,     setPhone]     = useState("");
  const [bfax,      setBfax]      = useState("");
  const [emailName, setEmailName] = useState("");
  const [serverName,setServerName]= useState("");
  const [siteName,  setSiteName]  = useState("");
  const [billType,  setBillType]  = useState("");
  const [startDate, setStartDate] = useState("");
  const [asap,      setAsap]      = useState(false);
  const [terms,     setTerms]     = useState<string[]>([]);
  const [esid1,     setEsid1]     = useState("");
  const [svcAdd1,   setSvcAdd1]   = useState("");
  const [csCity1,   setCsCity1]   = useState("");
  const [esid2,     setEsid2]     = useState("");
  const [svcAdd2,   setSvcAdd2]   = useState("");
  const [csCity2,   setCsCity2]   = useState("");
  const [esid3,     setEsid3]     = useState("");
  const [svcAdd3,   setSvcAdd3]   = useState("");
  const [csCity3,   setCsCity3]   = useState("");
  const [conPrice,  setConPrice]  = useState("");
  const [conTerm,   setConTerm]   = useState("");
  const [signature, setSignature] = useState("");
  const [pname,     setPname]     = useState("");
  const [lifesupport,setLifesupport]=useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  function toggleTerm(t: string) {
    setTerms(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await axios.post(
        `${API}/broker/forms/contract-residential`,
        {
          date_day: dateDay, date_month: dateMonth,
          cname, ssecurit, driverl,
          str_add: strAdd, city_add: cityAdd, state, zip_: zip,
          attn, phone, bfax, email_name: emailName,
          server_name: serverName, site_name: siteName, bill_type: billType,
          start_date: asap ? "ASAP" : startDate, asap: asap ? "ASAP" : "",
          term_options: terms,
          esid1, service_add1: svcAdd1, citystreet1: csCity1,
          esid2, service_add2: svcAdd2, citystreet2: csCity2,
          esid3, service_add3: svcAdd3, citystreet3: csCity3,
          con_price: conPrice, con_term: conTerm,
          signature, pname, lifesupport,
        },
        { responseType: "blob", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "Residential_Contract.pdf"; a.click();
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
        <h2 className="text-xl font-bold text-gray-800">Residential Contract</h2>
        <p className="text-[#CC0000] text-sm mt-1">* Required Fields</p>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form name="myForm" onSubmit={handleSubmit}>
        <table>
          <tbody>
            <tr>
              <td className="pr-3 py-1 w-44 text-sm">Date :</td>
              <td className="py-1 flex gap-2">
                <input placeholder="Day" className={inp2} value={dateDay}
                  onChange={e => setDateDay(e.target.value)} name="date_day" />
                <input placeholder="Month" className={inp2} value={dateMonth}
                  onChange={e => setDateMonth(e.target.value)} name="date_month" />
              </td>
            </tr>

            {[
              ["Customer Name",   cname,      setCname,      "cname"],
              ["SSN",             ssecurit,   setSsecurit,   "ssecurit"],
              ["Driver's License",driverl,    setDriverl,    "Driverl"],
              ["Street Address",  strAdd,     setStrAdd,     "str_add"],
              ["City",            cityAdd,    setCityAdd,    "city_add"],
              ["State",           state,      setState,      "state"],
              ["Zip",             zip,        setZip,        "zip"],
              ["Attention",       attn,       setAttn,       "attn"],
              ["Phone",           phone,      setPhone,      "phone"],
              ["Fax",             bfax,       setBfax,       "bfax"],
              ["Email",           emailName,  setEmailName,  "email_name"],
              ["Server Name",     serverName, setServerName, "server_name"],
              ["Site Name",       siteName,   setSiteName,   "site_name"],
              ["Billing Type",    billType,   setBillType,   "bill_type"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 text-sm">{label as string} :</td>
                <td><input className={inp} value={val as string} name={name as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            {/* Start date / ASAP */}
            <tr>
              <td className="pr-3 py-1 text-sm">Start Date :</td>
              <td className="py-1 flex items-center gap-3">
                {!asap && (
                  <input type="date" className={inp2} value={startDate}
                    onChange={e => setStartDate(e.target.value)} name="start_date" />
                )}
                <label className="text-sm">
                  <input type="checkbox" className="mr-1" checked={asap}
                    onChange={e => setAsap(e.target.checked)} name="asap" />
                  ASAP
                </label>
              </td>
            </tr>

            {/* Term checkboxes */}
            <tr>
              <td className="pr-3 py-2 align-top text-sm">Term :</td>
              <td className="py-2">
                {["option1","option2","option3","option4"].map((opt, i) => (
                  <label key={opt} className="mr-4 text-sm">
                    <input type="checkbox" name={opt} className="mr-1"
                      checked={terms.includes(opt)}
                      onChange={() => toggleTerm(opt)} />
                    {["6 months","12 months","24 months","36 months"][i]}
                  </label>
                ))}
              </td>
            </tr>

            {[
              ["Contract Price", conPrice, setConPrice, "con_price"],
              ["Contract Term",  conTerm,  setConTerm,  "con_term"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 text-sm">{label as string} :</td>
                <td><input className={inp} value={val as string} name={name as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">ESI IDs</td></tr>
            {([
              {i:"1", esid:esid1, setEsid:setEsid1, svc:svcAdd1, setSvc:setSvcAdd1, cs:csCity1, setCs:setCsCity1},
              {i:"2", esid:esid2, setEsid:setEsid2, svc:svcAdd2, setSvc:setSvcAdd2, cs:csCity2, setCs:setCsCity2},
              {i:"3", esid:esid3, setEsid:setEsid3, svc:svcAdd3, setSvc:setSvcAdd3, cs:csCity3, setCs:setCsCity3},
            ] as const).map(({i, esid, setEsid, svc, setSvc, cs, setCs}) => (
              <tr key={i}>
                <td className="pr-3 py-1 text-sm text-gray-500">ESID {i} :</td>
                <td className="py-1 flex gap-2">
                  <input type="text" placeholder="ESID" className={inp2}
                    value={esid} name={`esid${i}`} onChange={e => setEsid(e.target.value)} />
                  <input type="text" placeholder="Service Address" className={inp}
                    value={svc} name={`service_add${i}`} onChange={e => setSvc(e.target.value)} />
                  <input type="text" placeholder="City/Street" className={inp2}
                    value={cs} name={`citystreet${i}`} onChange={e => setCs(e.target.value)} />
                </td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Signature</td></tr>
            {[
              ["Signature",    signature,   setSignature,   "signature"],
              ["Printed Name", pname,       setPname,       "pname"],
              ["Life Support", lifesupport, setLifesupport, "lifesupport"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 text-sm">{label as string} :</td>
                <td><input className={inp} value={val as string} name={name as string}
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
