import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn } from "../../utils/auth";
import api from "../../utils/api";

interface Profile {
  uid:       number;
  name:      string;
  email:     string;
  broker_id: string;
  role:      string;
}

/**
 * Mirrors view_profile.php.
 * SELECT * from contract_user WHERE uid = :user_id
 * Displays name and email as read-only fields.
 * "User Name" label = email field (mirrors PHP display).
 */
export default function ProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    api.get<Profile>("/profile/me")
      .then(res => setProfile(res.data))
      .finally(() => setLoading(false));
  }, []);

  const inp = "border border-gray-200 bg-gray-50 rounded px-2 py-1 text-sm w-64 cursor-not-allowed";

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">View Profile</h2>
      </section>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : profile ? (
        <table>
          <tbody>
            {/* name — mirrors PHP $row['name'] */}
            <tr>
              <td className="pr-4 py-1 w-40 text-sm">Name :</td>
              <td className="py-1">
                <input readOnly className={inp} value={profile.name} />
              </td>
            </tr>
            {/* email shown as "User Name" — mirrors PHP display */}
            <tr>
              <td className="pr-4 py-1 text-sm">User Name :</td>
              <td className="py-1">
                <input readOnly className={inp} value={profile.email} />
              </td>
            </tr>
            {/* email again as "Email ID" — mirrors PHP */}
            <tr>
              <td className="pr-4 py-1 text-sm">Email ID :</td>
              <td className="py-1">
                <input readOnly className={inp} value={profile.email} />
              </td>
            </tr>
            <tr>
              <td className="pr-4 py-1 text-sm">Broker ID :</td>
              <td className="py-1">
                <input readOnly className={inp} value={profile.broker_id} />
              </td>
            </tr>
            <tr>
              <td className="pr-4 py-1 text-sm">Role :</td>
              <td className="py-1">
                <input readOnly className={inp}
                  value={profile.role === "1" ? "Admin" : "User"} />
              </td>
            </tr>
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-red-500">Profile not found.</p>
      )}
    </Layout>
  );
}
