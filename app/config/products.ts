// Single source of truth for the four sellable ORBIC products.
// Mirrored on the backend by api/utils/tenant_modules.py::ALL_MODULES.
//
// This is a module *registry* (keys, display metadata, landing page) —
// entitlement state itself lives on the logged-in User (see utils/auth.ts).

export type ModuleKey = "sales" | "operations" | "portfolio" | "audit";

export interface ProductMeta {
  key: ModuleKey;
  name: string;
  tagline: string;
  landingHref: string;
}

export const PRODUCTS: ProductMeta[] = [
  {
    key: "sales",
    name: "ORBIC Sales",
    tagline: "Pricing, broker management, contracts, and commissions.",
    landingHref: "/sales",
  },
  {
    key: "operations",
    name: "ORBIC Operations",
    tagline: "Enrollment, billing, payments, and customer operations.",
    landingHref: "/operations",
  },
  {
    key: "portfolio",
    name: "ORBIC Portfolio",
    tagline: "Forecasting, hedging, settlement, MTM, and risk.",
    landingHref: "/portfolio",
  },
  {
    key: "audit",
    name: "ORBIC Audit & Controls",
    tagline: "Continuous operational, financial, and process monitoring.",
    landingHref: "/audit",
  },
];

export const ALL_MODULE_KEYS: ModuleKey[] = PRODUCTS.map((p) => p.key);
