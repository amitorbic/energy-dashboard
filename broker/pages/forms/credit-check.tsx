import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import axios from "axios";
import Layout from "../../components/Layout";
import { isLoggedIn, getToken } from "../../utils/auth";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

/**
 * Mirrors credit_check_form.php — Credit Check Authorization.
 * Fields: pname, sno, phone, address, signature, date.
 */
export default function CreditCheckPage() {
  const router = useRouter();

  const [pname,    setPname]    = useState("");
  const [sno,      setSno]      = useState("");
  const [phone,    setPhone]    = useState("");
  const [address,  setAddress]  = useState("");
  const [signature,setSignature]= useState("");
  const [date_,    setDate_]    = useState("");
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const res = await axios.post(
        `${API}/broker/forms/credit-check`,
        { pname, sno, phone, address, signature, date_ },
        { responseType: "blob", headers: { Authorization: `Bearer ${getToken()}` } },
      );
      const url = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a"); a.href = url; a.download = "Credit_Check.pdf"; a.click();
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
        <h2 className="text-xl font-bold text-gray-800">Credit Check Authorization</h2>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form onSubmit={handleSubmit}>
        <table>
          <tbody>
            {[
              ["Full Name",    pname,     setPname,     "pname"],
              ["SSN / Tax ID", sno,       setSno,       "sno"],
              ["Phone",        phone,     setPhone,     "phone"],
              ["Address",      address,   setAddress,   "address"],
              ["Signature",    signature, setSignature, "signature"],
              ["Date",         date_,     setDate_,     "date"],
            ].map(([label, val, setter, name]) => (
              <tr key={name as string}>
                <td className="pr-3 py-1 w-44 text-sm">{label as string} :</td>
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
