import React, { useState, useEffect } from "react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { useRouter } from "next/router";

interface Broker {
  sid: number;
  broker_code: string;
  company_name: string;
  vendor: string;
  pricing_email: string;
  pricing_flag: number;
  daily_pricing_email1: string;
  daily_pricing_flag1: number;
  mills1: string;
  daily_pricing_email2: string;
  daily_pricing_flag2: number;
  mills2: string;
  daily_pricing_email3: string;
  daily_pricing_flag3: number;
  mills3: string;
  daily_pricing_email4: string;
  daily_pricing_flag4: number;
  mills4: string;
  daily_pricing_email5: string;
  daily_pricing_flag5: number;
  mills5: string;
  commission_email: string;
  commission_flag: number;
  confirmation_email: string;
  confirmation_flag: number;
  upfront_flag: string;
}

const Toggle = ({
  value,
  onChange,
}: {
  value: number | string | undefined;
  onChange: () => void;
}) => {
  const isOn = value === 1 || value === "1";
  return (
    <button
      onClick={onChange}
      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors ${
        isOn ? "bg-green-500" : "bg-slate-600"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          isOn ? "translate-x-5" : "translate-x-1"
        }`}
      />
    </button>
  );
};

// Define FlagRow Props
interface FlagRowProps {
  label: string;
  email: string;
  flagField: keyof Broker;
  millsField?: keyof Broker;
  broker: Broker;
  localFlags: Record<number, Partial<Broker>>;
  onToggle: (sid: number, field: string, currentVal: number | string) => void;
}

const FlagRow = ({
  label,
  email,
  flagField,
  millsField,
  broker,
  localFlags,
  onToggle,
}: FlagRowProps) => {
  const flags = { ...broker, ...(localFlags[broker.sid] || {}) };
  const flagVal = flags[flagField] as number | string | undefined;
  const millsVal = millsField
    ? (flags[millsField] as string | number | undefined)
    : null;

  if (!email) return null;
  const isActive = flagVal === 1 || flagVal === "1";

  return (
    <div className="flex items-center gap-4 py-2 border-b border-slate-700/50">
      <Toggle
        value={flagVal}
        onChange={() => onToggle(broker.sid, flagField as string, flagVal ?? 0)}
      />
      <span
        className={`text-xs font-bold w-16 ${isActive ? "text-green-400" : "text-slate-500"}`}
      >
        {isActive ? "Active" : "Inactive"}
      </span>
      <span className="text-slate-400 text-xs w-32 uppercase font-bold">
        {label}
      </span>
      <span className="text-slate-300 text-xs">{email}</span>
      {millsVal !== null && (
        <span className="text-slate-500 text-xs ml-auto">
          mills: {millsVal || "—"}
        </span>
      )}
    </div>
  );
};

const BrokerActivatePage = () => {
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [vendorFilter, setVendorFilter] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [localFlags, setLocalFlags] = useState<Record<number, Partial<Broker>>>(
    {},
  );
  const [saving, setSaving] = useState<number | null>(null);
  const [savedMsg, setSavedMsg] = useState<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    api
      .get("/brokers")
      .then((res) => {
        setBrokers(res.data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const vendors = [
    ...new Set(brokers.map((b) => b.vendor).filter(Boolean)),
  ].sort();

  const filtered = brokers.filter((b) => {
    const matchSearch =
      b.company_name?.toLowerCase().includes(search.toLowerCase()) ||
      b.broker_code?.toLowerCase().includes(search.toLowerCase());
    const matchVendor = !vendorFilter || b.vendor === vendorFilter;
    return matchSearch && matchVendor;
  });

  const getFlags = (broker: Broker) => ({
    ...broker,
    ...(localFlags[broker.sid] || {}),
  });

  const toggleFlag = (
    sid: number,
    field: string,
    currentVal: number | string,
  ) => {
    const newVal = currentVal === 1 || currentVal === "1" ? 0 : 1;
    setLocalFlags((prev) => ({
      ...prev,
      [sid]: { ...(prev[sid] || {}), [field]: newVal },
    }));
  };

  const handleSave = async (broker: Broker) => {
    setSaving(broker.sid);
    const updated = getFlags(broker);
    try {
      await api.put(`/brokers/${broker.sid}`, updated);
      setBrokers((prev) =>
        prev.map((b) => (b.sid === broker.sid ? { ...b, ...updated } : b)),
      );
      setLocalFlags((prev) => {
        const copy = { ...prev };
        delete copy[broker.sid];
        return copy;
      });
      setSavedMsg(broker.sid);
      setTimeout(() => setSavedMsg(null), 2000);
    } catch {
      console.error("Save failed");
    }
    setSaving(null);
  };

  return (
    <Layout title="Activate / Deactivate Brokers">
      <div className="max-w-5xl mx-auto p-6 space-y-6">
        <header className="flex justify-between items-center border-b border-slate-800 pb-6">
          <div>
            <h1 className="text-3xl font-black text-white uppercase tracking-tighter">
              Activate / Deactivate
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Manage broker email flags independently
            </p>
          </div>
          <button
            onClick={() => router.push("/broker")}
            className="text-slate-400 hover:text-white text-sm"
          >
            ← Back
          </button>
        </header>

        <div className="flex gap-4">
          <input
            type="text"
            placeholder="Search by broker code or company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-slate-800 text-white px-4 py-2 rounded border border-slate-700 focus:outline-none focus:border-red-500"
          />
          <select
            value={vendorFilter}
            onChange={(e) => setVendorFilter(e.target.value)}
            className="bg-slate-800 text-white px-4 py-2 rounded border border-slate-700 focus:outline-none focus:border-red-500"
          >
            <option value="">All Vendors</option>
            {vendors.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-slate-500 text-center py-20 italic animate-pulse">
            Loading...
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((broker) => {
              const isExpanded = expanded === broker.sid;
              const hasChanges = !!localFlags[broker.sid];
              const currentUpfront = getFlags(broker).upfront_flag;
              const isUpfrontActive = currentUpfront === "1";

              return (
                <div
                  key={broker.sid}
                  className="bg-slate-800 rounded-lg border border-slate-700 overflow-hidden"
                >
                  <div
                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-slate-700/50 transition-colors"
                    onClick={() => setExpanded(isExpanded ? null : broker.sid)}
                  >
                    <div className="flex items-center gap-4">
                      <span className="text-red-400 font-mono font-bold text-sm w-20">
                        {broker.broker_code}
                      </span>
                      <span className="text-white font-semibold">
                        {broker.company_name}
                      </span>
                      <span className="text-slate-500 text-xs">
                        {broker.vendor}
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      {hasChanges && (
                        <span className="text-yellow-400 text-xs font-bold">
                          Unsaved changes
                        </span>
                      )}
                      <span className="text-slate-400 text-sm">
                        {isExpanded ? "▲" : "▼"}
                      </span>
                    </div>
                  </div>

                  {isExpanded && (
                    <div className="px-4 pb-4 space-y-1 border-t border-slate-700">
                      <div className="pt-3 space-y-1">
                        <FlagRow
                          label="Pricing"
                          email={broker.pricing_email}
                          flagField="pricing_flag"
                          broker={broker}
                          localFlags={localFlags}
                          onToggle={toggleFlag}
                        />
                        <FlagRow
                          label="Daily Email 1"
                          email={broker.daily_pricing_email1}
                          flagField="daily_pricing_flag1"
                          millsField="mills1"
                          broker={broker}
                          localFlags={localFlags}
                          onToggle={toggleFlag}
                        />
                        <FlagRow
                          label="Daily Email 2"
                          email={broker.daily_pricing_email2}
                          flagField="daily_pricing_flag2"
                          millsField="mills2"
                          broker={broker}
                          localFlags={localFlags}
                          onToggle={toggleFlag}
                        />
                        <FlagRow
                          label="Daily Email 3"
                          email={broker.daily_pricing_email3}
                          flagField="daily_pricing_flag3"
                          millsField="mills3"
                          broker={broker}
                          localFlags={localFlags}
                          onToggle={toggleFlag}
                        />
                        <FlagRow
                          label="Daily Email 4"
                          email={broker.daily_pricing_email4}
                          flagField="daily_pricing_flag4"
                          millsField="mills4"
                          broker={broker}
                          localFlags={localFlags}
                          onToggle={toggleFlag}
                        />
                        <FlagRow
                          label="Daily Email 5"
                          email={broker.daily_pricing_email5}
                          flagField="daily_pricing_flag5"
                          millsField="mills5"
                          broker={broker}
                          localFlags={localFlags}
                          onToggle={toggleFlag}
                        />
                        <FlagRow
                          label="Commission"
                          email={broker.commission_email}
                          flagField="commission_flag"
                          broker={broker}
                          localFlags={localFlags}
                          onToggle={toggleFlag}
                        />
                        <FlagRow
                          label="Confirmation"
                          email={broker.confirmation_email}
                          flagField="confirmation_flag"
                          broker={broker}
                          localFlags={localFlags}
                          onToggle={toggleFlag}
                        />
                        <div className="flex items-center gap-4 py-2">
                          <Toggle
                            value={currentUpfront}
                            onChange={() =>
                              toggleFlag(
                                broker.sid,
                                "upfront_flag",
                                currentUpfront,
                              )
                            }
                          />
                          <span
                            className={`text-xs font-bold w-16 ${isUpfrontActive ? "text-green-400" : "text-slate-500"}`}
                          >
                            {isUpfrontActive ? "Active" : "Inactive"}
                          </span>
                          <span className="text-slate-400 text-xs w-32 uppercase font-bold">
                            Upfront Calc
                          </span>
                        </div>
                      </div>

                      <div className="flex gap-3 pt-3">
                        <button
                          onClick={() => handleSave(broker)}
                          disabled={saving === broker.sid || !hasChanges}
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-1.5 rounded text-xs font-bold uppercase disabled:opacity-50"
                        >
                          {saving === broker.sid ? "Saving..." : "Save Changes"}
                        </button>
                        {savedMsg === broker.sid && (
                          <span className="text-green-400 text-xs font-bold self-center">
                            ✓ Saved
                          </span>
                        )}
                        <button
                          onClick={() =>
                            router.push(`/broker/${broker.sid}/edit`)
                          }
                          className="bg-slate-700 hover:bg-slate-600 text-white px-4 py-1.5 rounded text-xs font-bold uppercase"
                        >
                          Edit Broker
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
};

export default BrokerActivatePage;
