import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { UserPlus, Pencil, Power } from "lucide-react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { isLoggedIn, isAdmin } from "../../utils/auth";

interface User {
  uid: number;
  name: string;
  email: string;
  role: number;
  status: number;
  meter_count: number;
}

interface ModalState {
  mode: "create" | "edit";
  uid?: number;
  name: string;
  email: string;
  password: string;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    if (!isLoggedIn() || !isAdmin()) { router.replace("/login"); return; }
    loadUsers();
  }, [router]);

  async function loadUsers() {
    setLoading(true);
    try {
      const res = await api.get("/admin/users");
      setUsers(res.data);
    } catch {
      setError("Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!modal) return;
    setFormError("");
    if (!modal.name.trim() || !modal.email.trim()) {
      setFormError("Name and email are required");
      return;
    }
    if (modal.mode === "create" && !modal.password.trim()) {
      setFormError("Password is required");
      return;
    }
    setSaving(true);
    try {
      if (modal.mode === "create") {
        await api.post("/admin/users", {
          name: modal.name,
          email: modal.email,
          password: modal.password,
        });
      } else {
        await api.put(`/admin/users/${modal.uid}`, {
          name: modal.name,
          email: modal.email,
          password: modal.password || undefined,
        });
      }
      setModal(null);
      loadUsers();
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setFormError(msg || "Failed to save user");
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(uid: number) {
    try {
      await api.patch(`/admin/users/${uid}/status`);
      loadUsers();
    } catch {
      setError("Failed to update status");
    }
  }

  return (
    <Layout title="User Management">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Users</h2>
            <p className="text-gray-500 text-sm mt-1">
              Manage customer accounts and their access
            </p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => router.push("/admin")}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              ← Admin
            </button>
            <button
              onClick={() =>
                setModal({ mode: "create", name: "", email: "", password: "" })
              }
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              <UserPlus className="h-4 w-4" />
              New User
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            Loading users...
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase">Username</th>
                  <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
                  <th className="p-4 text-center text-xs font-semibold text-gray-500 uppercase">Role</th>
                  <th className="p-4 text-center text-xs font-semibold text-gray-500 uppercase">Meters</th>
                  <th className="p-4 text-center text-xs font-semibold text-gray-500 uppercase">Status</th>
                  <th className="p-4 text-center text-xs font-semibold text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.uid} className="hover:bg-gray-50">
                    <td className="p-4 font-medium text-gray-900">{u.name}</td>
                    <td className="p-4 text-gray-600">{u.email}</td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.role === 1 ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"}`}>
                        {u.role === 1 ? "Admin" : "Customer"}
                      </span>
                    </td>
                    <td className="p-4 text-center text-gray-600">{u.meter_count}</td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${u.status === 1 ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {u.status === 1 ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() =>
                            setModal({
                              mode: "edit",
                              uid: u.uid,
                              name: u.name,
                              email: u.email,
                              password: "",
                            })
                          }
                          className="p-1.5 rounded-md text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                          title="Edit"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => toggleStatus(u.uid)}
                          className={`p-1.5 rounded-md transition-colors ${u.status === 1 ? "text-gray-400 hover:text-red-600 hover:bg-red-50" : "text-gray-400 hover:text-green-600 hover:bg-green-50"}`}
                          title={u.status === 1 ? "Deactivate" : "Activate"}
                        >
                          <Power className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-bold text-gray-900 text-lg mb-5">
              {modal.mode === "create" ? "Create New User" : "Edit User"}
            </h3>

            {formError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
                {formError}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
                <input
                  type="text"
                  value={modal.name}
                  onChange={(e) => setModal({ ...modal, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                <input
                  type="email"
                  value={modal.email}
                  onChange={(e) => setModal({ ...modal, email: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Password{modal.mode === "edit" && <span className="text-gray-400 font-normal"> (leave blank to keep current)</span>}
                </label>
                <input
                  type="password"
                  value={modal.password}
                  onChange={(e) => setModal({ ...modal, password: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder={modal.mode === "edit" ? "Leave blank to keep current" : "Set password"}
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => { setModal(null); setFormError(""); }}
                className="px-4 py-2 rounded-lg text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 transition-colors"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
