import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn, isAdmin } from "../../utils/auth";
import api from "../../utils/api";

interface Broker { broker_id: string; name: string; }

/**
 * Mirrors custome_con_renewals.php — "Select Broker" dispatcher for
 * Custom Contract / Price Renewal Accounts.
 *
 * Admin (role==1): shows broker dropdown, submit → /renewals/renewal-custom?broker_id=X
 * Non-admin: redirected immediately to /renewals/renewal-custom
 *   (mirrors PHP `redirect("renewal_custom.php")`)
 *
 * Also shows "No Data Found" error when router.query.error == "1"
 * (mirrors PHP $_GET['error']==1 check on line 82).
 *
 * PHP line 30: $_SESSION['broker_id'] = $_SESSION['temp_broker_id'] — JWT flow; omitted.
 */
export default function PriceRenewalsPage() {
  const router = useRouter();
  const [admin, setAdmin] = useState(false);
  const [brokers, setBrokers]   = useState<Broker[]>([]);
  const [selected, setSelected] = useState("");
  const [loading, setLoading]   = useState(false);
  const hasError = router.query.error === "1";

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }

    const adminVal = isAdmin();
    if (!adminVal) {
      router.replace("/renewals/renewal-custom");
      return;
    }

    setAdmin(true);
    setLoading(true);
    api.get<Broker[]>("/renewals/brokers")
      .then((res) => {
        setBrokers(res.data);
        if (res.data.length > 0) setSelected(res.data[0].broker_id);
      })
      .finally(() => setLoading(false));
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Mirrors PHP: redirect('renewal_custom.php?broker_id='.$_POST['vendor_id'])
    if (selected) {
      router.push(`/renewals/renewal-custom?broker_id=${encodeURIComponent(selected)}`);
    } else {
      router.push("/renewals/renewal-custom");
    }
  }

  if (!admin) return null;

  return (
    <Layout>
      <section className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">Select Broker</h2>
      </section>

      {/* Mirrors custome_con_renewals.php broker-selector form */}
      <form name="renewals" onSubmit={handleSubmit} className="text-center">
        <div className="inline-block">
          <table className="w-96">
            <tbody>
              <tr>
                <td className="h-12">&nbsp;</td>
              </tr>

              <tr>
                <td className="h-12 text-left px-2">
                  <strong>Select Broker :&nbsp;</strong>
                  <select
                    name="vendor_id"
                    id="vendor_id"
                    value={selected}
                    onChange={(e) => setSelected(e.target.value)}
                    disabled={loading}
                    className="border border-gray-300 rounded px-2 py-1 text-sm"
                    style={{ width: 250 }}
                  >
                    {brokers.map((b) => (
                      <option key={b.broker_id} value={b.broker_id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                  {/* "No Data Found" error — mirrors PHP $_GET['error']==1 */}
                  {hasError && (
                    <span className="ml-2 text-red-600 text-sm font-medium">
                      No Data Found
                    </span>
                  )}
                </td>
              </tr>

              <tr>
                <td className="h-8">&nbsp;</td>
              </tr>

              <tr>
                <td className="h-10 text-center">
                  <input
                    name="Submit"
                    type="submit"
                    value="Submit"
                    className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-6 py-1.5 rounded cursor-pointer"
                  />
                </td>
              </tr>

              <tr>
                <td className="h-8">&nbsp;</td>
              </tr>
            </tbody>
          </table>
        </div>
      </form>
    </Layout>
  );
}
