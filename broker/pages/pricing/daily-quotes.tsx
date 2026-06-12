import { useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn } from "../../utils/auth";

/**
 * Mirrors daily_quotes.php — a 1738-line pricing calculation engine.
 *
 * PHP logic (summary):
 *   - Start date picker (first of next month default after day 7)
 *   - Intermediate months (comma-separated terms, min 6, max 5 terms)
 *   - Queries: heat_rates × consumption × gas_strip tables
 *   - Calculates weighted-average prices per load zone and term
 *   - Adds margin + commission + txu + tdsp from DB tables
 *   - Generates Excel file (PHPExcel) and emails to broker's configured addresses
 *   - Also reads pre-calculated quotes from final_quotes table
 *
 * This page is pending full implementation (requires Excel output + email send).
 */
export default function DailyQuotesPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  return (
    <Layout>
      <section className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">Daily Pricing</h2>
      </section>

      <div className="border border-yellow-300 bg-yellow-50 rounded p-4 text-sm text-yellow-800 max-w-lg">
        <p className="font-semibold">Daily Pricing — Coming Soon</p>
        <p className="mt-1">
          This page mirrors <code>daily_quotes.php</code>. Full implementation (heat rate
          calculations, Excel generation, email delivery) is pending.
        </p>
      </div>
    </Layout>
  );
}
