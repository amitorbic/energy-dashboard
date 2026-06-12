import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../../components/Layout";
import { isLoggedIn, getToken } from "../../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const REQUEST_TYPE_OPTIONS = [
  { name: "regular_movein",     label: "Regular Move-In" },
  { name: "regular_switch",     label: "Regular Switch" },
  { name: "priority_movein",    label: "Priority Move-In" },
  { name: "priority_switch",    label: "Priority Switch" },
  { name: "self_select_movein", label: "Self-Select Move-In" },
  { name: "self_select_switch", label: "Self-Select Switch" },
];

/**
 * Mirrors meter_add_form.php — Add meter to existing account.
 * Request type checkboxes; Self-Select options reveal date pickers.
 */
export default function MeterAddPage() {
  const router = useRouter();

  const [accountName,       setAccountName]       = useState("");
  const [esiid,             setEsiid]             = useState("");
  const [contractName,      setContractName]       = useState("");
  const [phone,             setPhone]             = useState("");
  const [currentEndDate,    setCurrentEndDate]    = useState("");
  const [rate,              setRate]              = useState("");
  const [requestTypes,      setRequestTypes]      = useState<string[]>([]);
  const [selfMoveDate,      setSelfMoveDate]      = useState("");
  const [selfSelectDate,    setSelfSelectDate]    = useState("");
  const [contractEndDate,   setContractEndDate]   = useState("");
  const [addMeterRate,      setAddMeterRate]      = useState("");
  const [billingAddr,       setBillingAddr]       = useState("");
  const [note,              setNote]              = useState("");
  const [esiid1,            setEsiid1]            = useState("");
  const [serviceAddr1,      setServiceAddr1]      = useState("");
  const [city1,             setCity1]             = useState("");
  const [esiid2,            setEsiid2]            = useState("");
  const [serviceAddr2,      setServiceAddr2]      = useState("");
  const [city2,             setCity2]             = useState("");
  const [esiid3,            setEsiid3]            = useState("");
  const [serviceAddr3,      setServiceAddr3]      = useState("");
  const [city3,             setCity3]             = useState("");
  const [printedName1,      setPrintedName1]      = useState("");
  const [printedName2,      setPrintedName2]      = useState("");
  const [title1,            setTitle1]            = useState("");
  const [dat1,              setDat1]              = useState("");
  const [loading,           setLoading]           = useState(false);
  const [error,             setError]             = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  function toggleType(name: string) {
    setRequestTypes(prev =>
      prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name],
    );
  }

  const hasSelfMove   = requestTypes.includes("self_select_movein");
  const hasSelfSwitch = requestTypes.includes("self_select_switch");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await axios.post(
        `${API}/broker/forms/meter-add`,
        {
          account_name: accountName, esiid, contract_name: contractName,
          phone, current_contract_end_date: currentEndDate, rate,
          request_types: requestTypes,
          self_move_date: selfMoveDate, self_select_date: selfSelectDate,
          contract_end_date: contractEndDate, add_meter_rate: addMeterRate,
          billing_addr: billingAddr, note,
          esiid1, service_addr1: serviceAddr1, city1,
          esiid2, service_addr2: serviceAddr2, city2,
          esiid3, service_addr3: serviceAddr3, city3,
          printed_name1: printedName1, printed_name2: printedName2,
          title1, dat1,
        },
        { responseType: "blob", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "Meter_Add.pdf"; a.click();
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
        <h2 className="text-xl font-bold text-gray-800">Meter Add</h2>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form onSubmit={handleSubmit}>
        <table>
          <tbody>
            <tr><td colSpan={2} className="pb-1 font-semibold text-sm">Account Information</td></tr>
            {[
              ["Account Name",              accountName,    setAccountName,    "account_name"],
              ["Current ESIID",             esiid,          setEsiid,          "esiid"],
              ["Contract Name",             contractName,   setContractName,   "contract_name"],
              ["Phone",                     phone,          setPhone,          "phone"],
              ["Current Contract End Date", currentEndDate, setCurrentEndDate, "current_contract_end_date"],
              ["Current Rate",              rate,           setRate,           "rate"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 w-56 text-sm">{label as string} :</td>
                <td><input className={inp} name={name as string} value={val as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            {/* Request type checkboxes */}
            <tr>
              <td className="pr-3 py-2 align-top text-sm">Request Type :</td>
              <td className="py-2">
                {REQUEST_TYPE_OPTIONS.map(({ name, label }) => (
                  <label key={name} className="block text-sm mb-1">
                    <input type="checkbox" className="mr-2"
                      checked={requestTypes.includes(name)}
                      onChange={() => toggleType(name)} />
                    {label}
                  </label>
                ))}
              </td>
            </tr>

            {/* Self-select dates */}
            {hasSelfMove && (
              <tr>
                <td className="pr-3 py-1 text-sm">Self-Select Move-In Date :</td>
                <td><input type="date" className={inp2} name="self_move_date"
                  value={selfMoveDate} onChange={e => setSelfMoveDate(e.target.value)} /></td>
              </tr>
            )}
            {hasSelfSwitch && (
              <tr>
                <td className="pr-3 py-1 text-sm">Self-Select Switch Date :</td>
                <td><input type="date" className={inp2} name="self_select_date"
                  value={selfSelectDate} onChange={e => setSelfSelectDate(e.target.value)} /></td>
              </tr>
            )}

            {[
              ["New Contract End Date", contractEndDate, setContractEndDate, "contract_end_date"],
              ["Add Meter Rate",        addMeterRate,    setAddMeterRate,    "add_meter_rate"],
              ["Billing Address",       billingAddr,     setBillingAddr,     "billing_addr"],
              ["Notes",                 note,            setNote,            "note"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 text-sm">{label as string} :</td>
                <td><input className={inp} name={name as string} value={val as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Meters to Add</td></tr>
            {([
              {i:"1", esid:esiid1, setEsid:setEsiid1, svc:serviceAddr1, setSvc:setServiceAddr1, cty:city1, setCty:setCity1},
              {i:"2", esid:esiid2, setEsid:setEsiid2, svc:serviceAddr2, setSvc:setServiceAddr2, cty:city2, setCty:setCity2},
              {i:"3", esid:esiid3, setEsid:setEsiid3, svc:serviceAddr3, setSvc:setServiceAddr3, cty:city3, setCty:setCity3},
            ] as const).map(({i, esid, setEsid, svc, setSvc, cty, setCty}) => (
              <tr key={i}>
                <td className="pr-3 py-1 text-sm text-gray-500">Meter {i} :</td>
                <td className="py-1 flex gap-2">
                  <input placeholder="ESID" className={inp2}
                    name={`esiid${i}`} value={esid} onChange={e => setEsid(e.target.value)} />
                  <input placeholder="Service Address" className={inp}
                    name={`service_addr${i}`} value={svc} onChange={e => setSvc(e.target.value)} />
                  <input placeholder="City" className={inp2}
                    name={`city${i}`} value={cty} onChange={e => setCty(e.target.value)} />
                </td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Signatures</td></tr>
            {[
              ["Customer Printed Name", printedName1, setPrintedName1, "printed_name1"],
              ["Title",                 title1,       setTitle1,       "title1"],
              ["Date",                  dat1,         setDat1,         "dat1"],
              ["Rep Printed Name",      printedName2, setPrintedName2, "printed_name2"],
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
