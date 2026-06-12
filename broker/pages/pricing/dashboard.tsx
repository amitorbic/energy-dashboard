import { useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn } from "../../utils/auth";

/**
 * Mirrors dashboard.php / renew_popup.php — pricing dashboard shown after
 * selecting accounts from the Price Renewal Accounts page.
 *
 * PHP logic (summary):
 *   - Shows selected ESIDs and their usage/pricing data
 *   - Calculates and displays renewal pricing options
 *   - Links to amendment and renewal forms
 *
 * This page is pending full implementation.
 */
export default function PricingDashboardPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  return (
    <Layout>
      <section className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">Pricing Dashboard</h2>
      </section>

      <div className="border border-yellow-300 bg-yellow-50 rounded p-4 text-sm text-yellow-800 max-w-lg">
        <p className="font-semibold">Pricing Dashboard — Coming Soon</p>
        <p className="mt-1">
          This page mirrors <code>dashboard.php</code> / <code>renew_popup.php</code>.
          Full implementation (pricing calculations, renewal form integration) is pending.
        </p>
      </div>
    </Layout>
  );
}
