import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn, isAdmin, getUser } from "../../utils/auth";
import api from "../../utils/api";

interface Customer {
  cid:             string;
  esid:            string;
  name:            string;
  company_name?:   string;
  start_date:      string;
  contact_person:  string;
  contact_number:  string;
  contact_email:   string;
  credit_status:   string;
  _account_type:   "regular" | "renewal";
}

interface QuotesResponse {
  customers: Customer[];
  renewals:  Customer[];
}

/**
 * Mirrors view_edit.php — Active Quotes customer list.
 *
 * PHP bug replicated (view_edit.php line 139): all renewal rows display the
 * last regular customer's credit_status instead of their own. The variable
 * $row (from the outer while loop) is still in scope when renewals render.
 */
export default function ActiveQuotesPage() {
  const router = useRouter();
  const [data, setData]         = useState<QuotesResponse>({ customers: [], renewals: [] });
  const [searchText, setSearch] = useState("");
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  const admin = isAdmin();
  const user  = getUser();

  // Auth guard
  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }

    const q = (router.query.search_text as string) || "";
    setSearch(q);
    load(q);
  }, [router.query.search_text]);

  async function load(q: string) {
    setLoading(true);
    try {
      const res = await api.get<QuotesResponse>("/pricing/active-quotes", {
        params: q ? { search_text: q } : {},
      });
      setData(res.data);
    } catch {
      setError("Failed to load customer list.");
    } finally {
      setLoading(false);
    }
  }

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchText.trim()) {
      alert("This is not a valid search keyword, Please enter a valid keyword");
      return;
    }
    router.push({ pathname: "/pricing/active-quotes", query: { search_text: searchText } });
  }

  async function handleDelete(cid: string, table: string) {
    if (!confirm("Do you want to delete this Customer?")) return;
    // hide row immediately (mirrors ajax_function.js style)
    setData((prev) => ({
      customers: prev.customers.filter((c) => c.cid !== cid),
      renewals:  prev.renewals.filter((c)  => c.cid !== cid),
    }));
    try {
      await api.post("/pricing/customer/delete", { cid, table });
    } catch {
      // re-fetch on failure
      load(searchText);
    }
  }

  async function handleApprove(cid: string, table: string) {
    if (!confirm("Do you want to Approved this Customer?")) return;
    await api.post("/pricing/customer/approve", { cid, table });
    load(searchText);
  }

  // PHP bug: $row['credit_status'] used for all renewals = last regular row's value
  const lastRegularCreditStatus =
    data.customers.length > 0
      ? data.customers[data.customers.length - 1].credit_status
      : "";

  // Combine regular + renewals into one sequential list (mirrors PHP's two while loops)
  const allRows: (Customer & { _table: string })[] = [
    ...data.customers.map((c) => ({ ...c, _table: "customer" })),
    ...data.renewals.map((r) => ({
      ...r,
      // PHP bug: show last regular customer's credit_status for all renewal rows
      credit_status: lastRegularCreditStatus,
      _table: "broker_customer",
    })),
  ];

  return (
    <Layout>
      {/* Section header — mirrors view_edit.php h2 */}
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Active Quotes</h2>
      </section>

      {/* Search form — mirrors view_edit.php search-customer section */}
      <form name="search_name" onSubmit={handleSearch} className="flex items-center gap-2 mb-4">
        <label className="text-sm text-gray-700">Search Customer :</label>
        <input
          type="text"
          name="search_text"
          id="search_text"
          value={searchText}
          onChange={(e) => setSearch(e.target.value)}
          className="border border-gray-300 rounded px-3 py-1 text-sm"
        />
        <input
          type="submit"
          value="Search"
          className="bg-gray-200 hover:bg-gray-300 border border-gray-400 text-sm px-3 py-1 rounded cursor-pointer"
        />
        <span className="text-sm text-gray-500">or</span>
        <button
          type="button"
          onClick={() => router.push("/pricing/active-quotes")}
          className="bg-gray-200 hover:bg-gray-300 border border-gray-400 text-sm px-3 py-1 rounded"
        >
          Browse all
        </button>
      </form>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      {loading ? (
        <p className="text-gray-500 text-sm">Loading…</p>
      ) : (
        <div className="overflow-x-auto">
          <table
            className="border-collapse text-xs"
            style={{ width: 970 }}
          >
            <thead>
              <tr className="bg-gray-200 text-left">
                <th className="border border-gray-300 px-2 py-1">SNO</th>
                <th className="border border-gray-300 px-2 py-1">ESID</th>
                <th className="border border-gray-300 px-2 py-1">NAME</th>
                {/* PHP shows AGENT for role==1 OR role==2 (all users) */}
                <th className="border border-gray-300 px-2 py-1">AGENT</th>
                <th className="border border-gray-300 px-2 py-1">START DATE</th>
                <th className="border border-gray-300 px-2 py-1">CONTACT PERSON</th>
                <th className="border border-gray-300 px-2 py-1">CONTACT NUMBER</th>
                <th className="border border-gray-300 px-2 py-1">EMAIL</th>
                <th className="border border-gray-300 px-2 py-1">Credit Status</th>
                <th className="border border-gray-300 px-2 py-1">Type Of Account</th>
                <th className="border border-gray-300 px-2 py-1 bg-gray-100">&nbsp;</th>
              </tr>
            </thead>
            <tbody>
              {allRows.map((row, idx) => (
                <tr
                  key={row.cid + row._table}
                  id={row.cid}
                  className={idx % 2 === 1 ? "bg-gray-100" : ""}
                >
                  <td className="border border-gray-300 px-2 py-1">{idx + 1}</td>
                  <td className="border border-gray-300 px-2 py-1">{row.esid}</td>
                  <td className="border border-gray-300 px-2 py-1">{row.name}</td>
                  <td className="border border-gray-300 px-2 py-1">{row.company_name || ""}</td>
                  <td className="border border-gray-300 px-2 py-1">{row.start_date}</td>
                  <td className="border border-gray-300 px-2 py-1">{row.contact_person}</td>
                  <td className="border border-gray-300 px-2 py-1">{row.contact_number}</td>
                  <td className="border border-gray-300 px-2 py-1">
                    {/* PHP: str_replace(";","<br>", contact_email) */}
                    {row.contact_email.split(";").map((e, i) => (
                      <span key={i}>{e.trim()}{i < row.contact_email.split(";").length - 1 && <br />}</span>
                    ))}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">{row.credit_status}</td>
                  {/* Type of Account: blank for regular, "Renewal" for renewal (view_edit.php line 113/140) */}
                  <td className="border border-gray-300 px-2 py-1">
                    {row._account_type === "renewal" ? "Renewal" : ""}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {/* Edit — links to /pricing/dashboard?cid=X[&type=renewal] */}
                    <a
                      href={`/pricing/dashboard?cid=${row.cid}${
                        row._account_type === "renewal" ? "&type=renewal" : ""
                      }`}
                      title="Edit"
                      className="inline-block mr-1 text-blue-600 hover:underline text-xs"
                    >
                      [Edit]
                    </a>

                    {/* Delete */}
                    <button
                      onClick={() => handleDelete(row.cid, row._table)}
                      title="Delete"
                      className="text-red-600 hover:underline text-xs mr-1"
                    >
                      [Del]
                    </button>

                    {/* Approve — shown for admin when credit_status=="Approved"
                        Mirrors view_edit.php line 115-118: role==1||2 AND credit_status=="Approved" */}
                    {admin && row.credit_status === "Approved" && (
                      <button
                        onClick={() => handleApprove(row.cid, row._table)}
                        title="Approved"
                        className="text-green-700 hover:underline text-xs"
                      >
                        [Approved]
                      </button>
                    )}
                  </td>
                </tr>
              ))}

              {allRows.length === 0 && (
                <tr>
                  <td
                    colSpan={11}
                    className="text-center py-4 text-gray-500 border border-gray-300"
                  >
                    No customers found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </Layout>
  );
}
