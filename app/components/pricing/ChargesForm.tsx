import React, { useState, useEffect, useCallback } from "react"; // Added useCallback to imports
import api from "../../utils/api";
import { Save, RotateCcw, ArrowLeft, Clock } from "lucide-react"; // Added Clock icon
import { useRouter } from "next/router";

interface ChargesFormProps {
  title: string;
  fetchEndpoint: string;
  updateEndpoint: string;
}

const ChargesForm: React.FC<ChargesFormProps> = ({
  title,
  fetchEndpoint,
  updateEndpoint,
}) => {
  const [charges, setCharges] = useState<Record<string, number>>({});
  const [lastSync, setLastSync] = useState<string | null>(null); // Now used in the UI
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Stable data loader
  const loadData = useCallback(async () => {
    try {
      const res = await api.get(fetchEndpoint);
      const sortedKeys = Object.keys(res.data).sort();
      const sortedObj: Record<string, number> = {};

      sortedKeys.forEach((key) => {
        // Force the value to a fixed 2 decimal places upon loading
        sortedObj[key] = parseFloat(Number(res.data[key]).toFixed(2));
      });

      setCharges(sortedObj);

      const statusEndpoint = updateEndpoint.replace("/update", "/last-updated");
      const statusRes = await api.get(statusEndpoint);
      if (statusRes.data.latest) {
        setLastSync(new Date(statusRes.data.latest).toLocaleString());
      }
    } catch (error) {
      console.error("Error loading charges:", error);
    }
  }, [fetchEndpoint, updateEndpoint]);

  useEffect(() => {
    loadData();
  }, [loadData]); // Dependency issue fixed

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await api.post(updateEndpoint, charges);
      alert(`${title} updated successfully!`);
      loadData(); // Refresh timestamp after save
    } catch {
      alert("Failed to update charges.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-4">
      <form
        onSubmit={handleSubmit}
        className="rounded-[var(--r-lg)] border overflow-hidden"
        style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
      >
        <div
          className="p-6 border-b flex justify-between items-center"
          style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface-hover)" }}
        >
          <div>
            <h2 className="font-bold text-xl uppercase tracking-tight" style={{ color: "var(--ct-text-primary)" }}>
              {title}
            </h2>
            {/* USED lastSync HERE to fix ESLint error */}
            <div className="flex items-center gap-2 mt-1" style={{ color: "var(--info-light)" }}>
              <Clock size={12} />
              <span className="text-[10px] font-mono uppercase tracking-widest">
                Last Sync: {lastSync || "NEVER"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="p-2 rounded-[var(--r-full)] transition-colors hover:bg-[var(--ct-surface-hover)]"
          >
            <RotateCcw size={20} style={{ color: "var(--ct-text-muted)" }} />
          </button>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-4">
          {Object.keys(charges).map((profile) => (
            <div
              key={profile}
              className="flex items-center justify-between py-2 border-b"
              style={{ borderColor: "var(--ct-border-subtle)" }}
            >
              <label className="text-xs font-bold uppercase tracking-wider" style={{ color: "var(--ct-text-muted)" }}>
                {profile.replace(/_/g, " ")}
              </label>
              <input
                type="number"
                step="0.01" // Changed from 0.000001 to 0.01
                value={charges[profile]}
                onChange={(e) =>
                  setCharges({
                    ...charges,
                    [profile]: parseFloat(e.target.value) || 0,
                  })
                }
                className="text-right px-4 py-2 rounded-[var(--r-md)] w-40 font-mono outline-none transition-all border focus:border-[var(--accent-light)]"
                style={{ background: "var(--ct-canvas)", borderColor: "var(--ct-border-default)", color: "var(--accent-light)" }}
              />
            </div>
          ))}
        </div>

        <div
          className="p-6 border-t flex justify-end gap-4"
          style={{ background: "var(--ct-surface-hover)", borderColor: "var(--ct-border-default)" }}
        >
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 font-semibold flex items-center gap-2 transition-colors"
            style={{ color: "var(--ct-text-muted)" }}
          >
            <ArrowLeft size={18} /> Back
          </button>
          <button
            disabled={loading}
            className="px-12 py-3 rounded-[var(--r-lg)] font-bold flex items-center gap-2 shadow-lg transition-all disabled:opacity-50"
            style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
          >
            {loading ? "Saving..." : <Save size={20} />} Submit Update
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChargesForm;
