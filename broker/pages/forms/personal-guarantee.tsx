import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../../components/Layout";
import { isLoggedIn, getToken } from "../../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/**
 * Mirrors personal_guaranty_form.php — Personal Guaranty form.
 * Fields: text (business name), text1-3, guarantor personal info.
 */
export default function PersonalGuaranteePage() {
  const router = useRouter();

  const [text,    setText]    = useState("");
  const [text1,   setText1]   = useState("");
  const [text2,   setText2]   = useState("");
  const [text3,   setText3]   = useState("");
  const [sig,     setSig]     = useState("");
  const [pName,   setPName]   = useState("");
  const [streetAdd, setStreetAdd] = useState("");
  const [cityStateZip, setCityStateZip] = useState("");
  const [homePhNo, setHomePhNo] = useState("");
  const [ssn,     setSsn]     = useState("");
  const [driverlno,setDriverlno]=useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await axios.post(
        `${API}/broker/forms/personal-guarantee`,
        {
          text, text1, text2, text3, sig, p_name: pName,
          street_add: streetAdd, city_state_zip: cityStateZip,
          home_ph_no: homePhNo, social_security_no: ssn, driverlno,
        },
        { responseType: "blob", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "Personal_Guaranty.pdf"; a.click();
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
        <h2 className="text-xl font-bold text-gray-800">Personal Guaranty</h2>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form onSubmit={handleSubmit}>
        <table>
          <tbody>
            <tr>
              <td className="pr-3 py-1 w-44 text-sm">Business Name :</td>
              <td><input className={inp} name="text" value={text}
                onChange={e => setText(e.target.value)} /></td>
            </tr>
            {[
              ["Additional Info 1", text1,  setText1,  "text1"],
              ["Additional Info 2", text2,  setText2,  "text2"],
              ["Additional Info 3", text3,  setText3,  "text3"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 text-sm">{label as string} :</td>
                <td><input className={inp} name={name as string} value={val as string}
                  onChange={e => (setter as (v:string)=>void)(e.target.value)} /></td>
              </tr>
            ))}

            <tr><td colSpan={2} className="pt-3 pb-1 font-semibold text-sm border-t border-gray-200">Personal Guarantor</td></tr>
            {[
              ["Full Name",          pName,       setPName,       "p_name"],
              ["Home Address",       streetAdd,   setStreetAdd,   "street_add"],
              ["City/State/Zip",     cityStateZip,setCityStateZip,"city_state_zip"],
              ["Home Phone",         homePhNo,    setHomePhNo,    "home_ph_no"],
              ["Social Security #",  ssn,         setSsn,         "social_security_no"],
              ["Driver's License",   driverlno,   setDriverlno,   "driverlno"],
              ["Signature",          sig,         setSig,         "sig"],
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
