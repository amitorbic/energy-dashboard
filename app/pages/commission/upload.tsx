import { useState } from "react";
import { useRouter } from "next/router";
import Link from "next/link";
import api from "../../utils/api";

export default function UploadCommission() {
  const router = useRouter();
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [missingBrokers, setMissingBrokers] = useState<string[]>([]);
  const [noCommissionId, setNoCommissionId] = useState<string[]>([]);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadedMonth, setUploadedMonth] = useState<string | null>(null);

  const uid = 1;
  const userName = "admin";
  async function handleDownloadPaymentSheet(month: string) {
    try {
      const res = await api.get(`/commission/payment-sheet/download?month=${month}`, { responseType: 'blob' });
      const blob: Blob = res.data;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const cd = (res.headers['content-disposition'] as string) || "";
      const match = cd.match(/filename=(.+)/);
      a.download = match ? match[1] : `payment_sheet_${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { return; }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !startDate || !endDate) {
      setError("Please fill in all fields and select a file.");
      return;
    }

    setLoading(true);
    setError(null);
    setMissingBrokers([]);
    setNoCommissionId([]);
    setSuccess(null);

    try {
      const toMMDDYYYY = (d: string) => {
        const [y, m, day] = d.split("-");
        return `${m}/${day}/${y}`;
      };
      const form = new FormData();
      form.append("file", file);
      form.append("start_date", toMMDDYYYY(startDate));
      form.append("end_date", toMMDDYYYY(endDate));
      form.append("uid", String(uid));
      form.append("user_name", userName);

      const res = await api.post('/commission/upload', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const json = res.data;
      setSuccess(
        `Successfully uploaded ${json.inserted} rows for ${json.month} ${json.year}. Commission calculated automatically.`,
      );
      setUploadedMonth(
        `${json.year}-${String(new Date().getMonth() + 1).padStart(2, "0")}`,
      );
    } catch (err: unknown) {
      const errRes = (err as { response?: { status?: number; data?: { detail?: unknown } } })?.response;
      const detail = errRes?.data?.detail;
      if (errRes?.status === 422 && detail && typeof detail === 'object') {
        const d = detail as { message?: string; missing_brokers?: string[]; no_commission_id?: string[] };
        setMissingBrokers(d.missing_brokers || []);
        setNoCommissionId(d.no_commission_id || []);
        setError(d.message || 'Validation error.');
      } else {
        setError(typeof detail === 'string' ? detail : "Network error. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <h1 className="text-xl font-semibold text-gray-800">Commission Data</h1>
        <p className="text-sm text-gray-500 mt-0.5">Upload Commission File</p>
      </div>

      <div className="flex">
        <main className="flex-1 p-8">
          <div className="max-w-lg">
            <h2 className="text-lg font-semibold text-orange-600 mb-1">
              Add Commission Data
            </h2>
            <hr className="border-gray-200 mb-6" />

            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded text-green-800 text-sm">
                {success}
              </div>
            )}
            {uploadedMonth && (
              <div className="mt-4 flex items-center gap-4">
                <button
                  onClick={() => handleDownloadPaymentSheet(uploadedMonth)}
                  className="bg-green-600 text-white px-5 py-2 rounded text-sm font-medium hover:bg-green-700"
                >
                  Download Payment Sheet
                </button>
                <a
                  href="/commission/view"
                  className="text-sm text-blue-600 hover:underline"
                >
                  Go to View Data →
                </a>
              </div>
            )}

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                <p className="font-medium">{error}</p>
                {missingBrokers.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-sm mb-1">
                      Not in Broker Database — add these first:
                    </p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {missingBrokers.map((b) => (
                        <span
                          key={b}
                          className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs font-mono"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                    {/* 3. Use <Link> for error navigation */}
                    <Link
                      href="/broker/add"
                      className="text-xs text-blue-600 underline"
                    >
                      Go to Broker Database to add them →
                    </Link>
                  </div>
                )}
                {noCommissionId.length > 0 && (
                  <div className="mt-2">
                    <p className="font-medium text-sm mb-1">
                      Commission ID not generated for these brokers:
                    </p>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {noCommissionId.map((b) => (
                        <span
                          key={b}
                          className="bg-amber-100 text-amber-700 px-2 py-0.5 rounded text-xs font-mono"
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                    {/* 4. Use <Link> for error navigation */}
                    <Link
                      href="/broker"
                      className="text-xs text-blue-600 underline"
                    >
                      Go to Broker Database to generate Commission IDs →
                    </Link>
                  </div>
                )}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="flex items-center gap-4">
                <label className="w-40 text-sm text-gray-700 text-right flex-shrink-0">
                  Enter Start Date :
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48 focus:outline-none"
                  required
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="w-40 text-sm text-gray-700 text-right flex-shrink-0">
                  Enter End Date :
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm w-48 focus:outline-none"
                  required
                />
              </div>
              <div className="flex items-center gap-4">
                <label className="w-40 text-sm text-gray-700 text-right flex-shrink-0">
                  Upload File :
                </label>
                <div>
                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                    className="text-sm text-gray-700 border border-gray-300 rounded px-2 py-1"
                    required
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Accepts .xlsx or .xls files
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-40" />
                <button
                  type="submit"
                  disabled={loading}
                  className={`px-6 py-2 rounded text-white text-sm font-medium ${loading ? "bg-gray-400" : "bg-orange-500 hover:bg-orange-600"}`}
                >
                  {loading ? "Uploading..." : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
