import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn } from "../../utils/auth";

/**
 * Mirrors daily_quotes_home.php — two radio buttons that route to
 * either the Daily Quotes page or the Custom Price page.
 */
export default function PricingIndexPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<"daily" | "custom">("daily");

  // Auth guard — mirrors config.php session check
  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (selected === "daily") {
      router.push("/pricing/daily-quotes");
    } else {
      router.push("/pricing/custom-price");
    }
  }

  return (
    <Layout>
      <section className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">Pricing</h2>
      </section>

      {/* Mirrors daily_quotes_home.php radio-button form */}
      <form onSubmit={handleSubmit} name="price">
        <table
          className="border-collapse"
          style={{ width: 400, border: "1px solid #ccc" }}
        >
          <tbody>
            <tr>
              <td
                colSpan={2}
                className="px-4 py-2 font-bold bg-gray-100 border border-gray-300 text-sm"
              >
                Select Price Type
              </td>
            </tr>

            {/* Daily Quotes radio */}
            <tr>
              <td className="px-4 py-2 border border-gray-300 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="price"
                    value="daily"
                    checked={selected === "daily"}
                    onChange={() => setSelected("daily")}
                  />
                  Daily Quotes
                </label>
              </td>
            </tr>

            {/* Custom Price radio */}
            <tr>
              <td className="px-4 py-2 border border-gray-300 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="price"
                    value="custom"
                    checked={selected === "custom"}
                    onChange={() => setSelected("custom")}
                  />
                  Custom Price
                </label>
              </td>
            </tr>

            <tr>
              <td className="px-4 py-3 border border-gray-300">
                <input
                  type="submit"
                  value="Go"
                  className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-medium px-6 py-1.5 rounded cursor-pointer"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </form>
    </Layout>
  );
}
