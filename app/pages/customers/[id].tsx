import { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { useRouter } from "next/router";
import { isAdmin } from "../../utils/auth";
import { isReasonValid, UNPOST_COOLDOWN_SECONDS } from "../../components/RevertUnpostDialogs";

interface CustomerDetail {
  id: number;
  esi_id: string | null;
  company_name: string | null;
  customer_first_name: string | null;
  customer_last_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  broker_id: string | null;
  broker_name: string | null;
  energy_rate: string | null;
  annual_usage_kwh: string | null;
  contract_end_date: string | null;
  contract_start_date: string | null;
  contract_type: string | null;
  load_profile: string | null;
  plan_group: string | null;
  cust_type: string | null;
  billing_address: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_zip: string | null;
  premise_address: string | null;
  premise_address2: string | null;
  premise_city: string | null;
  premise_state: string | null;
  premise_zip: string | null;
  comm_rate: string | null;
  bill_mode: string | null;
  other_charge: string | null;
  city_tax_exempt: string | null;
  county_tax_exempt: string | null;
  state_tax_exempt: string | null;
  grt_tax_exempt: number | null;
  puc_tax_exempt: number | null;
  mtacda_tax_exempt: string | null;
  spdt_tax_exempt: string | null;
  spdt2_tax_exempt: string | null;
  attn: string | null;
  summary: string;
}

interface EditForm {
  // Contact (all users)
  customer_first_name: string;
  customer_last_name: string;
  customer_email: string;
  customer_phone: string;
  billing_address: string;
  billing_city: string;
  billing_state: string;
  billing_zip: string;
  premise_address: string;
  attn: string;
  // Contract terms (admin only)
  energy_rate: string;
  contract_end_date: string;
  contract_start_date: string;
  load_profile: string;
  contract_type: string;
  plan_group: string;
  annual_usage_kwh: string;
  other_charge: string;
  broker_id: string;
  broker_name: string;
  comm_rate: string;
  // Tax exemptions (admin only)
  city_tax_exempt: string;
  county_tax_exempt: string;
  state_tax_exempt: string;
  grt_tax_exempt: string;
  puc_tax_exempt: string;
  mtacda_tax_exempt: string;
  spdt_tax_exempt: string;
  spdt2_tax_exempt: string;
}

const parseZone = (lp: string | null) => {
  if (!lp) return "";
  const parts = lp.split("_");
  return parts.length >= 2 ? parts[1] : "";
};

// Read-only display field
const Field = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) => (
  <div>
    <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5">{label}</p>
    <p className={`text-sm text-slate-200 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
  </div>
);

// Permanently locked field — shown to all users with a lock indicator
const LockedField = ({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) => (
  <div>
    <p className="text-xs text-slate-500 uppercase tracking-wide mb-0.5 flex items-center gap-1">
      {label}
      <svg className="w-3 h-3 text-slate-600" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
          clipRule="evenodd"
        />
      </svg>
    </p>
    <p className={`text-sm text-slate-400 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
  </div>
);

// Editable input field
const InputField = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => (
  <div>
    <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">
      {label}
    </label>
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-red-500 transition-colors"
    />
  </div>
);

// Tax toggle — editable by any logged-in user
const TaxToggle = ({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) => {
  const isExempt = value === "100" || value === "1";
  return (
    <div>
      <p className="text-xs text-slate-500 uppercase tracking-wide mb-1">{label}</p>
      <button
        type="button"
        onClick={() => onChange(isExempt ? "0" : "100")}
        className={`text-xs px-3 py-1 rounded font-semibold transition-colors ${
          isExempt
            ? "bg-green-900/50 text-green-400 border border-green-700"
            : "bg-slate-800 text-slate-400 border border-slate-700"
        }`}
      >
        {isExempt ? "Exempt" : "Taxable"}
      </button>
    </div>
  );
};

interface ContractRow {
  serial: number;
  cust_id: string | null;
  status: string;
  contract_type: string | null;
  contract_rate: string | null;
  contract_end_date: string | null;
  contract_start_date: string | null;
  term: string | null;
  broker_code: string | null;
  broker_name: string | null;
  batch_no: string | null;
  plan_group: string | null;
  plan_id: string | null;
  other_charge: string | null;
  account_type: string | null;
  created_at: string | null;
}

interface AddonAttachedRow {
  addon_type_id: number;
  code: string;
  description: string | null;
  calculation_basis: string;
  is_taxable: boolean;
  is_active: boolean;
  current_rate: number | null;
  rate_effective_from: string | null;
}

interface AddonTypeOption {
  id: number;
  code: string;
  description: string | null;
  calculation_basis: string;
  is_taxable: boolean;
  current_rate: number | null;
  rate_effective_from: string | null;
}

interface InvoiceRow {
  id: number;
  invoice_number: string;
  billing_period_id: number;
  esi_id: string;
  invoice_date: string | null;
  due_date: string | null;
  total_amount: number;
  status: string;
  sent_at: string | null;
  paid_at: string | null;
  created_at: string | null;
  service_start: string | null;
  service_end: string | null;
}

const TABS = [
  "Overview",
  "Contracts",
  "Addon Charges",
  "Bills",
  "Payments",
  "Services",
  "Deposits",
  "TDSP Transactions",
] as const;
type Tab = (typeof TABS)[number];

const CustomerDetailPage = () => {
  const router = useRouter();
  const { id } = router.query;

  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [contracts, setContracts] = useState<ContractRow[]>([]);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [contractsLoaded, setContractsLoaded] = useState(false);
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [form, setForm] = useState<EditForm>({
    customer_first_name: "", customer_last_name: "",
    customer_email: "", customer_phone: "",
    billing_address: "", billing_city: "", billing_state: "", billing_zip: "",
    premise_address: "", attn: "",
    energy_rate: "", contract_end_date: "", contract_start_date: "",
    load_profile: "", contract_type: "", plan_group: "",
    annual_usage_kwh: "", other_charge: "",
    broker_id: "", broker_name: "", comm_rate: "",
    city_tax_exempt: "0", county_tax_exempt: "0", state_tax_exempt: "0",
    grt_tax_exempt: "0", puc_tax_exempt: "0",
    mtacda_tax_exempt: "0", spdt_tax_exempt: "0", spdt2_tax_exempt: "0",
  });
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [saveError, setSaveError] = useState(false);

  const [attachedAddons, setAttachedAddons] = useState<AddonAttachedRow[]>([]);
  const [addonsLoading, setAddonsLoading] = useState(false);
  const [addonsLoaded, setAddonsLoaded] = useState(false);
  const [availableTypes, setAvailableTypes] = useState<AddonTypeOption[]>([]);
  const [selectedAddonTypeId, setSelectedAddonTypeId] = useState("");
  const [addonAttaching, setAddonAttaching] = useState(false);
  const [addonMsg, setAddonMsg] = useState("");
  const [addonError, setAddonError] = useState(false);
  const [detachConfirm, setDetachConfirm] = useState<number | null>(null);

  const [invoices, setInvoices] = useState<InvoiceRow[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [postingId, setPostingId] = useState<number | null>(null);
  const [invoiceMsg, setInvoiceMsg] = useState("");
  const [invoiceError, setInvoiceError] = useState(false);
  const [unpostConfirmId, setUnpostConfirmId] = useState<number | null>(null);
  const [unpostBusyId, setUnpostBusyId] = useState<number | null>(null);
  const [unpostReason, setUnpostReason] = useState("");
  const [unpostConfirmText, setUnpostConfirmText] = useState("");
  const [unpostCooldown, setUnpostCooldown] = useState(0);

  useEffect(() => {
    setAdmin(isAdmin());
  }, []);

  useEffect(() => {
    if (!id) return;
    api
      .get(`/contract-renewal/${id}`)
      .then((res) => {
        const d: CustomerDetail = res.data;
        setCustomer(d);
        setForm({
          customer_first_name: d.customer_first_name ?? "",
          customer_last_name: d.customer_last_name ?? "",
          customer_email: d.customer_email ?? "",
          customer_phone: d.customer_phone ?? "",
          billing_address: d.billing_address ?? "",
          billing_city: d.billing_city ?? "",
          billing_state: d.billing_state ?? "",
          billing_zip: d.billing_zip ?? "",
          premise_address: d.premise_address ?? "",
          attn: d.attn ?? "",
          energy_rate: d.energy_rate ?? "",
          contract_end_date: d.contract_end_date ?? "",
          contract_start_date: d.contract_start_date ?? "",
          load_profile: d.load_profile ?? "",
          contract_type: d.contract_type ?? "",
          plan_group: d.plan_group ?? "",
          annual_usage_kwh: d.annual_usage_kwh ?? "",
          other_charge: d.other_charge ?? "",
          broker_id: d.broker_id ?? "",
          broker_name: d.broker_name ?? "",
          comm_rate: d.comm_rate ?? "",
          city_tax_exempt: d.city_tax_exempt ?? "0",
          county_tax_exempt: d.county_tax_exempt ?? "0",
          state_tax_exempt: d.state_tax_exempt ?? "0",
          grt_tax_exempt: String(d.grt_tax_exempt ?? "0"),
          puc_tax_exempt: String(d.puc_tax_exempt ?? "0"),
          mtacda_tax_exempt: d.mtacda_tax_exempt ?? "0",
          spdt_tax_exempt: d.spdt_tax_exempt ?? "0",
          spdt2_tax_exempt: d.spdt2_tax_exempt ?? "0",
        });
        setLoading(false);
      })
      .catch((err) => {
        if (err.response?.status === 404) setNotFound(true);
        setLoading(false);
      });
  }, [id]);

  useEffect(() => {
    if (activeTab !== "Contracts" || contractsLoaded || !customer?.esi_id) return;
    setContractsLoading(true);
    api
      .get(`/contract-renewal/contracts/${customer.esi_id}`)
      .then((r) => { setContracts(r.data.contracts || []); setContractsLoaded(true); })
      .catch(() => setContractsLoaded(true))
      .finally(() => setContractsLoading(false));
  }, [activeTab, contractsLoaded, customer?.esi_id]);

  useEffect(() => {
    if (activeTab !== "Addon Charges" || addonsLoaded || !id) return;
    setAddonsLoading(true);
    Promise.all([
      api.get(`/contract-renewal/${id}/addon-charges`),
      api.get(`/contract-renewal/addon-types`),
    ])
      .then(([addonsRes, typesRes]) => {
        setAttachedAddons(addonsRes.data);
        setAvailableTypes(typesRes.data);
        setAddonsLoaded(true);
      })
      .catch(() => setAddonsLoaded(true))
      .finally(() => setAddonsLoading(false));
  }, [activeTab, addonsLoaded, id]);

  useEffect(() => {
    if (activeTab !== "Bills" || invoicesLoaded || !customer?.esi_id) return;
    setInvoicesLoading(true);
    api
      .get(`/billing-engine/invoices/by-esi/${customer.esi_id}`)
      .then((r) => { setInvoices(r.data || []); setInvoicesLoaded(true); })
      .catch(() => setInvoicesLoaded(true))
      .finally(() => setInvoicesLoading(false));
  }, [activeTab, invoicesLoaded, customer?.esi_id]);

  const handlePostInvoice = async (invoiceId: number) => {
    setPostingId(invoiceId);
    setInvoiceMsg("");
    setInvoiceError(false);
    try {
      await api.post(`/billing-engine/invoices/${invoiceId}/post`);
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: "posted" } : inv))
      );
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to post invoice — please try again.";
      setInvoiceMsg(msg);
      setInvoiceError(true);
    } finally {
      setPostingId(null);
    }
  };

  const handleUnpostInvoice = async (invoiceId: number) => {
    setUnpostBusyId(invoiceId);
    setInvoiceMsg("");
    setInvoiceError(false);
    try {
      await api.post(`/admin/invoices/${invoiceId}/unpost`, { reason: unpostReason.trim() });
      setInvoices((prev) =>
        prev.map((inv) => (inv.id === invoiceId ? { ...inv, status: "draft" } : inv))
      );
      setUnpostConfirmId(null);
      setInvoiceMsg("Invoice unposted. You can now revert this billing period if needed.");
      setInvoiceError(false);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to unpost invoice — please try again.";
      setInvoiceMsg(msg);
      setInvoiceError(true);
    } finally {
      setUnpostBusyId(null);
    }
  };

  const openUnpostConfirm = (invoiceId: number) => {
    setUnpostReason("");
    setUnpostConfirmText("");
    setUnpostCooldown(UNPOST_COOLDOWN_SECONDS);
    setUnpostConfirmId(invoiceId);
  };

  useEffect(() => {
    if (unpostConfirmId === null || unpostCooldown <= 0) return;
    const t = setTimeout(() => setUnpostCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [unpostConfirmId, unpostCooldown]);

  const set = (field: keyof EditForm) => (v: string) =>
    setForm((prev) => ({ ...prev, [field]: v }));

  const handleSave = async () => {
    if (!id) return;
    setSaving(true);
    setSaveMsg("");
    setSaveError(false);

    const payload: Partial<EditForm> = admin
      ? { ...form }
      : {
          customer_first_name: form.customer_first_name,
          customer_last_name: form.customer_last_name,
          customer_email: form.customer_email,
          customer_phone: form.customer_phone,
          billing_address: form.billing_address,
          billing_city: form.billing_city,
          billing_state: form.billing_state,
          billing_zip: form.billing_zip,
          premise_address: form.premise_address,
          attn: form.attn,
          // Tax exemptions — editable by any logged-in user, not admin-only
          city_tax_exempt: form.city_tax_exempt,
          county_tax_exempt: form.county_tax_exempt,
          state_tax_exempt: form.state_tax_exempt,
          grt_tax_exempt: form.grt_tax_exempt,
          puc_tax_exempt: form.puc_tax_exempt,
          mtacda_tax_exempt: form.mtacda_tax_exempt,
          spdt_tax_exempt: form.spdt_tax_exempt,
          spdt2_tax_exempt: form.spdt2_tax_exempt,
        };

    try {
      const res = await api.put(`/contract-renewal/${id}`, payload);
      setCustomer(res.data);
      setSaveMsg("Saved successfully.");
      setTimeout(() => setSaveMsg(""), 4000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Save failed — please try again.";
      setSaveMsg(msg);
      setSaveError(true);
    } finally {
      setSaving(false);
    }
  };

  const handleAttach = async () => {
    if (!selectedAddonTypeId || !id) return;
    setAddonAttaching(true);
    setAddonMsg("");
    setAddonError(false);
    try {
      const res = await api.post(`/contract-renewal/${id}/addon-charges`, {
        addon_type_id: parseInt(selectedAddonTypeId),
      });
      setAttachedAddons(res.data);
      setSelectedAddonTypeId("");
      setAddonMsg("Addon attached.");
      setTimeout(() => setAddonMsg(""), 3000);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to attach — please try again.";
      setAddonMsg(msg);
      setAddonError(true);
    } finally {
      setAddonAttaching(false);
    }
  };

  const handleDetach = async (addonTypeId: number) => {
    if (!id) return;
    setAddonMsg("");
    setAddonError(false);
    try {
      const res = await api.delete(`/contract-renewal/${id}/addon-charges/${addonTypeId}`);
      setAttachedAddons(res.data);
      setDetachConfirm(null);
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ??
        "Failed to detach.";
      setAddonMsg(msg);
      setAddonError(true);
    }
  };

  if (loading) {
    return (
      <Layout title="Customer Detail">
        <div className="text-slate-500 text-center py-20 animate-pulse">Loading...</div>
      </Layout>
    );
  }

  if (notFound || !customer) {
    return (
      <Layout title="Not Found">
        <div className="max-w-2xl mx-auto p-6 text-center space-y-3">
          <p className="text-slate-400 text-lg">Record not found.</p>
          <button
            onClick={() => router.push("/customers/renewal-view")}
            className="text-red-400 hover:text-red-300 text-sm"
          >
            ← Back to list
          </button>
        </div>
      </Layout>
    );
  }

  const zone = parseZone(customer.load_profile);
  const rateCents = customer.energy_rate
    ? (parseFloat(customer.energy_rate) * 100).toFixed(4)
    : null;
  const serviceAddress = customer.premise_address ?? customer.premise_address2;

  return (
    <Layout title={customer.company_name ?? "Customer Detail"}>
      <div className="max-w-5xl mx-auto p-6 space-y-6">

        {/* Header */}
        <div className="border-b border-slate-800 pb-5">
          <div className="mb-3">
            <button
              onClick={() => router.push("/customers/renewal-view")}
              className="text-slate-400 hover:text-white text-sm"
            >
              ← Renewal list
            </button>
          </div>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-black text-white uppercase tracking-tighter">
                {customer.company_name}
              </h1>
              {customer.summary && (
                <p className="text-slate-400 text-xs mt-1.5 font-mono leading-relaxed">
                  {customer.summary}
                </p>
              )}
            </div>
            {admin ? (
              <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-green-900/40 text-green-400 border border-green-800 font-semibold">
                Admin — full edit access
              </span>
            ) : (
              <span className="shrink-0 text-xs px-2.5 py-1 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-semibold">
                Contact info only
              </span>
            )}
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 border-b border-slate-800 mt-4">
          {TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t transition-colors whitespace-nowrap ${
                activeTab === tab
                  ? "bg-slate-900 border border-b-slate-900 border-slate-800 text-red-400 -mb-px"
                  : "text-slate-500 hover:text-slate-300"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Contracts tab */}
        {activeTab === "Contracts" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-white font-bold uppercase tracking-tight text-sm mb-4">Contract History</h2>
            {contractsLoading ? (
              <p className="text-slate-500 text-sm animate-pulse">Loading…</p>
            ) : contracts.length === 0 ? (
              <p className="text-slate-500 text-sm">No contract history found for this ESI ID.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead>
                    <tr className="bg-slate-800 text-slate-400 uppercase text-xs">
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Type</th>
                      <th className="px-3 py-2 text-right">Rate ($)</th>
                      <th className="px-3 py-2 text-left">Start</th>
                      <th className="px-3 py-2 text-left">End</th>
                      <th className="px-3 py-2 text-left">Term</th>
                      <th className="px-3 py-2 text-left">Broker</th>
                      <th className="px-3 py-2 text-left">Batch</th>
                      <th className="px-3 py-2 text-left">Cust ID</th>
                      <th className="px-3 py-2 text-left">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contracts.map((c) => {
                      const statusColors: Record<string, string> = {
                        active:      "bg-green-900/50 text-green-400",
                        pending:     "bg-yellow-900/50 text-yellow-400",
                        going_final: "bg-blue-900/50 text-blue-400",
                        cancelled:   "bg-slate-700 text-slate-400",
                      };
                      const badgeCls = statusColors[c.status] ?? "bg-slate-700 text-slate-400";
                      const isDefault = c.account_type === "default";
                      return (
                        <tr key={c.serial} className={`border-t border-slate-800 ${isDefault ? "opacity-50 hover:opacity-70" : "hover:bg-slate-800/40"}`}>
                          <td className="px-3 py-2">
                            {isDefault ? (
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-500 border border-slate-700">Default</span>
                            ) : (
                              <span className={`text-xs px-2 py-0.5 rounded ${badgeCls}`}>{c.status}</span>
                            )}
                          </td>
                          <td className="px-3 py-2">{c.contract_type || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {c.contract_rate ? parseFloat(c.contract_rate).toFixed(4) : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{c.contract_start_date || "—"}</td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{c.contract_end_date || "—"}</td>
                          <td className="px-3 py-2">{c.term || "—"}</td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            {c.broker_code ? `${c.broker_code}${c.broker_name ? ` · ${c.broker_name}` : ""}` : "—"}
                          </td>
                          <td className="px-3 py-2 font-mono">{c.batch_no || "—"}</td>
                          <td className="px-3 py-2 font-mono text-slate-500">{c.cust_id || "—"}</td>
                          <td className="px-3 py-2 font-mono text-slate-500 whitespace-nowrap">
                            {c.created_at ? c.created_at.slice(0, 10) : "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Bills tab */}
        {activeTab === "Bills" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h2 className="text-white font-bold uppercase tracking-tight text-sm mb-4">Bills</h2>
            {invoicesLoading ? (
              <p className="text-slate-500 text-sm animate-pulse">Loading…</p>
            ) : invoices.length === 0 ? (
              <p className="text-slate-500 text-sm">No bills found for this ESI ID.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-slate-300">
                  <thead>
                    <tr className="bg-slate-800 text-slate-400 uppercase text-xs">
                      <th className="px-3 py-2 text-left">Bill Number</th>
                      <th className="px-3 py-2 text-left">Bill Date</th>
                      <th className="px-3 py-2 text-left">Service Start</th>
                      <th className="px-3 py-2 text-left">Service End</th>
                      <th className="px-3 py-2 text-right">Bill Amount</th>
                      <th className="px-3 py-2 text-left">Due Date</th>
                      <th className="px-3 py-2 text-left">Status</th>
                      <th className="px-3 py-2 text-left">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => {
                      const statusColors: Record<string, string> = {
                        draft:  "bg-slate-700 text-slate-400",
                        posted: "bg-blue-900/50 text-blue-400",
                        sent:   "bg-yellow-900/50 text-yellow-400",
                        paid:   "bg-green-900/50 text-green-400",
                        void:   "bg-red-900/50 text-red-400",
                      };
                      const badgeCls = statusColors[inv.status] ?? "bg-slate-700 text-slate-400";
                      return (
                        <tr key={inv.id} className="border-t border-slate-800 hover:bg-slate-800/40">
                          <td className="px-3 py-2 font-mono font-bold text-slate-200">{inv.invoice_number}</td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{inv.invoice_date || "—"}</td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{inv.service_start || "—"}</td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{inv.service_end || "—"}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            ${inv.total_amount.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{inv.due_date || "—"}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs px-2 py-0.5 rounded ${badgeCls}`}>{inv.status}</span>
                          </td>
                          <td className="px-3 py-2">
                            <div className="flex items-center gap-3">
                              {inv.status === "draft" ? (
                                <button
                                  onClick={() => handlePostInvoice(inv.id)}
                                  disabled={postingId === inv.id}
                                  className="text-xs px-2 py-0.5 rounded bg-red-900/60 text-red-400 hover:bg-red-800/60 disabled:opacity-50 transition-colors"
                                >
                                  {postingId === inv.id ? "Posting…" : "Post"}
                                </button>
                              ) : null}
                              {admin && inv.status === "sent" ? (
                                <button
                                  onClick={() => openUnpostConfirm(inv.id)}
                                  disabled={unpostBusyId === inv.id}
                                  className="text-xs px-2 py-0.5 rounded bg-amber-900/60 text-amber-400 hover:bg-amber-800/60 disabled:opacity-50 transition-colors"
                                >
                                  {unpostBusyId === inv.id ? "Unposting…" : "Unpost"}
                                </button>
                              ) : null}
                              <span
                                title="PDF generation is not yet available"
                                className="text-xs text-slate-600 cursor-not-allowed"
                              >
                                View PDF (Not yet available)
                              </span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {invoiceMsg && (
              <p className={`text-sm mt-3 ${invoiceError ? "text-red-400" : "text-green-400"}`}>
                {invoiceMsg}
              </p>
            )}
          </div>
        )}

        {/* Coming soon placeholder for unbuilt tabs */}
        {activeTab !== "Overview" &&
          activeTab !== "Contracts" &&
          activeTab !== "Addon Charges" &&
          activeTab !== "Bills" && (
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-10 text-center">
            <h2 className="text-slate-300 text-lg font-semibold mb-2">{activeTab}</h2>
            <p className="text-slate-500 text-sm">This section is under construction — coming soon.</p>
          </div>
        )}

        {/* Addon Charges tab */}
        {activeTab === "Addon Charges" && (
          <div className="space-y-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                Attached Addon Charges
              </h2>
              {addonsLoading ? (
                <p className="text-slate-500 text-sm animate-pulse">Loading…</p>
              ) : attachedAddons.length === 0 ? (
                <p className="text-slate-500 text-sm">No addon charges attached to this contract.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-slate-300">
                    <thead>
                      <tr className="bg-slate-800 text-slate-400 uppercase text-xs">
                        <th className="px-3 py-2 text-left">Code</th>
                        <th className="px-3 py-2 text-left">Description</th>
                        <th className="px-3 py-2 text-left">Basis</th>
                        <th className="px-3 py-2 text-right">Current Rate</th>
                        <th className="px-3 py-2 text-left">Status</th>
                        <th className="px-3 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {attachedAddons.map((a) => (
                        <tr key={a.addon_type_id} className="border-t border-slate-800 hover:bg-slate-800/40">
                          <td className="px-3 py-2 font-mono font-bold text-slate-200">{a.code}</td>
                          <td className="px-3 py-2">{a.description || "—"}</td>
                          <td className="px-3 py-2 text-slate-400">{a.calculation_basis}</td>
                          <td className="px-3 py-2 text-right font-mono">
                            {a.current_rate !== null
                              ? `$${a.current_rate.toFixed(6)}`
                              : <span className="text-slate-500">no rate</span>}
                          </td>
                          <td className="px-3 py-2">
                            {a.is_active ? (
                              <span className="text-xs px-2 py-0.5 rounded bg-green-900/50 text-green-400">Active</span>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded bg-slate-700 text-slate-400">Inactive</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {detachConfirm === a.addon_type_id ? (
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-yellow-400">Detach?</span>
                                <button
                                  onClick={() => handleDetach(a.addon_type_id)}
                                  className="text-xs px-2 py-0.5 rounded bg-red-900/60 text-red-400 hover:bg-red-800/60 transition-colors"
                                >
                                  Confirm
                                </button>
                                <button
                                  onClick={() => setDetachConfirm(null)}
                                  className="text-xs text-slate-400 hover:text-slate-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDetachConfirm(a.addon_type_id)}
                                className="text-xs text-slate-500 hover:text-red-400 transition-colors"
                              >
                                Detach
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {addonMsg && (
                <p className={`text-sm mt-3 ${addonError ? "text-red-400" : "text-green-400"}`}>
                  {addonMsg}
                </p>
              )}
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
              <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                Attach Addon Charge
              </h2>
              {(() => {
                const attachedIds = new Set(attachedAddons.map((a) => a.addon_type_id));
                const unattached = availableTypes.filter((t) => !attachedIds.has(t.id));
                if (unattached.length === 0) {
                  return (
                    <p className="text-slate-500 text-sm">
                      {addonsLoading ? "Loading…" : "All active addon types are already attached."}
                    </p>
                  );
                }
                return (
                  <div className="flex items-end gap-3 flex-wrap">
                    <div className="flex-1 min-w-[220px] max-w-sm">
                      <label className="text-xs text-slate-500 uppercase tracking-wide block mb-1">
                        Addon type
                      </label>
                      <select
                        value={selectedAddonTypeId}
                        onChange={(e) => setSelectedAddonTypeId(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 text-white text-sm px-3 py-2 rounded focus:outline-none focus:border-red-500 transition-colors"
                      >
                        <option value="">— select —</option>
                        {unattached.map((t) => (
                          <option key={t.id} value={String(t.id)}>
                            {t.code}{t.description ? ` — ${t.description}` : ""}
                            {t.current_rate !== null ? ` ($${t.current_rate.toFixed(6)})` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      onClick={handleAttach}
                      disabled={!selectedAddonTypeId || addonAttaching}
                      className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-4 py-2 rounded text-sm font-bold uppercase transition"
                    >
                      {addonAttaching ? "Attaching…" : "Attach"}
                    </button>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* Overview tab content */}
        {activeTab === "Overview" && <>

        {/* Contract Details */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Contract Details
            {admin && (
              <span className="ml-2 text-slate-600 font-normal normal-case tracking-normal">
                editable
              </span>
            )}
          </h2>
          {admin ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <InputField label="Contract type" value={form.contract_type} onChange={set("contract_type")} />
                <InputField label="Rate ($/kWh)" value={form.energy_rate} onChange={set("energy_rate")} />
                <InputField label="Plan group" value={form.plan_group} onChange={set("plan_group")} />
                <InputField label="End date" value={form.contract_end_date} onChange={set("contract_end_date")} />
                <InputField label="Start date" value={form.contract_start_date} onChange={set("contract_start_date")} />
                <InputField label="Annual usage (kWh)" value={form.annual_usage_kwh} onChange={set("annual_usage_kwh")} />
                <InputField label="Broker ID" value={form.broker_id} onChange={set("broker_id")} />
                <InputField label="Broker name" value={form.broker_name} onChange={set("broker_name")} />
                <InputField label="Comm rate" value={form.comm_rate} onChange={set("comm_rate")} />
                <InputField label="Meter fee" value={form.other_charge} onChange={set("other_charge")} />
              </div>
              <div className="pt-3 border-t border-slate-800">
                <InputField label="Load profile" value={form.load_profile} onChange={set("load_profile")} />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
                <Field label="Contract type" value={customer.contract_type} />
                <Field label="Rate (¢/kWh)" value={rateCents} mono />
                <Field label="End date" value={customer.contract_end_date} mono />
                <Field label="Start date" value={customer.contract_start_date} mono />
                <Field
                  label="Annual usage (kWh)"
                  value={
                    customer.annual_usage_kwh
                      ? Number(customer.annual_usage_kwh).toLocaleString()
                      : null
                  }
                  mono
                />
                <Field
                  label="Broker"
                  value={
                    customer.broker_name
                      ? `${customer.broker_name} (${customer.broker_id})`
                      : customer.broker_id
                  }
                />
                <Field label="Comm rate" value={customer.comm_rate} mono />
                <Field label="Plan group" value={customer.plan_group} mono />
                <Field label="Meter fee" value={customer.other_charge} mono />
              </div>
              <div className="pt-3 border-t border-slate-800">
                <Field label="Load profile" value={customer.load_profile} mono />
              </div>
            </div>
          )}
        </section>

        {/* Service Location — ESI ID, premise address, zip always locked */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Service Location
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-5">
            <div className="col-span-2 sm:col-span-3">
              <LockedField label="ESI ID" value={customer.esi_id} mono />
            </div>
            <div className="col-span-2 sm:col-span-2">
              <LockedField label="Service address" value={serviceAddress} />
            </div>
            <LockedField label="Zip" value={customer.premise_zip} mono />
            <Field label="City" value={customer.premise_city} />
            <Field label="State" value={customer.premise_state} />
            <Field label="Zone" value={zone || null} />
          </div>
        </section>

        {/* Contact Info — editable for all */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Contact Info{" "}
            <span className="text-slate-600 font-normal normal-case tracking-normal ml-1">
              editable
            </span>
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <InputField label="First name" value={form.customer_first_name} onChange={set("customer_first_name")} />
            <InputField label="Last name" value={form.customer_last_name} onChange={set("customer_last_name")} />
            <InputField label="Email" value={form.customer_email} onChange={set("customer_email")} />
            <InputField label="Phone" value={form.customer_phone} onChange={set("customer_phone")} />
            <InputField label="Billing address" value={form.billing_address} onChange={set("billing_address")} />
            <InputField label="Billing city" value={form.billing_city} onChange={set("billing_city")} />
            <InputField label="Billing state" value={form.billing_state} onChange={set("billing_state")} />
            <InputField label="Billing zip" value={form.billing_zip} onChange={set("billing_zip")} />
            <InputField label="Service address (line 1)" value={form.premise_address} onChange={set("premise_address")} />
            <InputField label="Attention" value={form.attn} onChange={set("attn")} />
          </div>
        </section>

        {/* Tax Exemptions — editable by any logged-in user, not admin-only */}
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
          <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
            Tax Exemptions{" "}
            <span className="text-slate-600 font-normal normal-case tracking-normal ml-1">
              editable
            </span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5">
            <TaxToggle label="City" value={form.city_tax_exempt} onChange={set("city_tax_exempt")} />
            <TaxToggle label="County" value={form.county_tax_exempt} onChange={set("county_tax_exempt")} />
            <TaxToggle label="State" value={form.state_tax_exempt} onChange={set("state_tax_exempt")} />
            <TaxToggle label="GRT" value={form.grt_tax_exempt} onChange={set("grt_tax_exempt")} />
            <TaxToggle label="PUC" value={form.puc_tax_exempt} onChange={set("puc_tax_exempt")} />
            <TaxToggle label="MTACDA" value={form.mtacda_tax_exempt} onChange={set("mtacda_tax_exempt")} />
            <TaxToggle label="SPDT" value={form.spdt_tax_exempt} onChange={set("spdt_tax_exempt")} />
            <TaxToggle label="SPDT2" value={form.spdt2_tax_exempt} onChange={set("spdt2_tax_exempt")} />
          </div>
        </section>

        </>}

        {/* Save — only shown on Overview */}
        {activeTab === "Overview" && (
          <div className="flex items-center gap-4 pb-2">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white px-6 py-2 rounded text-sm font-bold uppercase transition"
            >
              {saving ? "Saving…" : "Save changes"}
            </button>
            {saveMsg && (
              <span className={`text-sm ${saveError ? "text-red-400" : "text-green-400"}`}>
                {saveMsg}
              </span>
            )}
          </div>
        )}

      </div>

      {unpostConfirmId !== null && (() => {
        const targetInvoiceNumber = invoices.find((i) => i.id === unpostConfirmId)?.invoice_number ?? "";
        const busy = unpostBusyId === unpostConfirmId;
        const reasonOk = isReasonValid(unpostReason);
        const phraseOk = unpostConfirmText.trim() === targetInvoiceNumber;
        const canConfirm = !busy && unpostCooldown <= 0 && reasonOk && phraseOk;
        return (
          <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
            <div className="bg-slate-900 border border-amber-800 rounded-xl shadow-xl w-full max-w-lg overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-800 bg-amber-950/40">
                <p className="font-semibold text-amber-400">
                  Unpost Invoice {targetInvoiceNumber}?
                </p>
              </div>
              <div className="px-6 py-4 space-y-3 text-sm text-slate-300">
                <p className="text-amber-300 bg-amber-950/30 border border-amber-800 rounded px-3 py-2">
                  Unposting a sent bill can create accounting discrepancies, especially if
                  significant time has passed since it was sent. This should only be done
                  shortly after sending, and the affected accounting period may need manual
                  reconciliation.
                </p>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Why are you unposting this bill? <span className="text-red-400">(required)</span>
                  </label>
                  <textarea
                    value={unpostReason}
                    onChange={(e) => setUnpostReason(e.target.value)}
                    disabled={busy}
                    rows={2}
                    placeholder="Explain the specific reason -- this is stored in the audit log."
                    className="w-full text-sm bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-40"
                  />
                  {unpostReason.trim().length > 0 && !reasonOk && (
                    <p className="text-xs text-red-400 mt-1">
                      Enter a real, specific reason (at least 10 characters) -- placeholders aren&apos;t accepted.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Type the invoice number <span className="font-mono text-slate-200">{targetInvoiceNumber}</span> to confirm
                  </label>
                  <input
                    type="text"
                    value={unpostConfirmText}
                    onChange={(e) => setUnpostConfirmText(e.target.value)}
                    disabled={busy}
                    placeholder={targetInvoiceNumber}
                    className="w-full text-sm bg-slate-800 border border-slate-700 rounded px-2.5 py-1.5 text-slate-200 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500 disabled:opacity-40"
                  />
                </div>
              </div>
              <div className="px-6 py-4 border-t border-slate-800 flex justify-end gap-2">
                <button
                  onClick={() => setUnpostConfirmId(null)}
                  disabled={busy}
                  className="px-4 py-2 text-sm font-medium text-slate-400 hover:text-slate-200 disabled:opacity-40"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleUnpostInvoice(unpostConfirmId)}
                  disabled={!canConfirm}
                  className="px-4 py-2 bg-amber-600 text-white text-sm font-medium rounded hover:bg-amber-700 disabled:opacity-40 transition-colors"
                >
                  {busy ? "Unposting…" : unpostCooldown > 0 ? `Yes, Unpost (${unpostCooldown})` : "Yes, Unpost"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
};

export default CustomerDetailPage;
