import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn, getUser } from "../../utils/auth";
import api from "../../utils/api";

interface EsidRow {
  premise_id:    string;
  address:       string;
  city_state_zip: string;
  end_date:      string;
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
 * Mirrors active_renewals.php.
 *
 * Admin: receives broker_id from query param (set by /renewals dispatcher).
 * Non-admin: uses own broker_id from JWT (no query param needed).
 *
 * On submit:
 *   type=contract     → /forms/contract-commercial
 *   type=amendment    → /forms/contract-commercial (comm_renewal.php equivalent)
 *   type=new_amendment → /renewals/offer-redirect (amendment_form.php equivalent)
 *
 * No data → redirect to /renewals?error=1 (mirrors PHP redirect("renewals.php?error=1")).
 * Pagination: 15 companies per page (mirrors PHP $limit=15).
 */
export default function ActiveRenewalsPage() {
  const router = useRouter();
  const user   = getUser();

  const [companies, setCompanies]   = useState<Company[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [search,    setSearch]      = useState("");
  const [page,      setPage]        = useState(1);
  const [type,      setType]        = useState<"new_amendment"|"amendment"|"contract">("new_amendment");
  const [selected,  setSelected]    = useState<Record<string, boolean>>({});

  const PAGE_SIZE = 15;

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
        router.replace("/renewals?error=1");
        return;
      }
      setCompanies(res.data.companies);
      setPage(1);
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

    if (type === "contract" || type === "amendment") {
      router.push("/forms/contract-commercial");
    } else {
      // new_amendment → Renewal Offer Sheet (amendment_form.php equivalent)
      router.push("/renewals/offer-redirect");
    }
  }

  const paged = companies.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const totalPages = Math.ceil(companies.length / PAGE_SIZE);

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Active Renewal</h2>
      </section>

      {/* Description — mirrors active_renewals.php static text */}
      <div className="text-sm text-gray-700 mb-4 space-y-2 max-w-3xl">
        <p><strong>Renewal Amendment – Multiple Term</strong> is best used when you are offering customer a Contract Renewal but do not know the term of contract that the customer will choose.</p>
        <p><strong>Renewal Amendment – Exact Term</strong> is best used when you have discussed the term and rate that the customer will choose.</p>
        <p><strong>Renewal Contract</strong> is used when the renewal involves changes in terms of conditions from the initial contract.</p>
        <p>*** <strong>Amendments</strong> simplifies the process of renewing a customer. By amending the initial contract, customer should expect all general terms and conditions to stay the same as their initial contract.</p>
      </div>

      {/* Search form — mirrors active_renewals.php search_name form */}
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
          {/* Column header row — mirrors PHP header row */}
          <div className="grid grid-cols-3 font-semibold text-sm mb-1 pl-4"
            style={{ gridTemplateColumns: "350px 250px 200px" }}>
            <span>Customer Name</span>
            <span className="pl-4">Contract End Date</span>
            <span>Documents</span>
          </div>

          {paged.map((comp) => (
            <div key={comp.company_name} className="mb-3 ml-2">
              {/* Company row */}
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-400 text-xs">▶</span>
                <input
                  readOnly
                  className="bg-gray-600 text-white text-xs px-1 py-0.5"
                  style={{ width: 320 }}
                  value={comp.company_name || user?.username || ""}
                />
                {comp.end_date && (
                  <input readOnly
                    className="bg-gray-600 text-white text-xs px-1 py-0.5 w-28"
                    value={comp.end_date}
                  />
                )}
                {/* Type radio buttons per company row — mirrors PHP */}
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" name="type" value="new_amendment"
                    checked={type === "new_amendment"}
                    onChange={() => setType("new_amendment")} />
                  <strong>Renewal Offer Sheet</strong>
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" name="type" value="amendment"
                    checked={type === "amendment"}
                    onChange={() => setType("amendment")} />
                  <strong>Renewal Amendment</strong>
                </label>
                <label className="flex items-center gap-1 text-xs">
                  <input type="radio" name="type" value="contract"
                    checked={type === "contract"}
                    onChange={() => setType("contract")} />
                  <strong>Renewal Contract</strong>
                </label>
              </div>

              {/* ESIID header row */}
              <div className="flex items-center gap-2 text-xs mt-1 ml-8 text-white">
                <input readOnly className="bg-gray-800 px-1 py-0.5 w-44" value="ESIID" />
                <input readOnly className="bg-gray-800 px-1 py-0.5 w-56" value="ADDRESS" />
                <input readOnly className="bg-gray-800 px-1 py-0.5 w-36" value="CITY/STATE/ZIP" />
                <input readOnly className="bg-gray-800 px-1 py-0.5 w-44" value="CONTRACT END DATE" />
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

          {/* Pagination — mirrors PHP pagination */}
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm my-3 justify-center">
              {page > 1 && (
                <button type="button" onClick={() => setPage(p => p - 1)}
                  className="text-blue-600 hover:underline">« Prev</button>
              )}
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button key={p} type="button" onClick={() => setPage(p)}
                  className={p === page ? "font-bold" : "text-blue-600 hover:underline"}>
                  {p}
                </button>
              ))}
              {page < totalPages && (
                <button type="button" onClick={() => setPage(p => p + 1)}
                  className="text-blue-600 hover:underline">Next »</button>
              )}
            </div>
          )}

          <div className="mt-4 flex gap-3">
            <button type="submit"
              className="border border-gray-400 bg-gray-200 hover:bg-gray-300 text-sm px-6 py-1.5">
              Submit
            </button>
            <button type="button" onClick={() => router.push("/home")}
              className="border border-gray-400 bg-gray-200 hover:bg-gray-300 text-sm px-6 py-1.5">
              Home
            </button>
          </div>
        </form>
      )}
    </Layout>
  );
}
