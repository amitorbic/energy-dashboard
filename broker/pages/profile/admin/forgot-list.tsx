import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../../components/Layout";
import { isLoggedIn, isAdmin } from "../../../utils/auth";
import api from "../../../utils/api";

interface ForgotRow {
  sid:      number;
  email_id: string;
  name:     string;
  time:     string;
  clearity: number;
}

/**
 * Mirrors forget_password_list.php — admin only.
 *
 * PHP SQL:
 *   SELECT * from forget_pasword   (note: PHP typo in table name, preserved)
 *
 * Row colors mirror PHP (clearity field):
 *   0 = white (pending)
 *   1 = #b0f081 (green)
 *   2 = #ff6    (yellow)
 *   3 = #ffb5b5 (red)
 *
 * AJAX action (envelope icon → forget_pas_mail.php?fname=sid) is omitted
 * as it requires separate email sending logic outside scope.
 */
export default function AdminForgotListPage() {
  const router = useRouter();
  const [rows,    setRows]    = useState<ForgotRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    if (!isAdmin())    { router.replace("/home"); return; }
    api.get<ForgotRow[]>("/profile/admin/forgot-list")
      .then(res => setRows(res.data))
      .finally(() => setLoading(false));
  }, []);

  // Row background colors — mirrors PHP clearity values
  function rowBg(clearity: number): string {
    switch (clearity) {
      case 1: return "#b0f081";
      case 2: return "#ffff66";
      case 3: return "#ffb5b5";
      default: return "#ffffff";
    }
  }

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Forgot Password List</h2>
      </section>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No password reset requests.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                {["Sr#", "Email", "Username", "Date", "Status"].map(h => (
                  <th key={h}
                    className="border border-gray-300 px-3 py-2 bg-gray-100 text-left text-xs font-semibold">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr key={row.sid} style={{ backgroundColor: rowBg(row.clearity) }}>
                  <td className="border border-gray-300 px-3 py-1.5">{i + 1}</td>
                  <td className="border border-gray-300 px-3 py-1.5">{row.email_id}</td>
                  <td className="border border-gray-300 px-3 py-1.5">{row.name}</td>
                  <td className="border border-gray-300 px-3 py-1.5">{row.time}</td>
                  <td className="border border-gray-300 px-3 py-1.5 text-center">
                    {row.clearity === 0 && <span className="text-gray-500">Pending</span>}
                    {row.clearity === 1 && <span className="text-green-800 font-medium">Sent</span>}
                    {row.clearity === 2 && <span className="text-yellow-700 font-medium">In Progress</span>}
                    {row.clearity === 3 && <span className="text-red-700 font-medium">Failed</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}