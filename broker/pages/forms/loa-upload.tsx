import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn, getToken } from "../../utils/auth";
import axios from "axios";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

const TDUS = ["oncor", "centerpoint", "aep", "tnmp"] as const;
const TDU_LABELS: Record<string, string> = {
  oncor: "Oncor",
  centerpoint: "CenterPoint",
  aep: "AEP Texas",
  tnmp: "TNMP",
};

/**
 * Mirrors loa_upload.php — uploads a signed LOA PDF and emails it to the
 * selected TDSP utility.
 *
 * Validation (mirrors PHP validateForm()):
 *   - File must be selected
 *   - At least one TDSP must be checked
 *   - Subject (subj) must be filled
 *
 * TDU checkboxes are mutually exclusive (mirrors PHP JS).
 */
export default function LoaUploadPage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [tdu,      setTdu]      = useState("");
  const [fromEmail,setFromEmail]= useState("");
  const [subj,     setSubj]     = useState("");
  const [comments, setComments] = useState("");
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState("");
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  function validate(): boolean {
    if (!fileRef.current?.files?.[0]) { alert("Please select a file"); return false; }
    if (!tdu) { alert("Please select a TDU"); return false; }
    if (!subj.trim()) { alert("Subject is required"); return false; }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setLoading(true); setMsg(""); setError("");
    const fd = new FormData();
    fd.append("file", fileRef.current!.files![0]);
    fd.append("tdsp", tdu);
    fd.append("from_email", fromEmail);
    fd.append("subj", subj);
    fd.append("comments", comments);

    try {
      const res = await axios.post(`${API}/broker/forms/loa-upload`, fd, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      setMsg(res.data.message || "LOA emailed successfully.");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  const inputCls = "border border-gray-300 rounded px-2 py-1 text-sm";

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Upload LOA</h2>
        <p className="text-[#CC0000] text-sm mt-1">* Required Fields</p>
      </section>

      {msg   && <p className="text-green-700 font-medium text-sm mb-3">{msg}</p>}
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form name="myForm" onSubmit={handleSubmit} encType="multipart/form-data">
        <table>
          <tbody>
            {/* File input */}
            <tr>
              <td className="pr-3 py-1 w-40">
                <span className="text-[#CC0000]">*</span> LOA File :
              </td>
              <td className="py-1">
                <input type="file" ref={fileRef} accept=".pdf,.doc,.docx"
                  name="loa_user_pdf" className="text-sm" />
              </td>
            </tr>

            {/* From email */}
            <tr>
              <td className="pr-3 py-1">From Email :</td>
              <td className="py-1">
                <input type="email" name="from_email" className={`${inputCls} w-64`}
                  value={fromEmail} onChange={e => setFromEmail(e.target.value)} />
              </td>
            </tr>

            {/* TDU checkboxes — mutually exclusive */}
            <tr>
              <td className="pr-3 py-2 align-top">
                <span className="text-[#CC0000]">*</span> TDU :
              </td>
              <td className="py-2">
                {TDUS.map(t => (
                  <label key={t} className="mr-4 text-sm">
                    <input type="checkbox" className="mr-1"
                      checked={tdu === t}
                      onChange={() => setTdu(prev => prev === t ? "" : t)} />
                    {TDU_LABELS[t]}
                  </label>
                ))}
              </td>
            </tr>

            {/* Subject */}
            <tr>
              <td className="pr-3 py-1">
                <span className="text-[#CC0000]">*</span> Subject :
              </td>
              <td className="py-1">
                <input type="text" name="subj" className={`${inputCls} w-64`}
                  value={subj} onChange={e => setSubj(e.target.value)} />
              </td>
            </tr>

            {/* Comments */}
            <tr>
              <td className="pr-3 py-1 align-top">Comments :</td>
              <td className="py-1">
                <textarea name="comments" rows={4}
                  className={`${inputCls} w-80`}
                  value={comments} onChange={e => setComments(e.target.value)} />
              </td>
            </tr>

            <tr>
              <td className="h-10">&nbsp;</td>
              <td>
                <input type="submit" value={loading ? "Sending…" : "Send LOA"}
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
