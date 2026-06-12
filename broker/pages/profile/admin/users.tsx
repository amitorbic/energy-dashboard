import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../../components/Layout";
import { isLoggedIn, isAdmin } from "../../../utils/auth";
import api from "../../../utils/api";

interface BrokerUser {
  uid:         number;
  name:        string;
  email:       string;
  password:    string;
  broker_id:   string;
  role:        string;
  pwd_changed: boolean;
  comm_link:   string;
}

/**
 * Mirrors user.php — admin only.
 *
 * PHP SQL:
 *   SELECT * FROM contract_user
 *   + SELECT c.comm_file_link FROM comm_vendors c LEFT JOIN broker_new b ON ... per row
 *
 * Password status: compares md5_decode vs old_password.
 * Inline edit replaces PHP modal popup (edit_user.php?broker_id=X).
 * mirrors edit_user.php:
 *   SELECT * FROM contract_user WHERE broker_id = :broker_id
 *   UPDATE contract_user SET name, email, password=md5(pass), md5_decode=pass WHERE broker_id=:target
 */
export default function AdminUsersPage() {
  const router = useRouter();

  const [users,     setUsers]     = useState<BrokerUser[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editId,    setEditId]    = useState<string | null>(null);
  const [editName,  setEditName]  = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPass,  setEditPass]  = useState("");
  const [msg,       setMsg]       = useState("");
  const [error,     setError]     = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    if (!isAdmin())    { router.replace("/home"); return; }
    loadUsers();
  }, []);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await api.get<BrokerUser[]>("/profile/admin/users");
      setUsers(res.data);
    } finally {
      setLoading(false);
    }
  }

  function startEdit(u: BrokerUser) {
    setEditId(u.broker_id);
    setEditName(u.name);
    setEditEmail(u.email);
    setEditPass(u.password);
    setMsg(""); setError("");
  }

  function cancelEdit() { setEditId(null); }

  async function saveEdit(broker_id: string) {
    if (!editName.trim() || !editEmail.trim() || !editPass.trim()) {
      setError("All fields required"); return;
    }
    setError(""); setMsg("");
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        "/profile/admin/users/update",
        { target_broker_id: broker_id, name: editName, email: editEmail, password: editPass },
      );
      if (res.data.success) {
        setMsg(res.data.message);
        setEditId(null);
        await loadUsers();
      } else {
        setError(res.data.message);
      }
    } catch {
      setError("Update failed.");
    }
  }

  const COMMISSION_BASE = process.env.NEXT_PUBLIC_COMMISSION_BASE_URL || "http://ameripowerpricing.com/";
  const inp = "border border-gray-300 rounded px-1 py-0.5 text-xs w-40";

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Edit Users</h2>
      </section>

      {msg   && <p className="text-green-700 text-sm font-medium mb-2">{msg}</p>}
      {error && <p className="text-red-600 text-sm mb-2">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                {["#", "Name", "Email", "Password", "Broker ID", "Role",
                  "Pwd Changed", "Commission", "Action"].map(h => (
                  <th key={h}
                    className="border border-gray-300 px-2 py-1.5 bg-gray-100 text-left font-semibold whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                editId === u.broker_id ? (
                  /* Inline edit row — mirrors edit_user.php modal */
                  <tr key={u.uid} className="bg-yellow-50">
                    <td className="border border-gray-300 px-2 py-1">{i + 1}</td>
                    <td className="border border-gray-300 px-2 py-1">
                      <input className={inp} value={editName}
                        onChange={e => setEditName(e.target.value)} />
                    </td>
                    <td className="border border-gray-300 px-2 py-1">
                      <input className={inp} value={editEmail}
                        onChange={e => setEditEmail(e.target.value)} />
                    </td>
                    <td className="border border-gray-300 px-2 py-1">
                      <input className={inp} value={editPass}
                        onChange={e => setEditPass(e.target.value)} />
                    </td>
                    <td className="border border-gray-300 px-2 py-1 text-gray-400">
                      {u.broker_id}
                    </td>
                    <td className="border border-gray-300 px-2 py-1">
                      {u.role === "1" ? "Admin" : "User"}
                    </td>
                    <td className="border border-gray-300 px-2 py-1" colSpan={2} />
                    <td className="border border-gray-300 px-2 py-1 whitespace-nowrap">
                      <button onClick={() => saveEdit(u.broker_id)}
                        className="text-blue-600 hover:underline mr-2">Save</button>
                      <button onClick={cancelEdit}
                        className="text-gray-500 hover:underline">Cancel</button>
                    </td>
                  </tr>
                ) : (
                  /* Normal display row */
                  <tr key={u.uid} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                    <td className="border border-gray-300 px-2 py-1.5">{i + 1}</td>
                    <td className="border border-gray-300 px-2 py-1.5">{u.name}</td>
                    <td className="border border-gray-300 px-2 py-1.5">{u.email}</td>
                    <td className="border border-gray-300 px-2 py-1.5">{u.password}</td>
                    <td className="border border-gray-300 px-2 py-1.5">{u.broker_id}</td>
                    <td className="border border-gray-300 px-2 py-1.5">
                      {u.role === "1" ? "Admin" : "User"}
                    </td>
                    {/* Password changed status — mirrors user.php md5_decode vs old_password */}
                    <td className="border border-gray-300 px-2 py-1.5 text-center">
                      <span className={u.pwd_changed ? "text-green-600" : "text-red-500"}>
                        {u.pwd_changed ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5">
                      {u.comm_link ? (
                        <a
                          href={COMMISSION_BASE.replace(/\/$/, "") + "/" + u.comm_link.replace(/^\//, "")}
                          target="_blank" rel="noopener noreferrer"
                          className="text-blue-600 hover:underline"
                        >
                          View
                        </a>
                      ) : "—"}
                    </td>
                    <td className="border border-gray-300 px-2 py-1.5">
                      <button onClick={() => startEdit(u)}
                        className="text-blue-600 hover:underline">
                        Edit
                      </button>
                    </td>
                  </tr>
                )
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}