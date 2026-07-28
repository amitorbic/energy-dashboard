import { useState } from "react";
import Layout from "../components/Layout";
import api from "../utils/api";

interface EsiRecord {
  esi_id: string;
  address: string | null;
  address_overflow: string | null;
  city: string | null;
  state: string | null;
  zipcode: string | null;
  county: string | null;
  duns: string | null;
  meter_read_cycle: string | null;
  status: string | null;
  premise_type: string | null;
  power_region: string | null;
  stationcode: string | null;
  stationname: string | null;
  metered: string | null;
  open_service_orders: string | null;
  polr_customer_class: string | null;
  settlement_ams_indicator: string | null;
  tdsp_ams_indicator: string | null;
  switch_hold_indicator: string | null;
  premise_subtype_code: string | null;
  premise_subtype_desc: string | null;
}

type BatchStatus = "pending" | "loading" | "found" | "not_found" | "error";

interface BatchItem {
  esiId: string;
  status: BatchStatus;
  data?: EsiRecord;
  error?: string;
}

const LIMIT_OPTIONS = [50, 100, 200, 500, 1000];
const PAGE_SIZE = 25;
const MAX_BATCH_IDS = 100;

function Field({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-0.5">{label}</p>
      <p className={`text-sm text-gray-800 ${mono ? "font-mono" : ""}`}>{value || "—"}</p>
    </div>
  );
}

