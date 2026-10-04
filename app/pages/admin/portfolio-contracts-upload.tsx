import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/router";
import api from "../../utils/api";
import { getUser, isAdmin, isLoggedIn, User } from "../../utils/auth";

interface Status {
  is_full_tenant: boolean;
  upgraded_at: string | null;
  upgraded_by: string | null;
  rows_by_source: { upload: number; synced: number };
}

interface UploadRowResult {
  line: number;
  esi_id: string | null;
  status: "inserted" | "updated" | "error";
  errors?: string[];
}

interface Discrepancy {
  esi_id: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  detected_at: string | null;
}

export default function PortfolioContractsUploadPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [status, setStatus] = useState<Status | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(false);

  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const [uploadResult, setUploadResult] = useState<{ inserted: number; updated: number; errors: number; total_rows: number; rows: UploadRowResult[] } | null>(null);

  const [upgrading, setUpgrading] = useState(false);
  const [upgradeErr, setUpgradeErr] = useState("");
  const [upgradeResult, setUpgradeResult] = useState<string>("");
  const [confirmUpgrade, setConfirmUpgrade] = useState(false);

  const [discrepancies, setDiscrepancies] = useState<Discrepancy[]>([]);
  const [showDiscrepancies, setShowDiscrepancies] = useState(false);

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
      const res = await api.get("/admin/portfolio-contracts/status");
      setStatus(res.data);
    } catch {
      setStatus(null);
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

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setUploading(true);
    setErr("");
    setUploadResult(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/admin/portfolio-contracts/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setUploadResult(res.data);
      setFile(null);
      await loadStatus();
    } catch (e: any) {
      setErr(e?.response?.data?.detail ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const handleUpgrade = async () => {
    setUpgrading(true);
    setUpgradeErr("");
    setUpgradeResult("");
    try {
      const res = await api.post("/admin/portfolio-contracts/upgrade");
      setUpgradeResult(
        `Upgraded. ${res.data.discrepancies_found} discrepancy field(s) logged, ` +
          `${res.data.upload_rows_cleared} old upload row(s) cleared, ` +
          `${res.data.synced_rows_backfilled} row(s) backfilled from contract_renewal.`
      );
      setConfirmUpgrade(false);
      await loadStatus();
    } catch (e: any) {
      setUpgradeErr(e?.response?.data?.detail ?? "Upgrade failed.");
    } finally {
      setUpgrading(false);
    }
  };

  const handleDownload = async (kind: "template" | "sample") => {
    try {
      const res = await api.get(`/admin/portfolio-contracts/${kind}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `portfolio_contracts_${kind}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch {
      alert(`Failed to download ${kind} file.`);
    }
  };

  const loadDiscrepancies = async () => {
    setShowDiscrepancies(true);
    try {
      const res = await api.get("/admin/portfolio-contracts/upgrade-report");
      setDiscrepancies(res.data.discrepancies ?? []);
    } catch {
      setDiscrepancies([]);
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
              Portfolio Contracts
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
              Portfolio-only tenants upload contract data here. Full-platform tenants sync it
              automatically from contract_renewal instead — upload is blocked once upgraded.
            </p>
          </div>
          {user && <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>{user.username}</span>}
        </div>

        <div
          className="p-4 rounded-[var(--r-lg)] border mb-6 flex items-center justify-between"
          style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>
              {loadingStatus ? "Loading status…" : status?.is_full_tenant ? "Full platform (auto-sync)" : "Portfolio-only (manual upload)"}
            </p>
            {status && (
              <p className="text-xs mt-1" style={{ color: "var(--ct-text-muted)" }}>
                {status.rows_by_source.upload} uploaded row(s), {status.rows_by_source.synced} synced row(s)
                {status.is_full_tenant && status.upgraded_at && (
                  <> — upgraded {new Date(status.upgraded_at).toLocaleString()} by {status.upgraded_by ?? "unknown"}</>
                )}
              </p>
            )}
          </div>
          <button
            onClick={loadDiscrepancies}
            className="text-xs underline hover:opacity-80"
            style={{ color: "var(--accent-light)" }}
          >
            View upgrade discrepancy report
          </button>
        </div>

        {showDiscrepancies && (
          <div
            className="rounded-[var(--r-lg)] border overflow-hidden mb-6"
            style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
          >
            <div className="px-4 py-3 border-b" style={{ borderColor: "var(--ct-border-default)" }}>
              <h2 className="text-sm font-semibold" style={{ color: "var(--ct-text-primary)" }}>Upgrade Discrepancies</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: "var(--ct-text-muted)" }}>
                    <th className="text-left px-4 py-2">ESI ID</th>
                    <th className="text-left px-4 py-2">Field</th>
                    <th className="text-left px-4 py-2">Old (uploaded)</th>
                    <th className="text-left px-4 py-2">New (synced)</th>
                    <th className="text-left px-4 py-2">Detected</th>
                  </tr>
                </thead>
                <tbody>
                  {discrepancies.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-sm" style={{ color: "var(--ct-text-muted)" }}>
                        No discrepancies logged.
                      </td>
                    </tr>
                  )}
                  {discrepancies.map((d, i) => (
                    <tr key={i} className="border-t" style={{ borderColor: "var(--ct-border-default)" }}>
                      <td className="px-4 py-2" style={{ color: "var(--ct-text-primary)" }}>{d.esi_id}</td>
                      <td className="px-4 py-2" style={{ color: "var(--ct-text-secondary)" }}>{d.field_name}</td>
                      <td className="px-4 py-2" style={{ color: "var(--ct-text-secondary)" }}>{d.old_value ?? "—"}</td>
                      <td className="px-4 py-2" style={{ color: "var(--ct-text-secondary)" }}>{d.new_value ?? "—"}</td>
                      <td className="px-4 py-2" style={{ color: "var(--ct-text-secondary)" }}>{d.detected_at ? new Date(d.detected_at).toLocaleString() : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!status?.is_full_tenant && (
          <form
            onSubmit={handleUpload}
            className="grid grid-cols-1 gap-4 p-6 rounded-[var(--r-lg)] border mb-8"
            style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
          >
            <div>
              <label className="block text-sm font-medium mb-1" style={{ color: "var(--ct-text-secondary)" }}>
                Contract CSV
              </label>
              <p className="text-xs mb-2" style={{ color: "var(--ct-text-muted)" }}>
                Required columns: esi_id, load_profile, contract_rate, annual_volume, contract_type, contract_end_date (MM/DD/YYYY or YYYY-MM-DD).
                Optional: contract_start_date (blank defaults to today).
                Contract types: Fix (fixed $/kWh), LMP (market rate + spread), MTM (month-to-month), Future (signed but not yet active — use with a future contract_start_date; impacts forecasts from that start date forward, not today).
                Re-uploading updates existing rows by esi_id — it does not clear the table first. Changing a row from Future to Fix/LMP/MTM automatically moves it to the active forecast.
              </p>
              <div className="flex gap-4 mb-3">
                <button
                  type="button"
                  onClick={() => handleDownload("template")}
                  className="text-xs underline hover:opacity-80"
                  style={{ color: "var(--accent-light)" }}
                >
                  Download blank template
                </button>
                <button
                  type="button"
                  onClick={() => handleDownload("sample")}
                  className="text-xs underline hover:opacity-80"
                  style={{ color: "var(--accent-light)" }}
                >
                  Download sample file (3 example rows)
                </button>
              </div>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-[var(--accent-light-tint)] file:text-[var(--accent-light)]"
                style={{ color: "var(--ct-text-secondary)" }}
              />
            </div>

            {err && <div className="text-sm" style={{ color: "var(--danger-light)" }}>{err}</div>}

            {uploadResult && (
              <div className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
                {uploadResult.inserted} inserted, {uploadResult.updated} updated, {uploadResult.errors} error(s) of {uploadResult.total_rows} row(s).
                {uploadResult.errors > 0 && (
                  <ul className="mt-2 list-disc pl-5" style={{ color: "var(--danger-light)" }}>
                    {uploadResult.rows.filter((r) => r.status === "error").map((r) => (
                      <li key={r.line}>Line {r.line} ({r.esi_id ?? "no esi_id"}): {r.errors?.join("; ")}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <button
              type="submit"
              disabled={!file || uploading}
              className="w-full font-bold py-2 px-4 rounded-[var(--r-md)] transition-colors disabled:opacity-50"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              {uploading ? "Uploading…" : "Upload Contracts"}
            </button>
          </form>
        )}

        {status?.is_full_tenant === false && (
          <div
            className="p-6 rounded-[var(--r-lg)] border"
            style={{ background: "var(--ct-surface)", borderColor: "var(--danger-light)" }}
          >
            <h2 className="text-sm font-semibold mb-1" style={{ color: "var(--ct-text-primary)" }}>
              Upgrade to full-platform sync
            </h2>
            <p className="text-xs mb-3" style={{ color: "var(--ct-text-muted)" }}>
              One-time, irreversible action for when this tenant purchases the full ORBIC platform
              (Sales/Operations/Portfolio/Audit). Requires TENANT_MODULES to already be set to all
              four modules (or "enterprise") before this can run. Compares every uploaded contract
              against what contract_renewal would sync, logs every difference to the discrepancy
              report above, then clears the uploaded rows and backfills real synced data.
            </p>
            {upgradeErr && <div className="text-sm mb-2" style={{ color: "var(--danger-light)" }}>{upgradeErr}</div>}
            {upgradeResult && <div className="text-sm mb-2" style={{ color: "var(--success-light)" }}>{upgradeResult}</div>}
            {!confirmUpgrade ? (
              <button
                onClick={() => setConfirmUpgrade(true)}
                className="text-sm font-semibold py-2 px-4 rounded-[var(--r-md)]"
                style={{ background: "var(--danger-light)", color: "#fff" }}
              >
                Upgrade this tenant…
              </button>
            ) : (
              <div className="flex gap-2 items-center">
                <span className="text-sm" style={{ color: "var(--ct-text-primary)" }}>Confirm: this cannot be undone.</span>
                <button
                  onClick={handleUpgrade}
                  disabled={upgrading}
                  className="text-sm font-semibold py-2 px-4 rounded-[var(--r-md)] disabled:opacity-50"
                  style={{ background: "var(--danger-light)", color: "#fff" }}
                >
                  {upgrading ? "Upgrading…" : "Yes, upgrade now"}
                </button>
                <button
                  onClick={() => setConfirmUpgrade(false)}
                  className="text-sm py-2 px-4 rounded-[var(--r-md)] border"
                  style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
