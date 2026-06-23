"use client";
import { useState } from "react";
import ContractLayout from "../../components/ContractLayout";
import { useRouter } from "next/router";
import api from "../../utils/api";

interface Customer {
  id: number;
  company_name: string;
  broker_code: string;
  num_esids: number;
  pricing_start_date: string;
  contract_start_date: string;
  status: number;
}

export default function CustomPricingConfirmation() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [prefilling, setPrefilling] = useState<number | null>(null);

  const searchCustomers = async (q: string) => {
    if (q.length < 2) {
      setCustomers([]);
      return;
    }
    setLoading(true);
    try {
      const r = await api.get(`/customers?search=${encodeURIComponent(q)}`);
      setCustomers(r.data);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = async (cid: number) => {
    setPrefilling(cid);
    try {
      const r = await api.get(`/contracts/prefill-custom/${cid}`);
      const data = r.data;

      // Build query params to pass to send page
      const params = new URLSearchParams({
        customer_name: data.customer_name,
        broker_code: data.broker_code,
        broker_name: data.broker_name,
        send_to_email: data.confirmation_email || "",
        broker_split: data.broker_split || "",
        esid_count: String(data.esid_count || ""),
        esiid: data.esiid || "",
        customer_email: data.customer_email || "",
        mill: data.mill || "",
        start_date: data.start_date || "",
        volumes: JSON.stringify(data.volumes || {}),
        total_volume: String(data.total_volume || ""),
        source: "custom_pricing",
        cid: String(cid),
      });

      router.push(`/contracts/send?${params.toString()}`);
    } catch {
      alert("Failed to load customer data. Try again.");
    } finally {
      setPrefilling(null);
    }
  };

  return (
    <ContractLayout title="Custom Pricing Confirmation">
      <div className="max-w-2xl">
        <p className="text-sm text-gray-500 mb-6">
          Select a customer from custom pricing — their details, profiles and
          volumes will auto-fill the confirmation form.
        </p>

        {/* Search */}
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4">
          <label className="text-sm font-medium text-gray-600 block mb-2">
            Search Customer
          </label>
          <input
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-sky-400"
            placeholder="Type customer name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              searchCustomers(e.target.value);
            }}
          />
        </div>

        {/* Results */}
        {loading && <p className="text-sm text-gray-400 px-2">Searching...</p>}

        {customers.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                {customers.length} customers found
              </p>
            </div>
            {customers.map((c, i) => (
              <div
                key={c.id}
                className={`flex items-center justify-between px-4 py-3 ${i < customers.length - 1 ? "border-b border-gray-100" : ""}`}
              >
                <div>
                  <p className="text-sm font-medium text-gray-800">
                    {c.company_name}
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {c.broker_code}
                    {c.num_esids ? ` · ${c.num_esids} ESIIDs` : ""}
                    {c.pricing_start_date
                      ? ` · Start: ${c.pricing_start_date}`
                      : ""}
                  </p>
                </div>
                <button
                  onClick={() => handleSelect(c.id)}
                  disabled={prefilling === c.id}
                  className="px-4 py-1.5 text-xs bg-sky-600 text-white rounded hover:bg-sky-700 disabled:opacity-50 ml-4 flex-shrink-0"
                >
                  {prefilling === c.id ? "Loading..." : "Select →"}
                </button>
              </div>
            ))}
          </div>
        )}

        {search.length >= 2 && !loading && customers.length === 0 && (
          <p className="text-sm text-gray-400 px-2">
            No customers found for &quot;{search}&quot;
          </p>
        )}
      </div>
    </ContractLayout>
  );
}
