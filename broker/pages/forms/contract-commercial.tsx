import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../../components/Layout";
import { isLoggedIn, getToken } from "../../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const TERM_OPTIONS = ["3","6","9","12","18","24","36","48","Other"] as const;

/**
 * Mirrors contract_form.php — Commercial Electricity Contract.
 *
 * PHP logic replicated:
 *   - ASAP date toggle (start_date hidden when asapdate="ASAP" is checked)
 *   - Term radio buttons (option1-9); "Other" reveals monthes_other input
 *   - Fixed price vs LMP+ radio toggle (radio2)
 *   - ESIDs: esid1/2/3 with service addresses
 *   - Personal Guaranty fields at bottom
 */
export default function ContractCommercialPage() {
  const router = useRouter();

  const [dateDay,    setDateDay]    = useState("");
  const [dateMonth,  setDateMonth]  = useState("");
  const [buyer,      setBuyer]      = useState("");
  const [attn1,      setAttn1]      = useState("");
  const [street1,    setStreet1]    = useState("");
  const [city1,      setCity1]      = useState("");
  const [zip1,       setZip1]       = useState("");
  const [taxid,      setTaxid]      = useState("");
  const [phone1,     setPhone1]     = useState("");
  const [fax1,       setFax1]       = useState("");
  const [email1,     setEmail1]     = useState("");
  const [attn2,      setAttn2]      = useState("");
  const [street2,    setStreet2]    = useState("");
  const [city2,      setCity2]      = useState("");
  const [zip2,       setZip2]       = useState("");
  const [phone2,     setPhone2]     = useState("");
  const [fax2,       setFax2]       = useState("");
  const [email2,     setEmail2]     = useState("");
  const [bill,       setBill]       = useState("");
  const [spanish,    setSpanish]    = useState("");
  const [startDate,  setStartDate]  = useState("");
  const [asap,       setAsap]       = useState(false);
  const [termMonths, setTermMonths] = useState("");
  const [termOther,  setTermOther]  = useState("");
  const [priceType,  setPriceType]  = useState("fixed");
  const [fixedprice, setFixedprice] = useState("");
  const [lmpplus,    setLmpplus]    = useState("");
  const [meterfee,   setMeterfee]   = useState("");
  const [esid1,      setEsid1]      = useState("");
  const [svcAdd1,    setSvcAdd1]    = useState("");
  const [csCity1,    setCsCity1]    = useState("");
  const [esid2,      setEsid2]      = useState("");
  const [svcAdd2,    setSvcAdd2]    = useState("");
  const [csCity2,    setCsCity2]    = useState("");
  const [esid3,      setEsid3]      = useState("");
  const [svcAdd3,    setSvcAdd3]    = useState("");
  const [csCity3,    setCsCity3]    = useState("");
  const [pname,      setPname]      = useState("");
  const [socecurity, setSocecurity] = useState("");
  const [driverl,    setDriverl]    = useState("");
  const [pphone,     setPphone]     = useState("");
  const [paddress,   setPaddress]   = useState("");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const months = termMonths === "Other" ? termOther : termMonths;
    try {
      const res = await axios.post(
        `${API}/broker/forms/contract-commercial`,
        {
          date_day: dateDay, date_month: dateMonth,
          buyer, attn1, street1, city1, zip1, taxid, phone1, fax1, email1,
          attn2, street2, city2, zip2, phone2, fax2, email2,
          bill, spanish,
          start_date: asap ? "ASAP" : startDate, asapdate: asap ? "ASAP" : "",
          term_months: months,
          fixedprice: priceType === "fixed" ? fixedprice : "",
          lmpplus: priceType === "lmp" ? lmpplus : "",
          meterfee,
          esid1, service_add1: svcAdd1, citystreet1: csCity1,
          esid2, service_add2: svcAdd2, citystreet2: csCity2,
          esid3, service_add3: svcAdd3, citystreet3: csCity3,
          pname, socecurity, driverl, pphone, paddress,
        },
        { responseType: "blob", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "Commercial_Contract.pdf"; a.click();
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
        <h2 className="text-xl font-bold text-gray-800">Commercial Contract</h2>
        <p className="text-[#CC0000] text-sm mt-1">* Required Fields</p>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form name="myForm" onSubmit={handleSubmit}>
        <table>
          <tbody>
            {/* Date */}
            <tr>
              <td className="pr-3 py-1 w-44 text-sm">Date :</td>
              <td className="py-1 flex gap-2">
                <input type="text" placeholder="Day" className={inp2} value={dateDay}
                  onChange={e => setDateDay(e.target.value)} name="date_day" />
                <input type="text" placeholder="Month" className={inp2} value={dateMonth}
                  onChange={e => setDateMonth(e.target.value)} name="date_month" />
              </td>
            </tr>
            <tr>
              <td className="pr-3 py-1 text-sm">Buyer :</td>
              <td><input className={inp} value={buyer} onChange={e => setBuyer(e.target.value)} name="buyer" /></td>
            </tr>

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Billing Address</td></tr>
            {[
              ["Attention",  attn1,   setAttn1,   "attn1"],
              ["Street",     street1, setStreet1, "street1"],
              ["City",       city1,   setCity1,   "city1"],
              ["Zip",        zip1,    setZip1,    "zip1"],
              ["Tax ID",     taxid,   setTaxid,   "taxid"],
              ["Phone",      phone1,  setPhone1,  "phone1"],
              ["Fax",        fax1,    setFax1,    "fax1"],
              ["Email",      email1,  setEmail1,  "email1"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 text-sm">{label as string} :</td>
                <td><input className={inp} value={val as string} name={name as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Primary Service Address</td></tr>
            {[
              ["Attention",  attn2,   setAttn2,   "attn2"],
              ["Street",     street2, setStreet2, "street2"],
              ["City",       city2,   setCity2,   "city2"],
              ["Zip",        zip2,    setZip2,    "zip2"],
              ["Phone",      phone2,  setPhone2,  "phone2"],
              ["Fax",        fax2,    setFax2,    "fax2"],
              ["Email",      email2,  setEmail2,  "email2"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 text-sm">{label as string} :</td>
                <td><input className={inp} value={val as string} name={name as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Contract Details</td></tr>
            <tr>
              <td className="pr-3 py-1 text-sm">Bill :</td>
              <td><input className={inp} value={bill} onChange={e => setBill(e.target.value)} name="bill" /></td>
            </tr>
            <tr>
              <td className="pr-3 py-1 text-sm">Spanish :</td>
              <td>
                <select className="border border-gray-300 rounded px-2 py-1 text-sm"
                  value={spanish} onChange={e => setSpanish(e.target.value)} name="spanish">
                  <option value="">No</option>
                  <option value="yes">Yes</option>
                </select>
              </td>
            </tr>

            {/* Start date / ASAP toggle */}
            <tr>
              <td className="pr-3 py-1 text-sm">Start Date :</td>
              <td className="py-1 flex items-center gap-3">
                {!asap && (
                  <input type="date" className={inp2} value={startDate}
                    onChange={e => setStartDate(e.target.value)} name="start_date" />
                )}
                <label className="text-sm">
                  <input type="checkbox" className="mr-1" checked={asap}
                    onChange={e => setAsap(e.target.checked)} name="asapdate" />
                  ASAP
                </label>
              </td>
            </tr>

            {/* Term radio */}
            <tr>
              <td className="pr-3 py-2 align-top text-sm">Term (months) :</td>
              <td className="py-2">
                {TERM_OPTIONS.map(t => (
                  <label key={t} className="mr-3 text-sm">
                    <input type="radio" name="term" className="mr-1"
                      value={t} checked={termMonths === t}
                      onChange={() => setTermMonths(t)} />
                    {t}
                  </label>
                ))}
                {termMonths === "Other" && (
                  <input type="text" placeholder="Months" className={`${inp2} ml-2`}
                    value={termOther} onChange={e => setTermOther(e.target.value)}
                    name="monthes_other" />
                )}
              </td>
            </tr>

            {/* Price type */}
            <tr>
              <td className="pr-3 py-2 align-top text-sm">Price Type :</td>
              <td className="py-2">
                <label className="mr-4 text-sm">
                  <input type="radio" name="radio2" className="mr-1"
                    value="fixed" checked={priceType === "fixed"}
                    onChange={() => setPriceType("fixed")} />
                  Fixed Price
                </label>
                <label className="text-sm">
                  <input type="radio" name="radio2" className="mr-1"
                    value="lmp" checked={priceType === "lmp"}
                    onChange={() => setPriceType("lmp")} />
                  LMP+
                </label>
              </td>
            </tr>
            {priceType === "fixed" && (
              <tr>
                <td className="pr-3 py-1 text-sm">Fixed Price :</td>
                <td><input className={inp} value={fixedprice} name="fixedprice"
                  onChange={e => setFixedprice(e.target.value)} /></td>
              </tr>
            )}
            {priceType === "lmp" && (
              <tr>
                <td className="pr-3 py-1 text-sm">LMP+ :</td>
                <td><input className={inp} value={lmpplus} name="lmpplus"
                  onChange={e => setLmpplus(e.target.value)} /></td>
              </tr>
            )}
            <tr>
              <td className="pr-3 py-1 text-sm">Meter Fee :</td>
              <td><input className={inp} value={meterfee} name="meterfee"
                onChange={e => setMeterfee(e.target.value)} /></td>
            </tr>

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

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Personal Guaranty</td></tr>
            {[
              ["Name",             pname,      setPname,      "pname"],
              ["Social Security",  socecurity, setSocecurity, "socecurity"],
              ["Driver's License", driverl,    setDriverl,    "driverl"],
              ["Phone",            pphone,     setPphone,     "pphone"],
              ["Address",          paddress,   setPaddress,   "paddress"],
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
