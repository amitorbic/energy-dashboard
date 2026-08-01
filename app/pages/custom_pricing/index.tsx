import React, { useState, useEffect, useRef } from "react";
import api from "../../utils/api";
import { useRouter } from "next/router";
import PricingLayout from "../../components/PricingLayout";

interface Customer {
  id: number;
  company_name: string;
  esid: string;
  num_esids: number;
  broker_code: string;
  credit_status: string;
  contract_start_date: string;
  pricing_start_date: string;
}

interface RenewalResult {
  serial: number;
  cust_id: string;
  company_name: string;
  premise_id: string;
  broker_code: string;
  broker_name: string;
  contract_end_date: string;
  load_profile: string;
  contract_renewal_usage: string;
  cust_email: string;
  cust_phone1: string;
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  cust_first_name: string;
  cust_last_name: string;
}

const CustomPricingList = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [showRenewalModal, setShowRenewalModal] = useState(false);
  const [renewalSearch, setRenewalSearch] = useState("");
  const [renewalResults, setRenewalResults] = useState<RenewalResult[]>([]);
  const [renewalSearching, setRenewalSearching] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sanitizeDate = (d: string) => (d === "0000-00-00" || !d ? "—" : d);
  const [selectedRenewals, setSelectedRenewals] = useState<RenewalResult[]>([]);
  const router = useRouter();

  useEffect(() => {
    api
      .get("/customers")
      .then((res) => {
        setCustomers(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this customer?")) return;
    await api.delete(`/customers/${id}`);
    setCustomers((prev) => prev.filter((c) => c.id !== id));
  };

  // Flow 2: Upload usage file → pre-fill add form
  const handleUsageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadMsg("");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post("/customers/parse-usage", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      console.log("parse-usage response:", res.data);

      const { esid, num_esids, profiles, existing_customer } = res.data;

      if (existing_customer) {
        const proceed = confirm(
          `⚠️ ESID ${esid} already exists for "${existing_customer.company_name}" (ID: ${existing_customer.id}). Create a new record anyway?`,
        );
        if (!proceed) {
          setUploading(false);
          return;
        }
      }

      // Store parsed data and redirect
      sessionStorage.setItem(
        "prefill_usage",
        JSON.stringify({ esid, num_esids, profiles }),
      );
      router.push("/custom_pricing/add?source=upload");
    } catch (err) {
      console.error(err);
      setUploadMsg("Failed to parse file. Check format.");
    }
    setUploading(false);
  };
  // Add to state declarations

  const handleRenewalToggle = (r: RenewalResult) => {
    setSelectedRenewals((prev) => {
      const exists = prev.find((x) => x.serial === r.serial);
      if (exists) return prev.filter((x) => x.serial !== r.serial);
      return [...prev, r];
    });
  };

  const handleRenewalConfirm = async () => {
    if (selectedRenewals.length === 0) return;

    // Check ESID for first selected
    const firstESID = selectedRenewals[0].premise_id;
    const checkRes = await api.get(`/customers/check-esid?esid=${firstESID}`);

    if (checkRes.data.exists) {
      const proceed = confirm(
        `⚠️ ESID ${firstESID} already exists for "${checkRes.data.customer.company_name}". Create new record anyway?`,
      );
      if (!proceed) return;
    }

    // Combine all selected renewals
    const first = selectedRenewals[0];
    const combinedProfiles: Record<string, number> = {};

    selectedRenewals.forEach((r) => {
      if (r.load_profile && r.contract_renewal_usage) {
        const kwh = parseFloat(r.contract_renewal_usage) || 0;
        combinedProfiles[r.load_profile] =
          (combinedProfiles[r.load_profile] || 0) + kwh;
      }
    });

    sessionStorage.setItem(
      "prefill_renewal",
      JSON.stringify({
        ...first,
        num_esids: selectedRenewals.length,
        esids: selectedRenewals.map((r) => r.premise_id),
        profiles: combinedProfiles,
      }),
    );

    router.push("/custom_pricing/add?source=renewal");
    setShowRenewalModal(false);
  };

  // Flow 3: Search renewal
  const handleRenewalSearch = async () => {
    if (!renewalSearch.trim()) return;
    setRenewalSearching(true);
    try {
      const res = await api.get(`/customers/renewal/search?q=${renewalSearch}`);
      console.log("renewal search response:", res.data);
      setRenewalResults(res.data);
    } catch {
      console.error("Renewal search failed");
    }
    setRenewalSearching(false);
  };

  const handleRenewalSelect = async (r: RenewalResult) => {
    // Check if ESID already exists
    const checkRes = await api.get(
      `/customers/check-esid?esid=${r.premise_id}`,
    );

    if (checkRes.data.exists) {
      const proceed = confirm(
        `⚠️ ESID ${r.premise_id} already exists for "${checkRes.data.customer.company_name}". Create new record anyway?`,
      );
      if (!proceed) return;
    }

    // Store renewal data and redirect to add form
    sessionStorage.setItem("prefill_renewal", JSON.stringify(r));
    router.push("/custom_pricing/add?source=renewal");
    setShowRenewalModal(false);
  };

  const filtered = customers.filter(
    (c) =>
      c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      c.esid?.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <PricingLayout title="Custom Pricing">
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        <header className="border-b pb-6" style={{ borderColor: "var(--ct-border-subtle)" }}>
          <h1 className="text-3xl font-black uppercase tracking-tighter" style={{ color: "var(--ct-text-primary)" }}>
            Custom Pricing
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--ct-text-secondary)" }}>
            Choose how to start pricing a customer
          </p>
        </header>

        {/* 3 Flow Cards */}
        <div className="grid grid-cols-3 gap-6">
          {/* Card 1: New Customer */}
          <div
            className="rounded-[var(--r-lg)] p-6 space-y-4 border transition-colors hover:border-[var(--accent-light)]"
            style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
          >
            <div
              className="w-10 h-10 rounded-[var(--r-lg)] flex items-center justify-center font-black text-lg"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              1
            </div>
            <h2 className="font-bold text-lg" style={{ color: "var(--ct-text-primary)" }}>New Customer</h2>
            <p className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
              Fill in customer details and add usage manually or upload later on
              the pricing page.
            </p>
            <button
              onClick={() => router.push("/custom_pricing/add")}
              className="w-full py-2 rounded text-sm font-bold uppercase transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              Start →
            </button>
          </div>

          {/* Card 2: Upload Usage */}
          <div
            className="rounded-[var(--r-lg)] p-6 space-y-4 border transition-colors hover:border-[var(--accent-light)]"
            style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
          >
            <div
              className="w-10 h-10 rounded-[var(--r-lg)] flex items-center justify-center font-black text-lg"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              2
            </div>
            <h2 className="font-bold text-lg" style={{ color: "var(--ct-text-primary)" }}>Upload Usage First</h2>
            <p className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
              Upload a usage file — ESID, meter count, and profiles will be
              auto-filled in the form.
            </p>
            {uploadMsg && (
              <div
                className="px-3 py-2 rounded text-xs border"
                style={{ background: "var(--amber-light-tint)", borderColor: "var(--amber-light-border)", color: "var(--amber-light)" }}
              >
                {uploadMsg}
              </div>
            )}
            <label
              className="w-full block text-center py-2 rounded text-sm font-bold uppercase transition-colors cursor-pointer"
              style={
                uploading
                  ? { background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }
                  : { background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }
              }
            >
              {uploading ? "Parsing..." : "Upload File →"}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleUsageUpload}
                className="hidden"
                disabled={uploading}
              />
            </label>
          </div>

          {/* Card 3: Renewal */}
          <div
            className="rounded-[var(--r-lg)] p-6 space-y-4 border transition-colors hover:border-[var(--accent-light)]"
            style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
          >
            <div
              className="w-10 h-10 rounded-[var(--r-lg)] flex items-center justify-center font-black text-lg"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              3
            </div>
            <h2 className="font-bold text-lg" style={{ color: "var(--ct-text-primary)" }}>Renewal Customer</h2>
            <p className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
              Search existing customers from the contract renewal database and
              import their data.
            </p>
            <button
              onClick={() => setShowRenewalModal(true)}
              className="w-full py-2 rounded text-sm font-bold uppercase transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              Search →
            </button>
          </div>
        </div>

        {/* Customer List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="font-bold uppercase text-sm" style={{ color: "var(--ct-text-primary)" }}>
              Recent Customers
            </h2>
          </div>

          <input
            type="text"
            placeholder="Search by name or ESID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 rounded border focus:outline-none"
            style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
          />

          {loading ? (
            <div className="text-center py-10 italic animate-pulse" style={{ color: "var(--ct-text-muted)" }}>
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 italic" style={{ color: "var(--ct-text-muted)" }}>
              No customers found.
            </div>
          ) : (
            <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="uppercase text-xs" style={{ background: "var(--ct-surface-hover)", color: "var(--ct-text-muted)" }}>
                    <th className="p-3 text-left">Company</th>
                    <th className="p-3 text-left">ESID</th>
                    <th className="p-3 text-center">No. ESIDs</th>
                    <th className="p-3 text-left">Broker</th>
                    <th className="p-3 text-center">Credit</th>
                    <th className="p-3 text-center">Contract Start</th>
                    <th className="p-3 text-center">Pricing Start</th>
                    <th className="p-3 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((c) => (
                    <tr
                      key={c.id}
                      className="border-t transition-colors hover:bg-[var(--ct-surface-hover)]"
                      style={{ borderColor: "var(--ct-border-subtle)" }}
                    >
                      <td className="p-3 font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                        {c.company_name}
                      </td>
                      <td className="p-3 font-mono text-xs" style={{ color: "var(--ct-text-secondary)" }}>
                        {c.esid}
                      </td>
                      <td className="p-3 text-center" style={{ color: "var(--ct-text-secondary)" }}>
                        {c.num_esids}
                      </td>
                      <td className="p-3" style={{ color: "var(--ct-text-secondary)" }}>{c.broker_code}</td>
                      <td className="p-3 text-center">
                        <span
                          className="px-2 py-1 rounded text-xs font-bold"
                          style={
                            c.credit_status === "Approved"
                              ? { background: "var(--success-light-tint)", color: "var(--success-light)" }
                              : { background: "var(--amber-light-tint)", color: "var(--amber-light)" }
                          }
                        >
                          {c.credit_status || "Pending"}
                        </span>
                      </td>
                      <td className="p-3 text-center" style={{ color: "var(--ct-text-secondary)" }}>
                        {sanitizeDate(c.contract_start_date)}
                      </td>
                      <td className="p-3 text-center" style={{ color: "var(--ct-text-secondary)" }}>
                        {sanitizeDate(c.pricing_start_date)}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() =>
                              router.push(`/custom_pricing/${c.id}`)
                            }
                            className="px-3 py-1 rounded text-xs font-bold border transition-colors"
                            style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", color: "var(--ct-text-primary)" }}
                          >
                            Price
                          </button>
                          <button
                            onClick={() =>
                              router.push(`/custom_pricing/${c.id}/edit`)
                            }
                            className="px-3 py-1 rounded text-xs font-bold transition-colors"
                            style={{ background: "var(--accent-light-tint)", color: "var(--accent-light)" }}
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="px-3 py-1 rounded text-xs font-bold transition-colors"
                            style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)" }}
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

        {/* Renewal Modal */}
        {showRenewalModal && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="rounded-[var(--r-lg)] p-6 w-full max-w-2xl space-y-4 mx-4" style={{ background: "var(--ct-surface)" }}>
              <div className="flex justify-between items-center">
                <h2 className="font-bold text-lg uppercase" style={{ color: "var(--ct-text-primary)" }}>
                  Search Renewal Customer
                </h2>
                <button
                  onClick={() => setShowRenewalModal(false)}
                  className="text-xl transition-colors"
                  style={{ color: "var(--ct-text-muted)" }}
                >
                  ✕
                </button>
              </div>

              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Search by company name, ESID, or customer ID..."
                  value={renewalSearch}
                  onChange={(e) => setRenewalSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleRenewalSearch()}
                  className="flex-1 px-3 py-2 rounded text-sm border focus:outline-none"
                  style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
                />
                <button
                  onClick={handleRenewalSearch}
                  disabled={renewalSearching}
                  className="px-4 py-2 rounded text-sm font-bold uppercase"
                  style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                >
                  {renewalSearching ? "..." : "Search"}
                </button>
              </div>

              {renewalResults.length > 0 && (
                <div className="space-y-2">
                  <div className="max-h-80 overflow-y-auto space-y-2">
                    {renewalResults.map((r) => {
                      const isSelected = selectedRenewals.find(
                        (x) => x.serial === r.serial,
                      );
                      return (
                        <div
                          key={r.serial}
                          onClick={() => handleRenewalToggle(r)}
                          className="rounded p-3 flex justify-between items-center cursor-pointer transition-colors border"
                          style={
                            isSelected
                              ? { background: "var(--accent-light-tint)", borderColor: "var(--accent-light)" }
                              : { background: "var(--ct-canvas)", borderColor: "transparent" }
                          }
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={!!isSelected}
                              onChange={(e) => e.stopPropagation()} // ← stop propagation, let div handle it
                              className="accent-[var(--accent-light)] w-4 h-4"
                            />
                            <div>
                              <p className="font-semibold" style={{ color: "var(--ct-text-primary)" }}>
                                {r.company_name}
                              </p>
                              <p className="text-xs font-mono" style={{ color: "var(--ct-text-muted)" }}>
                                {r.premise_id} — {r.broker_name} — Exp:{" "}
                                {r.contract_end_date}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {selectedRenewals.length > 0 && (
                    <div className="flex justify-between items-center pt-2 border-t" style={{ borderColor: "var(--ct-border-default)" }}>
                      <span className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
                        {selectedRenewals.length} ESID
                        {selectedRenewals.length > 1 ? "s" : ""} selected
                      </span>
                      <button
                        onClick={handleRenewalConfirm}
                        className="px-6 py-2 rounded text-sm font-bold uppercase"
                        style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
                      >
                        Continue →
                      </button>
                    </div>
                  )}
                </div>
              )}

              {renewalResults.length === 0 &&
                renewalSearch &&
                !renewalSearching && (
                  <div className="text-center py-4 italic" style={{ color: "var(--ct-text-muted)" }}>
                    No results found.
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </PricingLayout>
  );
};

export default CustomPricingList;
