import { useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn } from "../../utils/auth";

/**
 * Mirrors custom_price.php — custom pricing for individual customers.
 *
 * PHP logic (summary):
 *   - Customer lookup from `customer` table WHERE broker_code = session broker
 *   - HUD file uploads (up to 8 files: idr_pricing1–8)
 *   - Custom pricing calculation based on uploaded usage data
 *   - Excel output generation
 *
 * This page is pending full implementation.
 */
export default function CustomPricePage() {
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  return (
    <Layout>
      <section className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">Custom Price</h2>
      </section>

      <div className="border border-yellow-300 bg-yellow-50 rounded p-4 text-sm text-yellow-800 max-w-lg">
        <p className="font-semibold">Custom Pricing — Coming Soon</p>
        <p className="mt-1">
          This page mirrors <code>custom_price.php</code>. Full implementation (customer
          lookup, HUD file upload, custom pricing calculation) is pending.
        </p>
      </div>
    </Layout>
  );
}
