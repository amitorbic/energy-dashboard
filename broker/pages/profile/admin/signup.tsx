import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../../components/Layout";
import { isLoggedIn, isAdmin } from "../../../utils/auth";
import api from "../../../utils/api";

/**
 * Mirrors signup.php — admin only.
 *
 * PHP SQL:
 *   SELECT * FROM contract_user WHERE broker_id LIKE :brokerid OR email LIKE :email
 *   INSERT INTO contract_user (email, name, password, md5_decode, broker_id, role)
 *   VALUES (:email, :name, md5(:pass), :pass, :brokerid, '2')
 *
 * role hardcoded '2' (non-admin broker).
 */
export default function AdminSignupPage() {
  const router = useRouter();

  const [name,     setName]     = useState("");
  const [brokerid, setBrokerid] = useState("");
  const [email,    setEmail]    = useState("");
  const [pass,     setPass]     = useState("");
  const [msg,      setMsg]      = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    if (!isAdmin())    { router.replace("/home"); return; }
  }, []);

  function validate(): boolean {
    if (!name.trim())     { alert("Name is required"); return false; }
    if (!brokerid.trim()) { alert("Broker ID is required"); return false; }
    if (!email.trim())    { alert("Email is required"); return false; }
    if (!pass.trim())     { alert("Password is required"); return false; }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setMsg(""); setError("");
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        "/profile/admin/users/create",
        { name, brokerid, email, password: pass },
      );
      if (res.data.success) {
        setMsg(res.data.message);
        setName(""); setBrokerid(""); setEmail(""); setPass("");
      } else {
        setError(res.data.message);
      }
    } catch {
      setError("An error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inp = "border border-gray-300 rounded px-2 py-1 text-sm w-64";

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Sign Up New User</h2>
        <p className="text-[#CC0000] text-sm mt-1">* Required Fields</p>
      </section>

      {msg   && <p className="text-green-700 text-sm font-medium mb-3">{msg}</p>}
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form name="myForm" onSubmit={handleSubmit}>
        <table>
          <tbody>
            {[
              ["* User Name",  name,     setName,     "name",     "text"],
              ["* Broker ID",  brokerid, setBrokerid, "brokerid", "text"],
              ["* Email",      email,    setEmail,    "user_name","email"],
              ["* Password",   pass,     setPass,     "pass",     "password"],
            ].map(([label, val, setter, fieldName, type]) => (
              <tr key={fieldName as string}>
                <td className="pr-4 py-1 w-40 text-sm">{label as string} :</td>
                <td className="py-1">
                  <input type={type as string} name={fieldName as string}
                    className={inp} value={val as string}
                    onChange={e => (setter as (v: string) => void)(e.target.value)} />
                </td>
              </tr>
            ))}

            <tr>
              <td className="h-10">&nbsp;</td>
              <td>
                <input type="submit" name="Submit"
                  value={loading ? "Creating…" : "Submit"}
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
