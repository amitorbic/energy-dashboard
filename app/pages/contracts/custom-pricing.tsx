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
        <p className="text-sm mb-6" style={{ color: "var(--ct-text-muted)" }}>
          Select a customer from custom pricing — their details, profiles and
          volumes will auto-fill the confirmation form.
        </p>

        {/* Search */}
        <div className="rounded-[var(--r-lg)] border p-5 mb-4" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
          <label className="text-sm font-medium block mb-2" style={{ color: "var(--ct-text-secondary)" }}>
            Search Customer
          </label>
          <input
            className="w-full rounded-[var(--r-sm)] px-3 py-1.5 text-sm border focus:outline-none focus:border-[var(--accent-light)]"
            style={{ background: "var(--ct-surface)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            placeholder="Type customer name..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              searchCustomers(e.target.value);
            }}
          />
        </div>

        {/* Results */}
        {loading && <p className="text-sm px-2" style={{ color: "var(--ct-text-muted)" }}>Searching...</p>}

        {customers.length > 0 && (
          <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
            <div className="px-4 py-2.5 border-b" style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--ct-text-muted)" }}>
                {customers.length} customers found
              </p>
            </div>
            {customers.map((c, i) => (
              <div
                key={c.id}
                className="flex items-center justify-between px-4 py-3"
                style={i < customers.length - 1 ? { borderBottom: "1px solid var(--ct-border-subtle)" } : undefined}
              >
                <div>
                  <p className="text-sm font-medium" style={{ color: "var(--ct-text-primary)" }}>
                    {c.company_name}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: "var(--ct-text-muted)" }}>
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
                  className="px-4 py-1.5 text-xs rounded-[var(--r-sm)] disabled:opacity-50 ml-4 flex-shrink-0 transition-colors"
                  style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                >
                  {prefilling === c.id ? "Loading..." : "Select →"}
                </button>
              </div>
            ))}
          </div>
        )}

        {search.length >= 2 && !loading && customers.length === 0 && (
          <p className="text-sm px-2" style={{ color: "var(--ct-text-muted)" }}>
            No customers found for &quot;{search}&quot;
          </p>
        )}
      </div>
    </ContractLayout>
  );
}
