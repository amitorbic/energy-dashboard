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
    <BillingLayout title="Billing Audit">
      <div className="max-w-2xl">
        <h2 className="text-base font-semibold mb-6" style={{ color: "var(--ct-text-primary)" }}>
          Email Recipients
        </h2>

        {/* add form */}
        <div className="rounded-[var(--r-lg)] border p-4 mb-6" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <p className="text-sm font-medium mb-3" style={{ color: "var(--ct-text-secondary)" }}>
            Add recipient
          </p>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="flex-1 text-sm rounded-[var(--r-sm)] border px-3 py-2 outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            />
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="flex-1 text-sm rounded-[var(--r-sm)] border px-3 py-2 outline-none focus:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
            />
            <button
              onClick={handleAdd}
              className="px-4 py-2 text-sm rounded-[var(--r-sm)] font-medium transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              Add
            </button>
          </div>
          {msg && (
            <p
              className="text-xs mt-2"
              style={{ color: msg.includes("added") ? "var(--success-light)" : "var(--danger-light)" }}
            >
              {msg}
            </p>
          )}
        </div>

        {/* recipients table */}
        {loading ? (
          <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>Loading...</p>
        ) : recipients.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--ct-text-muted)" }}>No recipients yet.</p>
        ) : (
          <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <table className="w-full text-sm">
              <thead className="border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                    Name
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                    Email
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}>
                    Status
                  </th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium" style={{ color: "var(--ct-text-muted)" }}></th>
                </tr>
              </thead>
              <tbody>
                {recipients.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-[var(--ct-surface-hover)]" style={{ borderColor: "var(--ct-border-subtle)" }}>
                    <td className="px-4 py-2.5" style={{ color: "var(--ct-text-primary)" }}>{r.name}</td>
                    <td className="px-4 py-2.5" style={{ color: "var(--ct-text-secondary)" }}>{r.email}</td>
                    <td className="px-4 py-2.5">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-[var(--r-sm)] text-xs font-medium"
                        style={r.active
                          ? { background: "var(--success-light-tint)", color: "var(--success-light)" }
                          : { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}
                      >
                        {r.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => handleToggle(r.id)}
                          className="text-xs hover:opacity-80"
                          style={{ color: "var(--accent-light)" }}
                        >
                          {r.active ? "Deactivate" : "Activate"}
                        </button>
                        <button
                          onClick={() => handleDelete(r.id)}
                          className="text-xs hover:opacity-80"
                          style={{ color: "var(--danger-light)" }}
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
