import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { CheckCircle } from "lucide-react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { isLoggedIn, getUser } from "../../utils/auth";

export default function AddLocationPage() {
  const router = useRouter();
  const [esid, setEsid] = useState("");
  const [address, setAddress] = useState("");
  const [unit, setUnit] = useState("");
  const [city, setCity] = useState("");
  const [zip, setZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/login");
  }, [router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const user = getUser();
    try {
      await api.post("/meters/esiid", {
        uid: user?.user_id,
        esid,
        service_address: address,
        unit_number: unit,
        city,
        zip,
      });
      setSubmitted(true);
    } catch {
      setError("Failed to add location. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (submitted) {
    return (
      <Layout title="Location Added">
        <div className="max-w-lg mx-auto text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-5">
            <CheckCircle className="h-8 w-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Location Added</h2>
          <p className="text-gray-500 mb-8">
            The new ESI ID has been added to your account.
          </p>
          <button
            onClick={() => router.push("/meters/add")}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
          >
            Back to Add Meters
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout title="Add New Location">
      <div className="max-w-xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-1">Add New Location</h2>
        <p className="text-gray-500 text-sm mb-6">
          Enter the ESI ID and service address for the new meter location.
        </p>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                ESI ID <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={esid}
                onChange={(e) => setEsid(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm font-mono focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Enter ESI ID"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Service Address <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Street address"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Unit Number
              </label>
              <input
                type="text"
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                placeholder="Apt / Unit (optional)"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  City <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="City"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ZIP Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  placeholder="ZIP"
                />
              </div>
            </div>

            <div className="flex justify-between items-center pt-2">
              <button
                type="button"
                onClick={() => router.back()}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                ← Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors"
              >
                {loading ? "Adding..." : "Add Location"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </Layout>
  );
}