function ModeTabs({ mode, onChange }: { mode: "direct" | "address"; onChange: (m: "direct" | "address") => void }) {
  const tabs: { key: "direct" | "address"; label: string }[] = [
    { key: "direct", label: "Direct ESI ID Lookup" },
    { key: "address", label: "Address Search" },
  ];
  return (
    <div className="flex gap-1 border-b border-gray-200 mb-5">
      {tabs.map((t) => (
        <button
          key={t.key}
          onClick={() => onChange(t.key)}
          className={`px-4 py-2 text-sm font-medium rounded-t transition-colors ${
            mode === t.key
              ? "bg-white border border-b-white border-gray-200 text-sky-700 -mb-px"
              : "text-gray-500 hover:text-gray-800"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export default function EsiSearch() {
  const [mode, setMode] = useState<"direct" | "address">("direct");

  // Direct lookup state
  const [directSubMode, setDirectSubMode] = useState<"single" | "batch">("single");
  const [esiIdInput, setEsiIdInput] = useState("");
  const [directResult, setDirectResult] = useState<EsiRecord | null>(null);
  const [directLoading, setDirectLoading] = useState(false);
  const [directError, setDirectError] = useState<string | null>(null);
  const [directSearched, setDirectSearched] = useState(false);

  // Batch ESI ID lookup state
  const [batchInput, setBatchInput] = useState("");
  const [batchItems, setBatchItems] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchValidationError, setBatchValidationError] = useState<string | null>(null);

  // Address search state
  const [zipcode, setZipcode] = useState("");
  const [city, setCity] = useState("");
  const [address, setAddress] = useState("");
  const [limit, setLimit] = useState(200);
  const [results, setResults] = useState<EsiRecord[]>([]);
  const [resultCount, setResultCount] = useState<number | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  async function lookupEsiId() {
    const id = esiIdInput.trim();
    if (!id) return;
    setDirectLoading(true);
    setDirectError(null);
    setDirectResult(null);
    setDirectSearched(true);
    try {
      const res = await api.get(`/esi-master/${encodeURIComponent(id)}`);
      setDirectResult(res.data);
    } catch (e: any) {
      if (e?.response?.status === 404) {
        setDirectError(`No record found for ESI ID "${id}".`);
      } else {
        setDirectError(e?.response?.data?.detail || "Lookup failed. Please try again.");
      }
    } finally {
      setDirectLoading(false);
    }
  }

  function parseBatchIds(raw: string): string[] {
    const ids = raw
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set(ids));
  }

  async function runBatchLookup() {
    const ids = parseBatchIds(batchInput);
    if (ids.length === 0) {
      setBatchValidationError("Enter at least one ESI ID.");
      return;
    }
    if (ids.length > MAX_BATCH_IDS) {
      setBatchValidationError(
        `Too many ESI IDs (${ids.length}) — limit is ${MAX_BATCH_IDS} per batch. Please split into smaller batches.`
      );
      return;
    }
    setBatchValidationError(null);

    const snapshot: BatchItem[] = ids.map((esiId) => ({ esiId, status: "pending" }));
    setBatchItems(snapshot);
    setBatchRunning(true);

    // Sequential, one at a time — same client-side-loop-over-single-item-endpoint
    // pattern used by the EDI upload queue, so one bad ESI ID never blocks the rest.
    for (let i = 0; i < snapshot.length; i++) {
      setBatchItems((items) => items.map((it, j) => (j === i ? { ...it, status: "loading" } : it)));
      try {
        const res = await api.get(`/esi-master/${encodeURIComponent(snapshot[i].esiId)}`);
        setBatchItems((items) =>
          items.map((it, j) => (j === i ? { ...it, status: "found", data: res.data } : it))
        );
      } catch (e: any) {
        if (e?.response?.status === 404) {
          setBatchItems((items) => items.map((it, j) => (j === i ? { ...it, status: "not_found" } : it)));
        } else {
          setBatchItems((items) =>
            items.map((it, j) =>
              j === i ? { ...it, status: "error", error: e?.response?.data?.detail || "Lookup failed" } : it
            )
          );
        }
      }
    }
    setBatchRunning(false);
  }

  async function runAddressSearch() {
    const zip = zipcode.trim();
    const cityVal = city.trim();
    if (!zip || !cityVal) {
      setValidationError("Both Zipcode and City are required to search.");
      return;
    }
    setValidationError(null);
    setSearchLoading(true);
    setSearchError(null);
    setPage(1);
    try {
      const params: Record<string, string | number> = { zipcode: zip, city: cityVal, limit };
      if (address.trim()) params.address = address.trim();
      const res = await api.get("/esi-master/search", { params });
      setResults(res.data.results || []);
      setResultCount(res.data.count ?? (res.data.results || []).length);
    } catch (e: any) {
      if (e?.response?.status === 400) {
        setSearchError(e?.response?.data?.detail || "Both Zipcode and City are required.");
      } else {
        setSearchError(e?.response?.data?.detail || "Search failed. Please try again.");
      }
      setResults([]);
      setResultCount(null);
    } finally {
      setSearchLoading(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(results.length / PAGE_SIZE));
  const pagedResults = results.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <Layout title="ESI ID Search">
      <div className="space-y-4">
        <ModeTabs mode={mode} onChange={setMode} />

        {mode === "direct" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <button
                onClick={() => setDirectSubMode("single")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  directSubMode === "single"
                    ? "bg-sky-600 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                Single ESI ID
              </button>
              <button
                onClick={() => setDirectSubMode("batch")}
                className={`px-3 py-1 text-xs font-medium rounded-full transition-colors ${
                  directSubMode === "batch"
                    ? "bg-sky-600 text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                Multiple ESI IDs
              </button>
            </div>

            {directSubMode === "single" && (
              <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-wrap gap-3 items-end">
                <div className="flex-1 min-w-[240px]">
                  <label className="block text-xs text-gray-500 mb-1">ESI ID</label>
                  <input
                    type="text"
                    value={esiIdInput}
                    onChange={(e) => setEsiIdInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && lookupEsiId()}
                    placeholder="e.g. 10443720009112031"
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm font-mono w-full"
                  />
                </div>
                <button
                  onClick={lookupEsiId}
                  disabled={directLoading || !esiIdInput.trim()}
                  className="px-4 py-1.5 bg-sky-600 text-white text-sm font-medium rounded hover:bg-sky-700 disabled:opacity-50"
                >
                  {directLoading ? "Searching…" : "Search"}
                </button>
              </div>
            )}

            {directSubMode === "single" && directError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
                {directError}
              </div>
            )}

            {directSubMode === "single" && directResult && (
              <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-semibold text-gray-900 font-mono">{directResult.esi_id}</h2>
                  {directResult.status && (
                    <span className="inline-block px-2 py-0.5 rounded text-xs bg-sky-100 text-sky-700 font-medium uppercase">
                      {directResult.status}
                    </span>
                  )}
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Location</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field label="Address" value={directResult.address} />
                    <Field label="Address Overflow" value={directResult.address_overflow} />
                    <Field label="City" value={directResult.city} />
                    <Field label="State" value={directResult.state} />
                    <Field label="Zipcode" value={directResult.zipcode} />
                    <Field label="County" value={directResult.county} />
                    <Field label="Power Region" value={directResult.power_region} />
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">TDSP / Meter</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field label="DUNS" value={directResult.duns} mono />
                    <Field label="Meter Read Cycle" value={directResult.meter_read_cycle} />
                    <Field label="Premise Type" value={directResult.premise_type} />
                    <Field label="Premise Subtype Code" value={directResult.premise_subtype_code} />
                    <Field label="Premise Subtype Desc" value={directResult.premise_subtype_desc} />
                    <Field label="Metered" value={directResult.metered} />
                    <Field label="Station Code" value={directResult.stationcode} />
                    <Field label="Station Name" value={directResult.stationname} />
                  </div>
                </div>

                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Indicators</h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Field label="Open Service Orders" value={directResult.open_service_orders} />
                    <Field label="POLR Customer Class" value={directResult.polr_customer_class} />
                    <Field label="Settlement AMS" value={directResult.settlement_ams_indicator} />
                    <Field label="TDSP AMS" value={directResult.tdsp_ams_indicator} />
                    <Field label="Switch Hold" value={directResult.switch_hold_indicator} />
                  </div>
                </div>
              </div>
            )}

            {directSubMode === "single" && !directResult && !directError && directSearched && !directLoading && (
              <p className="text-sm text-gray-400 py-3">No result to display.</p>
            )}

            {directSubMode === "batch" && (
              <div className="space-y-4">
                <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-2">
                  <label className="block text-xs text-gray-500 mb-1">
                    ESI IDs — one per line, or comma-separated (max {MAX_BATCH_IDS})
                  </label>
                  <textarea
                    value={batchInput}
                    onChange={(e) => setBatchInput(e.target.value)}
                    placeholder={"10443720009112031\n10443720000000041\n10443720006149795"}
                    rows={6}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm font-mono w-full"
                  />
                  {batchValidationError && (
                    <p className="text-sm text-red-600">{batchValidationError}</p>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={runBatchLookup}
                      disabled={batchRunning || !batchInput.trim()}
                      className="px-4 py-1.5 bg-sky-600 text-white text-sm font-medium rounded hover:bg-sky-700 disabled:opacity-50"
                    >
                      {batchRunning ? "Looking up…" : "Search All"}
                    </button>
                    {batchItems.length > 0 && (
                      <span className="text-xs text-gray-400">
                        {batchItems.filter((b) => b.status === "found" || b.status === "not_found" || b.status === "error").length}
                        {" "}/ {batchItems.length} processed
                      </span>
                    )}
                  </div>
                </div>

                {batchItems.length > 0 && (
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="min-w-full text-xs text-gray-700">
                      <thead className="bg-gray-50 border-b border-gray-200">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                            ESI ID
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                            Address
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                            City
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                            County
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                            Zip
                          </th>
                          <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 bg-white">
                        {batchItems.map((item) => (
                          <tr key={item.esiId} className="hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono whitespace-nowrap">{item.esiId}</td>
                            <td className="px-3 py-2">{item.data?.address || "—"}</td>
                            <td className="px-3 py-2">{item.data?.city || "—"}</td>
                            <td className="px-3 py-2">{item.data?.county || "—"}</td>
                            <td className="px-3 py-2">{item.data?.zipcode || "—"}</td>
                            <td className="px-3 py-2">
                              {item.status === "pending" && <span className="text-gray-400">pending</span>}
                              {item.status === "loading" && <span className="text-blue-500">looking up…</span>}
                              {item.status === "found" && (
                                <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 font-medium">
                                  {item.data?.status || "Found"}
                                </span>
                              )}
                              {item.status === "not_found" && (
                                <span className="inline-block px-1.5 py-0.5 rounded text-xs bg-red-100 text-red-700 font-medium">
                                  Not Found
                                </span>
                              )}
                              {item.status === "error" && (
                                <span className="text-red-500" title={item.error}>
                                  error
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {mode === "address" && (
          <div className="space-y-4">
            <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
              <div className="flex flex-wrap gap-3 items-end">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Zipcode <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={zipcode}
                    onChange={(e) => setZipcode(e.target.value)}
                    placeholder="75201"
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-32"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    City <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="Dallas"
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-40"
                  />
                </div>
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-xs text-gray-500 mb-1">Address (partial match, optional)</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="e.g. Main St"
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Limit</label>
                  <select
                    value={limit}
                    onChange={(e) => setLimit(Number(e.target.value))}
                    className="border border-gray-300 rounded px-2 py-1.5 text-sm"
                  >
                    {LIMIT_OPTIONS.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={runAddressSearch}
                  disabled={searchLoading}
                  className="px-4 py-1.5 bg-sky-600 text-white text-sm font-medium rounded hover:bg-sky-700 disabled:opacity-50"
                >
                  {searchLoading ? "Searching…" : "Search"}
                </button>
              </div>
              {validationError && (
                <p className="text-sm text-red-600">{validationError}</p>
              )}
            </div>

            {searchError && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-4 py-2 rounded">
                {searchError}
              </div>
            )}

            {resultCount !== null && !searchError && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-600">
                  <span className="font-semibold text-gray-900">{resultCount}</span> result
                  {resultCount !== 1 ? "s" : ""}
                  {resultCount === limit && (
                    <span className="text-amber-600 ml-2">
                      (result set may be truncated at the {limit} limit — narrow with an address filter or raise the limit)
                    </span>
                  )}
                </span>
                {results.length > 0 && (
                  <span className="text-xs text-gray-400">
                    Page {page} of {totalPages}
                  </span>
                )}
              </div>
            )}

            {results.length > 0 && (
              <>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="min-w-full text-xs text-gray-700">
                    <thead className="bg-gray-50 border-b border-gray-200">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          ESI ID
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                          Address
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                          City
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                          Zip
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                          County
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-3 py-2 text-left font-medium text-gray-500 uppercase tracking-wider whitespace-nowrap">
                          DUNS
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {pagedResults.map((r) => (
                        <tr key={r.esi_id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{r.esi_id}</td>
                          <td className="px-3 py-2">{r.address || "—"}</td>
                          <td className="px-3 py-2">{r.city || "—"}</td>
                          <td className="px-3 py-2">{r.zipcode || "—"}</td>
                          <td className="px-3 py-2">{r.county || "—"}</td>
                          <td className="px-3 py-2">{r.status || "—"}</td>
                          <td className="px-3 py-2 font-mono whitespace-nowrap">{r.duns || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {totalPages > 1 && (
                  <div className="flex items-center justify-center gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40"
                    >
                      Prev
                    </button>
                    <span className="text-xs text-gray-500">
                      Page {page} of {totalPages}
                    </span>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="px-3 py-1 text-sm border border-gray-300 rounded disabled:opacity-40"
                    >
                      Next
                    </button>
                  </div>
                )}
              </>
            )}

            {resultCount === 0 && !searchError && (
              <p className="text-sm text-gray-400 py-3">No matching records found.</p>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
