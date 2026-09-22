import Link from "next/link";
import Layout from "./Layout";
import { SECTIONS } from "./Sidebar";
import { PRODUCTS, ModuleKey } from "../config/products";

interface Props {
  productKey: ModuleKey;
}

// Generic product landing page: lists every Sidebar.tsx item tagged with
// this product, regardless of which section header it's visually grouped
// under today (see docs/ORBIC_PRODUCT_MODULARIZATION_SCOPE.md §12). Pages
// and hrefs are entirely derived from SECTIONS, not hand-copied, so this
// can't drift out of sync the way a hand-maintained list would.
export default function ProductLanding({ productKey }: Props) {
  const meta = PRODUCTS.find((p) => p.key === productKey)!;
  const items = SECTIONS.flatMap((section) => section.items)
    .filter((item) => item.product === productKey);

  return (
    <Layout title={meta.name}>
      <p className="text-sm mb-6" style={{ color: "var(--ct-text-secondary)" }}>
        {meta.tagline}
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((item) =>
          item.soon || !item.href ? (
            <div
              key={item.label}
              className="block border rounded-[var(--r-lg)] p-5 opacity-60 cursor-default"
              style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface)" }}
            >
              <h3 className="font-semibold text-sm mb-1" style={{ color: "var(--ct-text-primary)" }}>
                {item.label}
              </h3>
              <span className="text-xs" style={{ color: "var(--ct-text-muted)" }}>Coming soon</span>
            </div>
          ) : (
            <Link
              key={item.href}
              href={item.href}
              className="group block border rounded-[var(--r-lg)] p-5 transition-all duration-200 hover:border-[var(--accent-light)]"
              style={{ borderColor: "var(--ct-border-default)", background: "var(--ct-surface)" }}
            >
              <h3 className="font-semibold text-sm mb-1" style={{ color: "var(--ct-text-primary)" }}>
                {item.label}
              </h3>
              <div
                className="mt-2 text-xs font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: "var(--accent-light)" }}
              >
                Open →
              </div>
            </Link>
          )
        )}
      </div>
    </Layout>
  );
}
