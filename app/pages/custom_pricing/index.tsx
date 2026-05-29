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
        <header className="border-b border-slate-800 pb-6">
          <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
            Custom Pricing
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Choose how to start pricing a customer
          </p>
        </header>

        {/* 3 Flow Cards */}
        <div className="grid grid-cols-3 gap-6">
          {/* Card 1: New Customer */}
          <div className="bg-slate-800 rounded-lg p-6 space-y-4 border border-slate-700 hover:border-red-500 transition-colors">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center text-white font-black text-lg">
              1
            </div>
            <h2 className="text-white font-bold text-lg">New Customer</h2>
            <p className="text-slate-400 text-sm">
              Fill in customer details and add usage manually or upload later on
              the pricing page.
            </p>
            <button
              onClick={() => router.push("/custom_pricing/add")}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded text-sm font-bold uppercase transition-colors"
            >
              Start →
            </button>
          </div>

          {/* Card 2: Upload Usage */}
          <div className="bg-slate-800 rounded-lg p-6 space-y-4 border border-slate-700 hover:border-red-500 transition-colors">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center text-white font-black text-lg">
              2
            </div>
            <h2 className="text-white font-bold text-lg">Upload Usage First</h2>
            <p className="text-slate-400 text-sm">
              Upload a usage file — ESID, meter count, and profiles will be
              auto-filled in the form.
            </p>
            {uploadMsg && (
              <div className="bg-slate-700 text-yellow-300 px-3 py-2 rounded text-xs">
                {uploadMsg}
              </div>
            )}
            <label
              className={`w-full block text-center ${uploading ? "bg-slate-600" : "bg-red-600 hover:bg-red-700"} text-white py-2 rounded text-sm font-bold uppercase transition-colors cursor-pointer`}
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
          <div className="bg-slate-800 rounded-lg p-6 space-y-4 border border-slate-700 hover:border-red-500 transition-colors">
            <div className="w-10 h-10 bg-red-600 rounded-lg flex items-center justify-center text-white font-black text-lg">
              3
            </div>
            <h2 className="text-white font-bold text-lg">Renewal Customer</h2>
            <p className="text-slate-400 text-sm">
              Search existing customers from the contract renewal database and
              import their data.
            </p>
            <button
              onClick={() => setShowRenewalModal(true)}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded text-sm font-bold uppercase transition-colors"
            >
              Search →
            </button>
          </div>
        </div>

        {/* Customer List */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-white font-bold uppercase text-sm">
              Recent Customers
            </h2>
          </div>

          <input
            type="text"
            placeholder="Search by name or ESID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-slate-800 text-white px-4 py-2 rounded border border-slate-700 focus:outline-none focus:border-red-500"
          />

          {loading ? (
            <div className="text-slate-500 text-center py-10 italic animate-pulse">
              Loading...
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-slate-500 text-center py-10 italic">
              No customers found.
            </div>
          ) : (
            <div className="bg-slate-900 rounded-lg border border-slate-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-800 text-slate-400 uppercase text-xs">
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
                      className="border-t border-slate-800 hover:bg-slate-800/50 transition-colors"
                    >
                      <td className="p-3 text-white font-semibold">
                        {c.company_name}
                      </td>
                      <td className="p-3 text-slate-400 font-mono text-xs">
                        {c.esid}
                      </td>
                      <td className="p-3 text-center text-slate-400">
                        {c.num_esids}
                      </td>
                      <td className="p-3 text-slate-400">{c.broker_code}</td>
                      <td className="p-3 text-center">
                        <span
                          className={`px-2 py-1 rounded text-xs font-bold ${
                            c.credit_status === "Approved"
                              ? "bg-green-900 text-green-300"
                              : "bg-yellow-900 text-yellow-300"
                          }`}
                        >
                          {c.credit_status || "Pending"}
                        </span>
                      </td>
                      <td className="p-3 text-center text-slate-400">
                        {sanitizeDate(c.contract_start_date)}
                      </td>
                      <td className="p-3 text-center text-slate-400">
                        {sanitizeDate(c.pricing_start_date)}
                      </td>
                      <td className="p-3 text-center">
                        <div className="flex gap-2 justify-center">
                          <button
                            onClick={() =>
                              router.push(`/custom_pricing/${c.id}`)
                            }
                            className="bg-slate-700 hover:bg-slate-600 text-white px-3 py-1 rounded text-xs font-bold"
                          >
                            Price
                          </button>
                          <button
                            onClick={() =>
                              router.push(`/custom_pricing/${c.id}/edit`)
                            }
                            className="bg-blue-900 hover:bg-blue-800 text-blue-300 px-3 py-1 rounded text-xs font-bold"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(c.id)}
                            className="bg-red-900 hover:bg-red-800 text-red-300 px-3 py-1 rounded text-xs font-bold"
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
            <div className="bg-slate-800 rounded-lg p-6 w-full max-w-2xl space-y-4 mx-4">
              <div className="flex justify-between items-center">
                <h2 className="text-white font-bold text-lg uppercase">
                  Search Renewal Customer
                </h2>
                <button
                  onClick={() => setShowRenewalModal(false)}
                  className="text-slate-400 hover:text-white text-xl"
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
                  className="flex-1 bg-slate-700 text-white px-3 py-2 rounded text-sm border border-slate-600 focus:outline-none focus:border-red-500"
                />
                <button
                  onClick={handleRenewalSearch}
                  disabled={renewalSearching}
                  className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded text-sm font-bold uppercase"
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
                          className={`rounded p-3 flex justify-between items-center cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-red-900/50 border border-red-500"
                              : "bg-slate-700 hover:bg-slate-600"
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <input
                              type="checkbox"
                              checked={!!isSelected}
                              onChange={(e) => e.stopPropagation()} // ← stop propagation, let div handle it
                              className="accent-red-500 w-4 h-4"
                            />
                            <div>
                              <p className="text-white font-semibold">
                                {r.company_name}
                              </p>
                              <p className="text-slate-400 text-xs font-mono">
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
                    <div className="flex justify-between items-center pt-2 border-t border-slate-700">
                      <span className="text-slate-400 text-sm">
                        {selectedRenewals.length} ESID
                        {selectedRenewals.length > 1 ? "s" : ""} selected
                      </span>
                      <button
                        onClick={handleRenewalConfirm}
                        className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded text-sm font-bold uppercase"
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
                  <div className="text-slate-500 text-center py-4 italic">
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
