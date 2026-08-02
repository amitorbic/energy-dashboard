import React, { useState, useEffect } from "react";
import api from "../../utils/api";

interface DailyMatrixRow {
  zone: string;
  [key: string]: string | number;
}

interface TableProps {
  startMonthLabel: string;
  startDate: string;
  terms: number[];
  priceType: string;
}

const DailyMatrixTable: React.FC<TableProps> = ({
  startMonthLabel,
  startDate,
  terms,
  priceType,
}) => {
  const [data, setData] = useState<DailyMatrixRow[]>([]);
  const [actualTerms, setActualTerms] = useState<number[]>(terms ?? []);

  const lfs =
    priceType === "residential" || priceType === "sweetspot_residential"
      ? ["Residential"]
      : ["Low", "Medium", "High"];

  useEffect(() => {
    const termString = terms.join(",");

    // Instead of setLoading(true), we just fetch.
    // The loading state is handled by the data check below.
    api
      .get(
        `/pricing/daily-matrix?start_month=${startDate}&terms=${termString}&price_type=${priceType}`,
      )
      .then((res) => {
        const isSweetspot = priceType.includes("sweetspot");

        if (isSweetspot && res.data.terms && res.data.matrix) {
          setActualTerms(res.data.terms);
          setData(res.data.matrix);
        } else {
          setActualTerms(terms);
          setData(Array.isArray(res.data) ? res.data : res.data.matrix || []);
        }
      })
      .catch((err) => {
        console.error("Matrix fetch failed:", err);
        setData([]); // Clear data on error to stop loading spinner
      });
  }, [startDate, terms, priceType]);

  // This replaces 'if (loading)'
  if (!data) {
    return (
      <div className="p-10 text-center animate-pulse italic" style={{ color: "var(--ct-text-muted)" }}>
        Calculating {startMonthLabel} Matrix...
      </div>
    );
  }

  return (
    <div
      className="rounded-[var(--r-lg)] border overflow-hidden mb-10"
      style={{ background: "var(--ct-surface)", borderColor: "var(--ct-border-default)", boxShadow: "var(--shadow-content)" }}
    >
      <div
        className="p-4 border-b flex justify-between items-center"
        style={{ borderColor: "var(--ct-border-default)" }}
      >
        <div>
          <h2 className="font-bold text-lg" style={{ color: "var(--accent-light)" }}>
            {startMonthLabel} Start
          </h2>
          <span className="text-xs font-mono" style={{ color: "var(--ct-text-muted)" }}>{startDate}</span>
        </div>
        <div className="h-1 w-24 rounded-[var(--r-full)]" style={{ background: "var(--accent-light)" }}></div>
      </div>

      <table className="w-full text-xs text-center border-collapse">
        <thead>
          <tr className="font-bold" style={{ color: "var(--ct-text-primary)" }}>
            <th className="p-3 text-left w-32 border-r" style={{ borderColor: "var(--ct-border-default)" }}></th>
            {lfs.map((lf) => (
              <th
                key={lf}
                colSpan={actualTerms.length}
                className="border-b-2 p-2 text-sm border-x"
                style={{ borderColor: "var(--ct-border-subtle)" }}
              >
                {lf} Load Factor
              </th>
            ))}
          </tr>
          <tr className="border-b" style={{ color: "var(--ct-text-muted)", background: "var(--ct-surface-hover)" }}>
            <th className="p-2 border-r font-normal" style={{ color: "var(--ct-text-muted)", borderColor: "var(--ct-border-default)" }}>Zone</th>
            {lfs.map((lf) =>
              actualTerms.map((t) => (
                <th
                  key={`${lf}-${t}`}
                  className="p-2 w-12 font-bold underline border-x"
                  style={{ textDecorationColor: "var(--ct-border-default)", borderColor: "var(--ct-border-subtle)" }}
                >
                  {t}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {data.map((row) => (
            <tr
              key={row.zone}
              className="transition-colors border-b last:border-0 hover:bg-[var(--ct-surface-hover)]"
              style={{ borderColor: "var(--ct-border-subtle)" }}
            >
              <td
                className="p-3 text-left font-semibold border-r"
                style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-default)", background: "var(--ct-surface-hover)" }}
              >
                {row.zone}
              </td>
              {lfs.map((lf) =>
                actualTerms.map((t) => (
                  <td
                    key={`val-${lf}-${t}`}
                    className="p-2 font-mono border-x"
                    style={{ color: "var(--ct-text-secondary)", borderColor: "var(--ct-border-subtle)" }}
                  >
                    {row[`${lf}_${t}`] ?? "N/A"}
                  </td>
                )),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-1.5" style={{ background: "var(--accent-light)" }}></div>
    </div>
  );
};

export default DailyMatrixTable;
