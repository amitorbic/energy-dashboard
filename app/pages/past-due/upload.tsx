import { useState } from "react";
import { useRouter } from "next/router";
import PastDueLayout from "../../components/PastDueLayout";
import ColumnMapper, { ImportResult } from "../../components/ColumnMapper";

export default function CollectionsUploadPage() {
  const router = useRouter();
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleComplete = (res: ImportResult) => {
    setResult(res);
  };

  const fmt = (n: number) => new Intl.NumberFormat("en-US").format(n);

  return (
    <PastDueLayout title="Import AR Sheet">
      {!result ? (
        <div className="max-w-4xl">
          <div className="mb-5">
            <p className="text-sm text-gray-500">
              Upload your weekly AR summary sheet. Any column format works — map
              your columns to system fields and your mapping saves for next
              time.
            </p>
          </div>
          <ColumnMapper
            fileType="AR_SHEET"
            onComplete={handleComplete}
            onCancel={() => router.push("/past-due")}
          />
        </div>
      ) : (
        <div className="max-w-xl space-y-5">
          {/* Result */}
          <div
            className={`rounded-lg border p-4 flex items-center gap-3
            ${
              result.status === "COMPLETED"
                ? "bg-green-50 border-green-200"
                : "bg-amber-50 border-amber-200"
            }`}
          >
            <span className="text-2xl">
              {result.status === "COMPLETED" ? "✓" : "⚠"}
            </span>
            <div>
              <p
                className={`font-semibold ${result.status === "COMPLETED" ? "text-green-800" : "text-amber-800"}`}
              >
                {result.status === "COMPLETED"
                  ? "Import complete"
                  : "Import complete with errors"}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-3">
            {[
              {
                label: "Created",
                value: result.created ?? 0,
                color: "text-green-600",
              },
              {
                label: "Updated",
                value: result.updated ?? 0,
                color: "text-blue-600",
              },
              {
                label: "Skipped",
                value: result.skipped ?? 0,
                color: "text-gray-400",
              },
              {
                label: "Errors",
                value: result.errors.length,
                color:
                  result.errors.length > 0 ? "text-red-600" : "text-gray-400",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="bg-white rounded-lg border border-gray-200 px-4 py-4"
              >
                <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                <p className={`text-2xl font-semibold ${s.color}`}>
                  {fmt(s.value)}
                </p>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div className="bg-white rounded-lg border border-red-200 overflow-hidden">
              <div className="bg-red-50 px-4 py-2 text-xs font-medium text-red-600 border-b border-red-200">
                {result.errors.length} rows skipped
              </div>
              {result.errors.slice(0, 10).map((e, i) => (
                <div
                  key={i}
                  className="px-4 py-2 text-xs flex gap-4 border-b border-gray-100 last:border-0"
                >
                  <span className="text-gray-400">Row {e.row}</span>
                  <span className="font-mono text-gray-500">{e.esiid}</span>
                  <span className="text-red-500">{e.error}</span>
                </div>
              ))}
              {result.errors.length > 10 && (
                <p className="px-4 py-2 text-xs text-gray-400">
                  ...and {result.errors.length - 10} more
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => router.push("/past-due")}
              className="px-5 py-2 text-sm bg-sky-500 hover:bg-sky-600 text-white rounded font-medium transition-colors"
            >
              View collections
            </button>
            <button
              onClick={() => setResult(null)}
              className="px-4 py-2 text-sm border border-gray-300 rounded text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Upload another
            </button>
          </div>
        </div>
      )}
    </PastDueLayout>
  );
}
