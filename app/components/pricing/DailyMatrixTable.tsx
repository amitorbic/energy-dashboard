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
      <div className="p-10 text-slate-500 text-center animate-pulse italic">
        Calculating {startMonthLabel} Matrix...
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden mb-10">
      <div className="p-4 bg-white border-b flex justify-between items-center">
        <div>
          <h2 className="text-red-600 font-bold text-lg">
            {startMonthLabel} Start
          </h2>
          <span className="text-slate-400 text-xs font-mono">{startDate}</span>
        </div>
        <div className="h-1 bg-red-600 w-24 rounded-full"></div>
      </div>

      <table className="w-full text-xs text-center border-collapse">
        <thead>
          <tr className="bg-white text-slate-800 font-bold">
            <th className="p-3 text-left w-32 border-r"></th>
            {lfs.map((lf) => (
              <th
                key={lf}
                colSpan={actualTerms.length}
                className="border-b-2 border-slate-100 p-2 text-sm border-x"
              >
                {lf} Load Factor
              </th>
            ))}
          </tr>
          <tr className="text-slate-500 border-b bg-slate-50/50">
            <th className="p-2 border-r text-slate-400 font-normal">Zone</th>
            {lfs.map((lf) =>
              actualTerms.map((t) => (
                <th
                  key={`${lf}-${t}`}
                  className="p-2 w-12 font-bold underline decoration-slate-300 border-x"
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
              className="hover:bg-slate-50 transition-colors border-b last:border-0"
            >
              <td className="p-3 text-left font-semibold text-slate-700 border-r bg-slate-50/30">
                {row.zone}
              </td>
              {lfs.map((lf) =>
                actualTerms.map((t) => (
                  <td
                    key={`val-${lf}-${t}`}
                    className="p-2 text-slate-600 font-mono border-x"
                  >
                    {row[`${lf}_${t}`] ?? "N/A"}
                  </td>
                )),
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="h-1.5 bg-red-600"></div>
    </div>
  );
};

export default DailyMatrixTable;
