import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../../components/Layout";
import { isLoggedIn, getToken } from "../../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/**
 * Mirrors corporate_guaranty_form.php — Corporate Guaranty form.
 * Fields: text (company), date/month/year, cname, textid, phone, address.
 */
export default function CorporateGuaranteePage() {
  const router = useRouter();

  const [text,   setText]   = useState("");
  const [date_,  setDate_]  = useState("");
  const [month,  setMonth]  = useState("");
  const [year,   setYear]   = useState("");
  const [cname,  setCname]  = useState("");
  const [textid, setTextid] = useState("");
  const [phone,  setPhone]  = useState("");
  const [street, setStreet] = useState("");
  const [city,   setCity]   = useState("");
  const [state,  setState]  = useState("");
  const [zip_,   setZip_]   = useState("");
  const [loading,setLoading]= useState(false);
  const [error,  setError]  = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await axios.post(
        `${API}/broker/forms/corporate-guarantee`,
        { text, date_, month, year, cname, textid, phone, street, city, state, zip_ },
        { responseType: "blob", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "Corporate_Guaranty.pdf"; a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF.");
    } finally {
      setLoading(false);
    }
  }

  const inp = "border border-gray-300 rounded px-2 py-1 text-sm w-64";
  const inp2 = "border border-gray-300 rounded px-2 py-1 text-sm w-28";

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Corporate Guaranty</h2>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form onSubmit={handleSubmit}>
        <table>
          <tbody>
            <tr>
              <td className="pr-3 py-1 w-44 text-sm">Company / Business :</td>
              <td><input className={inp} name="text" value={text}
                onChange={e => setText(e.target.value)} /></td>
            </tr>

            {/* Date parts */}
            <tr>
              <td className="pr-3 py-1 text-sm">Date :</td>
              <td className="py-1 flex gap-2">
                <input placeholder="Day" className={inp2} name="date" value={date_}
                  onChange={e => setDate_(e.target.value)} />
                <input placeholder="Month" className={inp2} name="month" value={month}
                  onChange={e => setMonth(e.target.value)} />
                <input placeholder="Year" className={inp2} name="year" value={year}
                  onChange={e => setYear(e.target.value)} />
              </td>
            </tr>

            {[
              ["Corporate Name", cname,  setCname,  "cname"],
              ["Tax ID",         textid, setTextid, "textid"],
              ["Phone",          phone,  setPhone,  "phone"],
              ["Street",         street, setStreet, "street"],
              ["City",           city,   setCity,   "city"],
              ["State",          state,  setState,  "state"],
              ["Zip",            zip_,   setZip_,   "zip"],
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
