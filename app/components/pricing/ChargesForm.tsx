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
        className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="p-6 border-b border-slate-800 bg-slate-800/50 flex justify-between items-center">
          <div>
            <h2 className="text-white font-bold text-xl uppercase tracking-tight">
              {title}
            </h2>
            {/* USED lastSync HERE to fix ESLint error */}
            <div className="flex items-center gap-2 mt-1 text-slate-500">
              <Clock size={12} />
              <span className="text-[10px] font-mono uppercase tracking-widest">
                Last Sync: {lastSync || "NEVER"}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={loadData}
            className="p-2 hover:bg-slate-700 rounded-full transition-colors"
          >
            <RotateCcw size={20} className="text-slate-400" />
          </button>
        </div>

        <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-x-16 gap-y-4">
          {Object.keys(charges).map((profile) => (
            <div
              key={profile}
              className="flex items-center justify-between py-2 border-b border-slate-800/50"
            >
              <label className="text-slate-400 text-xs font-bold uppercase tracking-wider">
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
                className="bg-slate-950 border border-slate-700 text-sky-400 text-right px-4 py-2 rounded-lg w-40 font-mono focus:ring-2 focus:ring-sky-500 outline-none transition-all"
              />
            </div>
          ))}
        </div>

        <div className="p-6 bg-slate-800/30 border-t border-slate-800 flex justify-end gap-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-2 text-slate-400 hover:text-white font-semibold flex items-center gap-2"
          >
            <ArrowLeft size={18} /> Back
          </button>
          <button
            disabled={loading}
            className="bg-gradient-to-r from-orange-600 to-red-600 hover:from-orange-500 hover:to-red-500 text-white px-12 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all"
          >
            {loading ? "Saving..." : <Save size={20} />} Submit Update
          </button>
        </div>
      </form>
    </div>
  );
};

export default ChargesForm;
