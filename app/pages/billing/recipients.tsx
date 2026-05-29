import { useEffect, useState } from "react";
import BillingLayout from "../../components/BillingLayout";
import api from "../../utils/api";

export default function BillingRecipientsPage() {
  const [recipients, setRecipients] = useState<any[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const res = await api.get("/billing/recipients");
    setRecipients(res.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleAdd = async () => {
    if (!name || !email) return;
    try {
      await api.post("/billing/recipients/add", { name, email });
      setName("");
      setEmail("");
      setMsg("Recipient added.");
      load();
    } catch (err: any) {
      setMsg(err?.response?.data?.detail || "Failed to add.");
    }
    setTimeout(() => setMsg(""), 3000);
  };

  const handleToggle = async (id: number) => {
    await api.patch(`/billing/recipients/${id}/toggle`);
    load();
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this recipient?")) return;
    await api.delete(`/billing/recipients/${id}`);
    load();
  };

  return (
    <BillingLayout title="Billing Module">
      <div className="max-w-2xl">
        <h2 className="text-base font-semibold text-gray-800 mb-6">
          Email Recipients
        </h2>

        {/* add form */}
        <div className="bg-white border border-gray-200 rounded-lg p-4 mb-6">
          <p className="text-sm font-medium text-gray-700 mb-3">
            Add recipient
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-400"
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 text-sm border border-gray-200 rounded px-3 py-2 focus:outline-none focus:ring-1 focus:ring-green-400"
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 bg-green-600 text-white text-sm rounded hover:bg-green-700 transition-colors"
            >
              Add
            </button>
          </div>
          {msg && (
            <p
              className={`text-xs mt-2 ${msg.includes("added") ? "text-green-600" : "text-red-500"}`}
            >
              {msg}
            </p>
          )}
        </div>

        {/* recipients table */}
        {loading ? (
          <p className="text-sm text-gray-400">Loading...</p>
        ) : recipients.length === 0 ? (
          <p className="text-sm text-gray-400">No recipients yet.</p>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                    Name
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                    Email
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {recipients.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-800">{r.name}</td>
                    <td className="px-4 py-2.5 text-gray-600">{r.email}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          r.active
                            ? "bg-green-100 text-green-700"
                            : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {r.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggle(r.id)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          {r.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="text-xs text-red-500 hover:text-red-700"
                        >
                          Delete
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
    </BillingLayout>
  );
}
