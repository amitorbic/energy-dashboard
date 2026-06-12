import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn, isAdmin } from "../../utils/auth";
import api from "../../utils/api";

/**
 * Mirrors change_com_name.php — admin-only form to update company_name
 * in contract_renewal WHERE premise_id = esiid.
 *
 * PHP Cname_update::cname_update():
 *   SELECT company_name FROM contract_renewal WHERE premise_id = :esiid
 *   UPDATE contract_renewal SET company_name = :cname WHERE premise_id = :esiid
 *   Returns "Updated Succesfully" (PHP typo preserved in API response)
 *
 * Validation mirrors PHP validateForm():
 *   - ESIID must be filled
 *   - Company Name must be filled
 */
export default function ChangeCompanyPage() {
  const router = useRouter();
  const [cname, setCname] = useState("");
  const [esiid, setEsiid] = useState("");
  const [msg,   setMsg]   = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    if (!isAdmin())    { router.replace("/home"); return; }
  }, []);

  function validateForm(): boolean {
    if (!esiid.trim()) {
      alert("ESIID must be filled");
      return false;
    }
    if (!cname.trim()) {
      alert("Company Name must be filled");
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateForm()) return;

    setMsg("");
    setError("");
    setLoading(true);
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        "/renewals/change-company-name",
        { esiid, cname },
      );
      if (res.data.success) {
        setMsg(res.data.message);
      } else {
        setError(res.data.message || "Update failed.");
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <section className="mb-2">
        <h2 className="text-xl font-bold text-gray-800">Change Company Name</h2>

        {/* Success message — mirrors PHP <div id="msg"> */}
        {msg && (
          <div
            id="msg"
            className="text-center text-sm mt-2"
            style={{
              fontFamily: "'Roboto', sans-serif",
              fontWeight: 400,
              fontSize: 14,
              color: "#388300",
              background: "#f5f7f9",
              margin: 0,
            }}
          >
            {msg}
          </div>
        )}
      </section>

      {error && (
        <p className="text-red-600 text-sm mb-3">{error}</p>
      )}

      {/* Required fields note */}
      <p className="text-[#CC0000] text-sm mb-2">* Required Fields</p>

      {/* Form — mirrors change_com_name.php form[name=myForm] */}
      <form
        name="myForm"
        onSubmit={handleSubmit}
        encType="multipart/form-data"
      >
        <table>
          <tbody>
            {/* Company Name */}
            <tr id="final">
              <td className="pr-3 py-1">
                <label>
                  <span className="text-[#CC0000]">*</span>&nbsp;Company Name :
                </label>
              </td>
              <td className="py-1">
                <input
                  type="text"
                  name="cname"
                  id="cname"
                  value={cname}
                  onChange={(e) => setCname(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-64"
                />
              </td>
            </tr>

            {/* ESIID */}
            <tr id="final">
              <td className="pr-3 py-1 h-14">
                <label>
                  <span className="text-[#CC0000]">*</span>&nbsp;ESIID :
                </label>
              </td>
              <td className="py-1">
                <input
                  type="text"
                  name="esiid"
                  id="esiid"
                  value={esiid}
                  onChange={(e) => setEsiid(e.target.value)}
                  className="border border-gray-300 rounded px-2 py-1 text-sm w-64"
                />
              </td>
            </tr>

            {/* Submit */}
            <tr id="final">
              <td className="h-20">&nbsp;</td>
              <td>
                <input
                  name="submit"
                  type="submit"
                  value={loading ? "Submitting…" : "Submit"}
                  disabled={loading}
                  className="border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-sm px-4 py-1 cursor-pointer"
                  style={{ width: 70 }}
                />
              </td>
            </tr>
          </tbody>
        </table>
        <br />
      </form>
    </Layout>
  );
}
