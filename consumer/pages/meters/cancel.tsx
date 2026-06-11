import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { ArrowRight } from "lucide-react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { isLoggedIn } from "../../utils/auth";

interface Meter {
  sr: number;
  esid: string;
  service_address: string;
  unit_number: string;
  city: string;
  zip: string;
  status: string;
  status_code: number;
}

const STATUS_COLORS: Record<string, string> = {
  "Pending": "bg-yellow-100 text-yellow-800",
  "Add Requested": "bg-green-100 text-green-800",
  "Cancel Requested": "bg-red-100 text-red-800",
  "Failed": "bg-red-100 text-red-800",
};

export default function CancelMetersPage() {
  const router = useRouter();
  const [meters, setMeters] = useState<Meter[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    api.get("/meters")
      .then((res) => setMeters(res.data))
      .catch(() => setError("Failed to load meters"))
      .finally(() => setLoading(false));
  }, [router]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? meters.map((m) => m.sr) : []);
  }

  function toggle(sr: number) {
    setSelected((prev) =>
      prev.includes(sr) ? prev.filter((x) => x !== sr) : [...prev, sr]
    );
  }

  function handleSubmit() {
    if (selected.length === 0) {
      setError("Please select at least one meter.");
      return;
    }
    const selectedMeters = meters.filter((m) => selected.includes(m.sr));
    localStorage.setItem(
      "pendingRequest",
      JSON.stringify({ action: "cancel", meters: selectedMeters })
    );
    router.push("/meters/confirm");
  }

  return (
    <Layout title="Cancel Meters">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Cancel Meters</h2>
            <p className="text-gray-500 text-sm mt-1">
              Select the meters you want to cancel from service
            </p>
          </div>
          <button
            onClick={handleSubmit}
            disabled={selected.length === 0}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 disabled:bg-red-300
                       text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
            Loading meters...
          </div>
        ) : meters.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <p className="text-gray-500">No meters found for your account.</p>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="p-4 w-12">
                    <input
                      type="checkbox"
                      checked={selected.length === meters.length}
                      onChange={(e) => toggleAll(e.target.checked)}
                      className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                    />
                  </th>
                  <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ESI ID</th>
                  <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Service Address</th>
                  <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit</th>
                  <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">City</th>
                  <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">ZIP</th>
                  <th className="p-4 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {meters.map((m) => (
                  <tr
                    key={m.sr}
                    onClick={() => toggle(m.sr)}
                    className={`cursor-pointer transition-colors ${
                      selected.includes(m.sr)
                        ? "bg-red-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="p-4">
                      <input
                        type="checkbox"
                        checked={selected.includes(m.sr)}
                        onChange={() => toggle(m.sr)}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                      />
                    </td>
                    <td className="p-4 font-mono text-gray-900 font-medium">{m.esid}</td>
                    <td className="p-4 text-gray-700">{m.service_address}</td>
                    <td className="p-4 text-gray-500">{m.unit_number || "—"}</td>
                    <td className="p-4 text-gray-700">{m.city}</td>
                    <td className="p-4 text-gray-500">{m.zip}</td>
                    <td className="p-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[m.status] || "bg-gray-100 text-gray-700"}`}>
                        {m.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {selected.length > 0 && (
              <div className="px-4 py-3 bg-red-50 border-t border-red-100 text-red-700 text-sm">
                {selected.length} meter{selected.length > 1 ? "s" : ""} selected for cancellation
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex justify-between items-center">
          <button
            onClick={() => router.push("/dashboard")}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Back to Dashboard
          </button>
          {selected.length > 0 && (
            <button
              onClick={handleSubmit}
              className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              Cancel {selected.length} meter{selected.length > 1 ? "s" : ""}
              <ArrowRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </Layout>
  );
}
