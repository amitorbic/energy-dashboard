import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../components/Layout";
import { isLoggedIn } from "../utils/auth";
import api from "../utils/api";

const TDSP_OPTIONS = [
  "AEP Texas Central Service Area",
  "AEP Texas North Service Area",
  "Centerpoint Electric Service Area",
  "Nueces Electric Cooperative Service Area",
  "Oncor Electric Delivery Service Area (SESCO territory)",
  "Sharyland Utilities Service Area",
  "Texas New Mexico Power Service Area",
  "Oncor Electric Delivery Service Area",
] as const;

interface EsiidRow {
  esiid:   string;
  address: string;
  city:    string;
  state:   string;
  zipcode: string;
}

/**
 * Mirrors esiid_lookup.php + esiid.php.
 *
 * Search types (radio):
 *   address          — 4-step address fallback (exact → long → short → numeric prefix)
 *   esiid            — exact match by single ESI ID
 *   multiple_esiid   — space-separated ESI IDs, auto-routes to correct TDSP table by prefix
 *
 * Results capped at 10; rows with "TEMP" in address excluded.
 * MB_CASE_TITLE applied server-side (title_case).
 */
export default function EsiidLookupPage() {
  const router = useRouter();

  const [tdsp,       setTdsp]       = useState<string>(TDSP_OPTIONS[0]);
  const [textZip,    setTextZip]    = useState("");
  const [city,       setCity]       = useState("");
  const [searchType, setSearchType] = useState<"address"|"esiid"|"multiple_esiid">("address");
  const [serText,    setSerText]    = useState("");

  const [results,  setResults]  = useState<EsiidRow[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [searched, setSearched] = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  // Zip validation: numeric only (mirrors PHP validateForm)
  function validate(): boolean {
    if (searchType !== "multiple_esiid" && !/^\d+$/.test(textZip.trim())) {
      alert("Zip code must be numeric");
      return false;
    }
    if (!serText.trim()) {
      alert("Search text is required");
      return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true); setError(""); setResults([]); setSearched(false);
    try {
      const res = await api.post<EsiidRow[]>("/esiid/lookup", {
        tdsp,
        city,
        zipcode: textZip,
        search_type: searchType,
        ser_text: serText,
      });
      setResults(res.data);
      setSearched(true);
    } catch {
      setError("Search failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inp = "border border-gray-300 rounded px-2 py-1 text-sm";

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">ESIID Lookup</h2>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {/* Search form — mirrors esiid_lookup.php */}
      <form name="myForm" onSubmit={handleSubmit}>
        <table>
          <tbody>
            {/* Zip */}
            <tr>
              <td className="pr-3 py-1 w-40 text-sm">
                <span className="text-[#CC0000]">*</span> Zip Code :
              </td>
              <td className="py-1">
                <input type="text" name="text_zip" className={`${inp} w-28`}
                  value={textZip} onChange={e => setTextZip(e.target.value)} />
              </td>
            </tr>

            {/* TDSP dropdown */}
            <tr>
              <td className="pr-3 py-1 text-sm">TDSP :</td>
              <td className="py-1">
                <select name="tdsp" className={`${inp} w-80`}
                  value={tdsp} onChange={e => setTdsp(e.target.value)}>
                  {TDSP_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </td>
            </tr>

            {/* City — free text (PHP uses dynamic select, we simplify to text) */}
            <tr>
              <td className="pr-3 py-1 text-sm">City :</td>
              <td className="py-1">
                <input type="text" name="city" className={`${inp} w-48`}
                  value={city} onChange={e => setCity(e.target.value)} />
              </td>
            </tr>

            {/* Search type radio */}
            <tr>
              <td className="pr-3 py-2 align-top text-sm">Search By :</td>
              <td className="py-2">
                {(["address", "esiid", "multiple_esiid"] as const).map(t => (
                  <label key={t} className="mr-4 text-sm">
                    <input type="radio" name="radio" className="mr-1"
                      value={t} checked={searchType === t}
                      onChange={() => setSearchType(t)} />
                    {t === "address"         ? "Address"
                      : t === "esiid"        ? "ESI ID"
                      : "Multiple ESI IDs"}
                  </label>
                ))}
              </td>
            </tr>

            {/* Search text */}
            <tr>
              <td className="pr-3 py-1 text-sm">
                {searchType === "address"
                  ? "Address :"
                  : searchType === "esiid"
                  ? "ESI ID :"
                  : "ESI IDs (space separated) :"}
              </td>
              <td className="py-1">
                <input type="text" name="ser_text" className={`${inp} w-80`}
                  value={serText} onChange={e => setSerText(e.target.value)}
                  placeholder={
                    searchType === "multiple_esiid"
                      ? "1008... 1044... 1040..."
                      : ""
                  } />
              </td>
            </tr>

            <tr>
              <td className="h-10">&nbsp;</td>
              <td>
                <input type="submit" value={loading ? "Searching…" : "Search"}
                  disabled={loading}
                  className="border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-sm px-4 py-1 cursor-pointer" />
              </td>
            </tr>
          </tbody>
        </table>
      </form>

      {/* Results table — mirrors esiid.php display */}
      {searched && (
        <div className="mt-4 overflow-x-auto">
          {results.length === 0 ? (
            <p className="text-gray-500 text-sm">No results found.</p>
          ) : (
            <>
              <p className="text-xs text-gray-400 mb-2">
                {results.length} result{results.length !== 1 ? "s" : ""} (max 10)
              </p>
              <table className="border-collapse text-sm" style={{ minWidth: 640 }}>
                <thead>
                  <tr>
                    {["ESIID", "ADDRESS", "CITY", "STATE", "ZIP"].map(h => (
                      <th key={h}
                        className="border border-gray-300 px-3 py-2 bg-gray-100 text-left text-xs font-semibold">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {results.map((row, i) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50"}>
                      <td className="border border-gray-300 px-3 py-1.5 font-mono text-xs">
                        {row.esiid}
                      </td>
                      <td className="border border-gray-300 px-3 py-1.5">{row.address}</td>
                      <td className="border border-gray-300 px-3 py-1.5">{row.city}</td>
                      <td className="border border-gray-300 px-3 py-1.5">{row.state}</td>
                      <td className="border border-gray-300 px-3 py-1.5">{row.zipcode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </Layout>
  );
}
