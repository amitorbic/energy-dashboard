import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { Upload, CheckCircle, AlertTriangle } from "lucide-react";
import Layout from "../../components/Layout";
import api from "../../utils/api";
import { isLoggedIn, isAdmin } from "../../utils/auth";

interface User {
  uid: number;
  name: string;
  status: number;
}

export default function AdminUploadPage() {
  const router = useRouter();
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUid, setSelectedUid] = useState<number | "">("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ inserted: number } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isLoggedIn() || !isAdmin()) { router.replace("/login"); return; }
    api.get("/admin/users")
      .then((res) => {
        const customers = (res.data as User[]).filter((u) => u.status === 1);
        setUsers(customers);
      })
      .catch(() => setError("Failed to load users"));
  }, [router]);

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedUid || !file) { setError("Please select a user and a file"); return; }
    setError("");
    setResult(null);
    setLoading(true);
    const formData = new FormData();
    formData.append("uid", String(selectedUid));
    formData.append("file", file);
    try {
      const res = await api.post("/admin/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult({ inserted: res.data.inserted });
      setFile(null);
      setSelectedUid("");
    } catch (err: unknown) {
      const msg =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { detail?: string } } }).response?.data?.detail
          : undefined;
      setError(msg || "Upload failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout title="Upload Meter Data">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Upload Meter Data</h2>
            <p className="text-gray-500 text-sm mt-1">
              Import ESI IDs from an Excel file for a customer
            </p>
          </div>
          <button
            onClick={() => router.push("/admin")}
            className="text-gray-500 hover:text-gray-700 text-sm"
          >
            ← Admin
          </button>
        </div>

        {result && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-5 mb-6 flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-semibold text-green-800">Upload Successful</p>
              <p className="text-green-700 text-sm mt-1">
                {result.inserted} meter{result.inserted !== 1 ? "s" : ""} imported successfully.
              </p>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-6 flex items-start gap-3">
            <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
            <p className="text-amber-800 text-sm">
              <strong>Warning:</strong> Uploading will replace all existing meter data for the selected customer.
            </p>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-5">
              {error}
            </div>
          )}

          <form onSubmit={handleUpload} className="space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Select Customer <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedUid}
                onChange={(e) => setSelectedUid(e.target.value ? Number(e.target.value) : "")}
                required
                className="w-full border border-gray-300 rounded-lg px-4 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-white"
              >
                <option value="">— Choose a customer —</option>
                {users.map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Excel File (.xlsx) <span className="text-red-500">*</span>
              </label>
              <div className="border-2 border-dashed border-gray-300 hover:border-blue-400 rounded-xl p-6 text-center transition-colors">
                <Upload className="h-8 w-8 text-gray-400 mx-auto mb-3" />
                {file ? (
                  <div>
                    <p className="text-gray-900 font-medium text-sm">{file.name}</p>
                    <p className="text-gray-400 text-xs mt-1">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-red-500 hover:underline text-xs mt-2"
                    >
                      Remove
                    </button>
                  </div>
                ) : (
                  <label className="cursor-pointer">
                    <span className="text-blue-600 hover:underline text-sm font-medium">
                      Choose file
                    </span>
                    <span className="text-gray-500 text-sm"> or drag and drop</span>
                    <p className="text-gray-400 text-xs mt-1">
                      Excel format: ESI ID | Address | Unit | City | ZIP (row 2 onwards)
                    </p>
                    <input
                      type="file"
                      accept=".xlsx,.xls"
                      onChange={(e) => setFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                )}
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={loading || !selectedUid || !file}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold py-2.5 rounded-lg text-sm transition-colors flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                    </svg>
                    Uploading...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4" />
                    Upload & Replace Meters
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="mt-5 bg-gray-50 border border-gray-200 rounded-xl p-4">
          <p className="text-xs font-semibold text-gray-600 mb-2">Expected Excel Format</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  {["Column A", "Column B", "Column C", "Column D", "Column E"].map((h) => (
                    <th key={h} className="p-2 text-left text-gray-500 bg-gray-100 border border-gray-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  {["ESI ID", "Service Address", "Unit Number", "City", "ZIP Code"].map((v) => (
                    <td key={v} className="p-2 text-gray-700 border border-gray-200">{v}</td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="text-gray-400 text-xs mt-2">Row 1 = headers (skipped). Data starts at row 2.</p>
        </div>
      </div>
    </Layout>
  );
}
