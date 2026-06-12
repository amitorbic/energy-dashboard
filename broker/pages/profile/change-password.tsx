import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn } from "../../utils/auth";
import api from "../../utils/api";

/**
 * Mirrors change_password.php.
 *
 * PHP behaviour replicated:
 *   - old_pass field pre-filled with plaintext from md5_decode column
 *   - Validates old password against MD5 hash in DB
 *   - Updates password (MD5) AND md5_decode (plaintext) — PHP pattern
 *   - new_pass === confirm_new_pass checked server-side
 */
export default function ChangePasswordPage() {
  const router = useRouter();

  const [oldPass,  setOldPass]  = useState("");
  const [newPass,  setNewPass]  = useState("");
  const [confPass, setConfPass] = useState("");
  const [msg,      setMsg]      = useState("");
  const [error,    setError]    = useState("");
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }

    // Pre-fill old password with plaintext from md5_decode (mirrors PHP)
    api.get<{ old_password: string }>("/profile/old-password")
      .then(res => setOldPass(res.data.old_password || ""))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPass !== confPass) {
      setError("New passwords do not match");
      return;
    }
    setLoading(true); setMsg(""); setError("");
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        "/profile/change-password",
        { old_pass: oldPass, new_pass: newPass, confirm_pass: confPass },
      );
      if (res.data.success) setMsg(res.data.message);
      else setError(res.data.message);
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
        <h2 className="text-xl font-bold text-gray-800">Change Password</h2>
      </section>

      {msg   && <p className="text-green-700 text-sm font-medium mb-3">{msg}</p>}
      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form name="myForm" onSubmit={handleSubmit}>
        <table>
          <tbody>
            {/* username (email) — read-only, mirrors PHP */}
            <tr>
              <td className="pr-4 py-1 w-40 text-sm">User Name :</td>
              <td className="py-1">
                <input type="text" name="username" readOnly
                  className="border border-gray-200 bg-gray-50 rounded px-2 py-1 text-sm w-64 cursor-not-allowed"
                  value="" />
              </td>
            </tr>

            {/* old_pass — pre-filled from md5_decode (mirrors PHP change_password.php) */}
            <tr>
              <td className="pr-4 py-1 text-sm">Old Password :</td>
              <td className="py-1">
                <input type="text" name="old_pass" className={inp}
                  value={oldPass} onChange={e => setOldPass(e.target.value)} />
              </td>
            </tr>

            <tr>
              <td className="pr-4 py-1 text-sm">New Password :</td>
              <td className="py-1">
                <input type="password" name="new_pass" className={inp}
                  value={newPass} onChange={e => setNewPass(e.target.value)} />
              </td>
            </tr>

            <tr>
              <td className="pr-4 py-1 text-sm">Confirm Password :</td>
              <td className="py-1">
                <input type="password" name="confirm_new_pass" className={inp}
                  value={confPass} onChange={e => setConfPass(e.target.value)} />
              </td>
            </tr>

            <tr>
              <td className="h-10">&nbsp;</td>
              <td>
                <input type="submit" value={loading ? "Updating…" : "Update"}
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
