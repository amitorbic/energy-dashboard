import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn, getUser } from "../../utils/auth";
import api from "../../utils/api";

interface EsidRow {
  premise_id:     string;
  address:        string;
  city_state_zip: string;
  end_date:       string;
}
interface Company {
  company_name: string;
  end_date:     string;
  esiids:       EsidRow[];
}
interface ActiveResponse {
  has_data:  boolean;
  companies: Company[];
}

/**
 * Mirrors renewal_custom.php — "Price Renewal Accounts" customer list.
 *
 * Admin: receives broker_id from query param (set by /renewals/price-renewals dispatcher).
 * Non-admin: uses own broker_id from JWT.
 *
 * PHP form actions:
 *   Submit button     → renew_popup.php  (in-app equivalent: /pricing/dashboard)
 *   "Send request"    → renewal_mail.php (send pricing request email — not yet implemented)
 *
 * No data → redirect to /renewals/price-renewals?error=1
 *   (mirrors PHP redirect("custome_con_renewals.php?error=1")).
 */
export default function RenewalCustomPage() {
  const router = useRouter();
  const user   = getUser();

  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState("");
  const [selected,  setSelected]  = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
  }, []);

  useEffect(() => {
    if (!router.isReady) return;
    fetchData();
  }, [router.isReady, router.query.broker_id]);

  async function fetchData(searchVal?: string) {
    setLoading(true);
    const brokerId = router.query.broker_id as string || "";
    try {
      const res = await api.get<ActiveResponse>("/renewals/active", {
        params: { broker_id: brokerId, search: searchVal ?? "" },
      });
      if (!res.data.has_data) {
        router.replace("/renewals/price-renewals?error=1");
        return;
      }
      setCompanies(res.data.companies);
      setSelected({});
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!search.trim()) {
      alert("This is not a valid search keyword, Please enter a valid keyword");
      return;
    }
    fetchData(search);
  }

  function toggleEsid(premiseId: string) {
    setSelected(prev => ({ ...prev, [premiseId]: !prev[premiseId] }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const esids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (!esids.length) { alert("Please select at least one ESIID"); return; }
    // Mirrors PHP redirect to renew_popup.php → in-app equivalent: /pricing/dashboard
    router.push("/pricing/dashboard");
  }

  function handleMailRequest(e: React.FormEvent) {
    e.preventDefault();
    const esids = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (!esids.length) { alert("Please select at least one ESIID"); return; }
    // Mirrors PHP redirect to renewal_mail.php
    alert("Pricing request email feature is not yet available.");
  }

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Renewals</h2>
      </section>

      {/* Search form */}
      <form onSubmit={handleSearch} className="mb-4 flex items-center gap-2">
        <label className="text-sm">Search Customer :</label>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm"
        />
        <button type="submit"
          className="border border-gray-300 bg-gray-100 hover:bg-gray-200 text-sm px-3 py-1">
          Go
        </button>
        <button type="button"
          onClick={() => { setSearch(""); fetchData(""); }}
          className="border border-gray-300 bg-gray-100 hover:bg-gray-200 text-sm px-3 py-1">
          Browse all
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : (
        <form onSubmit={handleSubmit}>
          {/* ESIID column header */}
          <div className="flex items-center gap-2 text-xs text-white mb-1 ml-8">
            <input readOnly className="bg-gray-800 px-1 py-0.5 w-44" value="ESIID" />
            <input readOnly className="bg-gray-800 px-1 py-0.5 w-56" value="ADDRESS" />
            <input readOnly className="bg-gray-800 px-1 py-0.5 w-36" value="CITY/STATE/ZIP" />
            <input readOnly className="bg-gray-800 px-1 py-0.5 w-44" value="CONTRACT END DATE" />
          </div>

          {companies.map((comp) => (
            <div key={comp.company_name} className="mb-4 ml-2">
              {/* Company row */}
              <div className="flex items-center gap-2 text-sm mb-1">
                <span className="text-gray-400 text-xs">▶</span>
                <input readOnly
                  className="bg-gray-600 text-white text-xs px-1 py-0.5"
                  style={{ width: 340 }}
                  value={comp.company_name || user?.username || ""}
                />
                {comp.end_date && (
                  <input readOnly
                    className="bg-gray-600 text-white text-xs px-1 py-0.5 w-28"
                    value={comp.end_date}
                  />
                )}
              </div>

              {/* ESIID rows */}
              {comp.esiids.map(row => (
                <div key={row.premise_id} className="flex items-center gap-2 text-xs mt-1 ml-8">
                  <input
                    type="checkbox"
                    checked={!!selected[row.premise_id]}
                    onChange={() => toggleEsid(row.premise_id)}
                  />
                  <input readOnly className="bg-gray-800 text-white px-1 py-0.5 w-44"
                    value={row.premise_id} />
                  <input readOnly className="bg-gray-800 text-white px-1 py-0.5 w-56"
                    value={row.address} />
                  <input readOnly className="bg-gray-800 text-white px-1 py-0.5 w-36"
                    value={row.city_state_zip} />
                  <input readOnly className="bg-gray-800 text-white px-1 py-0.5 w-44"
                    value={row.end_date} />
                </div>
              ))}
            </div>
          ))}

          <div className="mt-4 flex gap-3">
            <button type="submit"
              className="border border-gray-400 bg-gray-200 hover:bg-gray-300 text-sm px-6 py-1.5">
              Submit
            </button>
            <button type="button" onClick={handleMailRequest}
              className="border border-gray-400 bg-gray-200 hover:bg-gray-300 text-sm px-6 py-1.5">
              Send request for pricing
            </button>
          </div>
        </form>
      )}
    </Layout>
  );
}
