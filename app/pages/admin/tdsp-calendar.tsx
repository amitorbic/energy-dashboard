import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import api from "../../utils/api";
import { getUser, isAdmin, isLoggedIn, User } from "../../utils/auth";

interface CalendarStatus {
  tdsp_name: string;
  tdsp_duns: string | null;
  year: number;
  rows: number;
  earliest: string;
  latest: string;
  last_loaded: string;
  source_file: string | null;
}

const FORMATS = [
  { value: "oncor", label: "Oncor (PDF)" },
  { value: "centerpoint", label: "CenterPoint (PDF)" },
  { value: "tnmp", label: "TNMP (xlsx)" },
  { value: "grid", label: "AEP Texas Central/North grid (xls/xlsx)" },
];

export default function TdspCalendarPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [statuses, setStatuses] = useState<CalendarStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState(FORMATS[0].value);
  const [tdspName, setTdspName] = useState("");
  const [tdspDuns, setTdspDuns] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    if (!isLoggedIn()) {
      router.push("/login");
      return;
    }
    setUser(getUser());
    setAuthChecked(true);
  }, []);

  const loadStatus = useCallback(async () => {
    setLoadingStatus(true);
    try {
      const res = await api.get("/admin/tdsp-calendar/status");
      setStatuses(res.data.calendars ?? []);
    } catch {
      setStatuses([]);
    } finally {
      setLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    if (authChecked && isAdmin()) loadStatus();
  }, [authChecked, loadStatus]);

  if (!authChecked) return null;

  if (!isAdmin()) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--ct-canvas)" }}>
        <div className="text-center">
          <p className="font-semibold text-lg" style={{ color: "var(--danger-light)" }}>Access denied</p>
          <p className="text-sm mt-1" style={{ color: "var(--ct-text-muted)" }}>This section requires admin privileges.</p>
          <button
            onClick={() => router.push("/admin")}
            className="mt-4 text-xs underline hover:opacity-80"
            style={{ color: "var(--accent-light)" }}
          >
            Back to admin
          </button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !tdspName.trim() || !year) return;
    setUploading(true);
    setErr("");
    setResult("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("format", format);
      formData.append("tdsp_name", tdspName.trim());
      formData.append("year", year);
      if (tdspDuns.trim()) formData.append("tdsp_duns", tdspDuns.trim());

      const res = await api.post("/admin/tdsp-calendar/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(
        `Parsed ${res.data.rows_parsed} rows for ${res.data.tdsp_name} (${res.data.year}), cycles ${res.data.bill_cycles}.`
      );
      setFile(null);
      await loadStatus();
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "var(--ct-canvas)" }}>
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <button
              onClick={() => router.push("/admin")}
              className="text-xs mb-2 hover:opacity-80"
              style={{ color: "var(--ct-text-muted)" }}
            >
              ← Admin
            </button>
            <h1 className="text-xl font-bold" style={{ color: "var(--ct-text-primary)" }}>
              TDSP Meter Read Calendar
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
              Upload each TDSP's annual meter-read schedule. Replaces the manual SSH + CLI loader
              (scripts/load_tdsp_meter_read_calendar.py) with this form; parsing logic is unchanged.
            </p>
          </div>
          {user && <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{user.username}</span>}
        </div>

        <form
          onSubmit={handleSubmit}
          className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6 rounded-[var(--r-lg)] border mb-8"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
        >
          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>
              TDSP Name
            </label>
            <input
              type="text"
              value={tdspName}
              onChange={(e) => setTdspName(e.target.value)}
              placeholder="e.g. Oncor Electric Delivery"
              className="w-full p-2 rounded-[var(--r-md)] border focus:outline-none focus:border-[var(--accent-light)]"
              style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>
              File Format
            </label>
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="w-full p-2 rounded-[var(--r-md)] border focus:outline-none focus:border-[var(--accent-light)]"
              style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            >
              {FORMATS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>
              Year
            </label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full p-2 rounded-[var(--r-md)] border focus:outline-none focus:border-[var(--accent-light)]"
              style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>
              DUNS (optional)
            </label>
            <input
              type="text"
              value={tdspDuns}
              onChange={(e) => setTdspDuns(e.target.value)}
              placeholder="e.g. 1039940674000"
              className="w-full p-2 rounded-[var(--r-md)] border focus:outline-none focus:border-[var(--accent-light)]"
              style={{ background: "var(--ct-canvas)", color: "var(--ct-text-primary)", borderColor: "var(--ct-border-default)" }}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>
              Schedule File
            </label>
            <input
              type="file"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-[var(--accent-light-tint)] file:text-[var(--accent-light)]"
              style={{ color: "var(--ct-text-secondary)" }}
            />
          </div>

          {err && <div className="md:col-span-2 text-sm" style={{ color: "var(--danger-light)" }}>{err}</div>}
          {result && <div className="md:col-span-2 text-sm" style={{ color: "var(--success-light)" }}>{result}</div>}

          <div className="md:col-span-2">
            <button
              type="submit"
              disabled={!file || !tdspName.trim() || uploading}
              className="w-full font-bold py-2 px-4 rounded-[var(--r-md)] transition-colors disabled:opacity-50"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              {uploading ? "Uploading…" : "Upload & Update Calendar"}
            </button>
          </div>
        </form>

        <div
          className="rounded-[var(--r-lg)] border overflow-hidden"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
        >
          <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: "var(--ct-border-default)" }}>
            <h2 className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>Loaded Calendars</h2>
            {loadingStatus && <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>Loading…</span>}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: "var(--ct-text-muted)" }}>
                  <th className="text-left px-4 py-2">TDSP</th>
                  <th className="text-left px-4 py-2">Year</th>
                  <th className="text-left px-4 py-2">DUNS</th>
                  <th className="text-left px-4 py-2">Rows</th>
                  <th className="text-left px-4 py-2">Coverage</th>
                  <th className="text-left px-4 py-2">Last Loaded</th>
                  <th className="text-left px-4 py-2">Source</th>
                </tr>
              </thead>
              <tbody>
                {statuses.length === 0 && !loadingStatus && (
                  <tr>
                    <td colSpan={7} className="px-4 py-6 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
                      No calendars loaded yet.
                    </td>
                  </tr>
                )}
                {statuses.map((s) => (
                  <tr key={`${s.tdsp_name}-${s.year}`} className="border-t" style={{ borderColor: "var(--ct-border-default)" }}>
                    <td className="px-4 py-2" style={{ color: "var(--ct-text-primary)" }}>{s.tdsp_name}</td>
                    <td className="px-4 py-2" style={{ color: "var(--ct-text-secondary)" }}>{s.year}</td>
                    <td className="px-4 py-2" style={{ color: "var(--ct-text-secondary)" }}>{s.tdsp_duns ?? "—"}</td>
                    <td className="px-4 py-2" style={{ color: "var(--ct-text-secondary)" }}>{s.rows}</td>
                    <td className="px-4 py-2" style={{ color: "var(--ct-text-secondary)" }}>{s.earliest} → {s.latest}</td>
                    <td className="px-4 py-2" style={{ color: "var(--ct-text-secondary)" }}>{s.last_loaded ? new Date(s.last_loaded).toLocaleString() : "—"}</td>
                    <td className="px-4 py-2" style={{ color: "var(--ct-text-secondary)" }}>{s.source_file ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
