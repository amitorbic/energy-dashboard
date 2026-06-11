import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { CheckCircle } from "lucide-react";
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
}

interface PendingRequest {
  action: "add" | "cancel";
  meters: Meter[];
}

export default function ConfirmPage() {
  const router = useRouter();
  const [pending, setPending] = useState<PendingRequest | null>(null);
  const [timing, setTiming] = useState<"same_day" | "first_available" | "custom">("first_available");
  const [customDate, setCustomDate] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [comments, setComments] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/login"); return; }
    const raw = localStorage.getItem("pendingRequest");
    if (!raw) { router.replace("/dashboard"); return; }
    setPending(JSON.parse(raw));
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!pending) return;
    setError("");
    setLoading(true);
    try {
      await api.post("/meters/request", {
        srs: pending.meters.map((m) => m.sr),
        action: pending.action,
        timing,
        custom_date: timing === "custom" ? customDate : undefined,
        contact_name: contactName,
        contact_phone: contactPhone,
        contact_email: contactEmail,
        comments,
      });
      localStorage.removeItem("pendingRequest");
      setSubmitted(true);
    } catch {
      setError("Failed to submit request. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <Layout title="Request Submitted">
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-5">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            Request Submitted
          </h2>
          <p className="text-gray-500 mb-8">
            Your meter {pending?.action === "add" ? "enrollment" : "cancellation"} request
            has been submitted successfully.
          </p>
          <button
            onClick={() => router.push("/dashboard")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </Layout>
    );
  }

  if (!pending) return null;

  const isCancel = pending.action === "cancel";
  const accentClass = isCancel
    ? "bg-red-600 hover:bg-red-700 disabled:bg-red-300"
    : "bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300";

  return (
    <Layout title="Confirm Request">
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">
          Confirm {isCancel ? "Cancellation" : "Enrollment"} Request
        </h2>
        <p className="text-gray-500 text-sm mb-6">
          Review the selected meters and provide your contact details.
        </p>

        {/* Selected meters */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 rounded-t-xl">
            <h3 className="font-semibold text-gray-700 text-sm">
              Selected Meters ({pending.meters.length})
            </h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100">
                <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase">ESI ID</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase">Address</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase">City</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-500 uppercase">ZIP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pending.meters.map((m) => (
                <tr key={m.sr}>
                  <td className="p-3 font-mono text-gray-900">{m.esid}</td>
                  <td className="p-3 text-gray-700">
                    {m.service_address}{m.unit_number ? `, Unit ${m.unit_number}` : ""}
                  </td>
                  <td className="p-3 text-gray-600">{m.city}</td>
                  <td className="p-3 text-gray-600">{m.zip}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 space-y-5">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
              {error}
            </div>
          )}

          {/* Timing */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Requested Effective Date
            </label>
            <div className="space-y-2">
              {[
                { value: "same_day", label: "Same Business Day (charges may apply)" },
                { value: "first_available", label: isCancel ? "First Available — 3 Business Days" : "First Available — 2 Business Days" },
                { value: "custom", label: "Select a specific date" },
              ].map((opt) => (
                <label key={opt.value} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="radio"
                    name="timing"
                    value={opt.value}
                    checked={timing === opt.value}
                    onChange={() => setTiming(opt.value as typeof timing)}
                    className="text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">{opt.label}</span>
                </label>
              ))}
            </div>
            {timing === "custom" && (
              <input
                type="date"
                value={customDate}
                onChange={(e) => setCustomDate(e.target.value)}
                required
                min={new Date().toISOString().split("T")[0]}
                className="mt-3 border border-gray-300 rounded-lg px-4 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              />
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Contact Phone <span className="text-red-500">*</span>
              </label>
              <input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="(555) 000-0000"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Confirmation Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)}
              required
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
              placeholder="your@email.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Comments
            </label>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-none"
              placeholder="Any additional notes..."
            />
          </div>

          <p className="text-xs text-gray-400 border-t border-gray-100 pt-4">
            By submitting this request, you authorize the processing of the meter
            {isCancel ? " cancellation" : " enrollment"} listed above. This request will be
            processed subject to applicable terms and conditions.
          </p>

          <div className="flex justify-between items-center pt-1">
            <button
              type="button"
              onClick={() => router.back()}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              ← Go Back
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex items-center gap-2 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors ${accentClass}`}
            >
              {loading ? "Submitting..." : `Submit ${isCancel ? "Cancellation" : "Enrollment"} Request`}
            </button>
          </div>
        </form>
      </div>
    </Layout>
  );
}
