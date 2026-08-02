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
            <p className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
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
            className="rounded-[var(--r-lg)] border p-4 flex items-center gap-3"
            style={result.status === "COMPLETED"
              ? { background: "var(--success-light-tint)", borderColor: "var(--success-light-tint)" }
              : { background: "var(--amber-light-tint)", borderColor: "var(--amber-light-tint)" }}
          >
            <span className="text-2xl">
              {result.status === "COMPLETED" ? "✓" : "⚠"}
            </span>
            <div>
              <p
                className="font-semibold"
                style={{ color: result.status === "COMPLETED" ? "var(--success-light)" : "var(--amber-light)" }}
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
                color: "var(--success-light)",
              },
              {
                label: "Updated",
                value: result.updated ?? 0,
                color: "var(--info-light)",
              },
              {
                label: "Skipped",
                value: result.skipped ?? 0,
                color: "var(--ct-text-muted)",
              },
              {
                label: "Errors",
                value: result.errors.length,
                color:
                  result.errors.length > 0 ? "var(--danger-light)" : "var(--ct-text-muted)",
              },
            ].map((s) => (
              <div
                key={s.label}
                className="rounded-[var(--r-lg)] border px-4 py-4"
                style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)" }}
              >
                <p className="text-xs mb-1" style={{ color: "var(--ct-text-muted)" }}>{s.label}</p>
                <p className="text-2xl font-semibold" style={{ color: s.color }}>
                  {fmt(s.value)}
                </p>
              </div>
            ))}
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-[var(--r-lg)] border overflow-hidden" style={{ background: "var(--ct-surface)", borderColor: "var(--danger-light-tint)" }}>
              <div className="px-4 py-2 text-xs font-medium border-b" style={{ background: "var(--danger-light-tint)", color: "var(--danger-light)", borderColor: "var(--danger-light-tint)" }}>
                {result.errors.length} rows skipped
              </div>
              {result.errors.slice(0, 10).map((e, i) => (
                <div
                  key={i}
                  className="px-4 py-2 text-xs flex gap-4 border-b last:border-0"
                  style={{ borderColor: "var(--ct-border-subtle)" }}
                >
                  <span style={{ color: "var(--ct-text-muted)" }}>Row {e.row}</span>
                  <span className="font-mono" style={{ color: "var(--ct-text-secondary)" }}>{e.esiid}</span>
                  <span style={{ color: "var(--danger-light)" }}>{e.error}</span>
                </div>
              ))}
              {result.errors.length > 10 && (
                <p className="px-4 py-2 text-xs" style={{ color: "var(--ct-text-muted)" }}>
                  ...and {result.errors.length - 10} more
                </p>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={() => router.push("/past-due")}
              className="px-5 py-2 text-sm rounded-[var(--r-sm)] font-medium transition-colors"
              style={{ background: "var(--accent-light)", color: "var(--accent-light-on-solid)" }}
            >
              View collections
            </button>
            <button
              onClick={() => setResult(null)}
              className="px-4 py-2 text-sm rounded-[var(--r-sm)] border transition-colors hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-default)", color: "var(--ct-text-secondary)" }}
            >
              Upload another
            </button>
          </div>
        </div>
      )}
    </PastDueLayout>
  );
}
