import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../../components/Layout";
import { isLoggedIn, getToken } from "../../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/**
 * Mirrors ach_form.php — ACH / Credit Card Authorization form.
 * Submits to POST /broker/forms/ach → returns PDF blob.
 * Fields: authorization checkbox, credit card info, customer info, signatures.
 */
export default function AchPage() {
  const router = useRouter();

  const [authorization, setAuthorization] = useState(false);
  const [effDate,    setEffDate]    = useState("");
  const [cardName,   setCardName]   = useState("");
  const [cardType,   setCardType]   = useState("");
  const [ccnumber,   setCcnumber]   = useState("");
  const [expDate,    setExpDate]    = useState("");
  const [secCode,    setSecCode]    = useState("");
  const [billAddress,setBillAddress]= useState("");
  const [billingcsz, setBillingcsz] = useState("");
  const [apcName,    setApcName]    = useState("");
  const [apaNum,     setApaNum]     = useState("");
  const [authSig,    setAuthSig]    = useState("");
  const [title_,     setTitle_]     = useState("");
  const [prtName,    setPrtName]    = useState("");
  const [date_,      setDate_]      = useState("");
  const [authSig2,   setAuthSig2]   = useState("");
  const [title2,     setTitle2]     = useState("");
  const [prtName2,   setPrtName2]   = useState("");
  const [date2,      setDate2]      = useState("");
  const [emailAdd,   setEmailAdd]   = useState("");
  const [phNo,       setPhNo]       = useState("");
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
        `${API}/broker/forms/ach`,
        {
          authorization, eff_date: effDate, card_name: cardName,
          card_type: cardType, ccnumber, exp_date: expDate,
          sec_code: secCode, bill_address: billAddress, billingcsz,
          apc_name: apcName, apa_num: apaNum,
          auth_sig: authSig, title_: title_, prt_name: prtName, date_,
          auth_sig2: authSig2, title2, prt_name2: prtName2, date2,
          email_add: emailAdd, ph_no: phNo,
        },
        { responseType: "blob", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "ACH_Form.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF.");
    } finally {
      setLoading(false);
    }
  }

  const inp = "border border-gray-300 rounded px-2 py-1 text-sm w-64";
  const row = (label: string, val: string, setter: (v: string) => void, type = "text") => (
    <tr key={label}>
      <td className="pr-3 py-1 text-sm w-44">{label} :</td>
      <td className="py-1">
        <input type={type} className={inp} value={val}
          onChange={e => setter(e.target.value)} />
      </td>
    </tr>
  );

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">ACH Form</h2>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form onSubmit={handleSubmit}>
        <table>
          <tbody>
            <tr>
              <td className="pr-3 py-2 text-sm w-44">Authorization :</td>
              <td className="py-2">
                <label className="text-sm">
                  <input type="checkbox" name="authorization" className="mr-2"
                    checked={authorization}
                    onChange={e => setAuthorization(e.target.checked)} />
                  Change to Existing
                </label>
              </td>
            </tr>

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Credit Card Information</td></tr>
            {row("Effective Date",    effDate,     setEffDate,    "date")}
            {row("Name on Card",      cardName,    setCardName)}
            <tr>
              <td className="pr-3 py-1 text-sm">Card Type :</td>
              <td className="py-1">
                <select className="border border-gray-300 rounded px-2 py-1 text-sm"
                  value={cardType} onChange={e => setCardType(e.target.value)}>
                  <option value="">Select</option>
                  <option>Visa</option>
                  <option>MasterCard</option>
                  <option>American Express</option>
                  <option>Discover</option>
                </select>
              </td>
            </tr>
            {row("Card Number",       ccnumber,    setCcnumber)}
            {row("Expiration Date",   expDate,     setExpDate)}
            {row("Security Code",     secCode,     setSecCode)}
            {row("Billing Address",   billAddress, setBillAddress)}
            {row("City/State/Zip",    billingcsz,  setBillingcsz)}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Customer Information</td></tr>
            {row("Customer Name",     apcName,     setApcName)}
            {row("Account Number",    apaNum,      setApaNum)}
            {row("Email",             emailAdd,    setEmailAdd, "email")}
            {row("Phone",             phNo,        setPhNo)}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Signature 1</td></tr>
            {row("Signature",         authSig,     setAuthSig)}
            {row("Title",             title_,      setTitle_)}
            {row("Printed Name",      prtName,     setPrtName)}
            {row("Date",              date_,       setDate_, "date")}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Signature 2</td></tr>
            {row("Signature",         authSig2,    setAuthSig2)}
            {row("Title",             title2,      setTitle2)}
            {row("Printed Name",      prtName2,    setPrtName2)}
            {row("Date",              date2,       setDate2, "date")}

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
