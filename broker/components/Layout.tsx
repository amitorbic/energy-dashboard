import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { clearAuth, getUser, isAdmin } from "../utils/auth";

interface Props {
  children: React.ReactNode;
  title?: string;
}

interface DropdownItem {
  label: string;
  href: string;
  adminOnly?: boolean;
}

interface NavItem {
  label: string;
  href?: string;
  children?: DropdownItem[];
}

export default function Layout({ children, title }: Props) {
  const router = useRouter();
  const [user, setUser]       = useState<ReturnType<typeof getUser>>(null);
  const [admin, setAdmin]     = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    setUser(getUser());
    setAdmin(isAdmin());
  }, []);

  function logout() {
    clearAuth();
    router.push("/");
  }

  function navigate(href: string) {
    setOpenMenu(null);
    setMobileOpen(false);
    router.push(href);
  }

  const navItems: NavItem[] = [
    { label: "Home", href: "/home" },
    {
      label: "Pricing",
      children: [
        { label: "Daily Pricing", href: "/pricing" },
        { label: "Active Quotes", href: "/pricing/active-quotes" },
      ],
    },
    {
      label: "Renewals",
      children: [
        { label: "Renewals", href: "/renewals" },
        { label: "Price Renewal Accounts", href: "/renewals/price-renewals" },
        { label: "Renewal Offer Upload", href: "/renewals/offer-upload", adminOnly: true },
        { label: "Change Company Name", href: "/renewals/change-company", adminOnly: true },
      ],
    },
    {
      label: "Forms",
      children: [
        { label: "Commercial Contract", href: "/forms/contract-commercial" },
        { label: "Residential Contract", href: "/forms/contract-residential" },
        { label: "Generate LOA", href: "/forms/loa" },
        { label: "Upload LOA", href: "/forms/loa-upload" },
        { label: "ACH Form", href: "/forms/ach" },
        { label: "Credit Card", href: "/forms/credit-card" },
        { label: "Personal Guarantee", href: "/forms/personal-guarantee" },
        { label: "Corporate Guarantee", href: "/forms/corporate-guarantee" },
        { label: "Credit Check", href: "/forms/credit-check" },
        { label: "Account Transfer", href: "/forms/account-transfer" },
        { label: "Cancellation", href: "/forms/cancellation" },
        { label: "Add On Form", href: "/forms/meter-add" },
        { label: "Payment Plan", href: "/forms/payment-plan", adminOnly: true },
      ],
    },
    { label: "Bill Sample", href: "/bill-sample" },
    { label: "ESIID Lookup", href: "/esiid-lookup" },
    {
      label: "Profile",
      children: [
        { label: "View Profile", href: "/profile" },
        { label: "New Password", href: "/profile/change-password" },
        { label: "Contract Log", href: "/profile/contract-log", adminOnly: true },
        { label: "Sign Up New User", href: "/profile/admin/signup", adminOnly: true },
        { label: "Edit User", href: "/profile/admin/users", adminOnly: true },
        { label: "Upload User", href: "/profile/admin/upload", adminOnly: true },
        { label: "Forgot Password List", href: "/profile/admin/forgot-list", adminOnly: true },
      ],
    },
  ];

  const isActive = (href: string) => router.pathname === href;
  const isGroupActive = (item: NavItem) =>
    item.href
      ? isActive(item.href)
      : item.children?.some((c) => router.pathname.startsWith(c.href)) ?? false;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "#f1f5f9" }}>

      {/* ── Header ── */}
      <header style={{ background: "linear-gradient(135deg, #0f172a 0%, #1e3a8a 60%, #1d4ed8 100%)" }}
        className="shadow-md">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">

          {/* Logo / brand */}
          <a onClick={() => navigate("/home")}
            className="flex items-center gap-2.5 cursor-pointer group">
            <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center group-hover:bg-white/30 transition">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="text-white font-bold text-base tracking-wide">Orbic</span>
            <span className="text-blue-300 text-xs font-medium hidden sm:inline">Broker Portal</span>
          </a>

          {/* Right side */}
          <div className="flex items-center gap-5">
            <div className="hidden sm:flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                </svg>
              </div>
              <span className="text-blue-100 text-sm">
                <span className="text-blue-300">Welcome, </span>
                <span className="font-semibold text-white">{user?.username}</span>
              </span>
            </div>
            <button onClick={logout}
              className="flex items-center gap-1.5 text-xs font-medium text-white/70 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg transition-all">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign Out
            </button>

            {/* Mobile hamburger */}
            <button onClick={() => setMobileOpen(!mobileOpen)}
              className="lg:hidden text-white/80 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d={mobileOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {/* ── Navigation bar ── */}
      <nav className="bg-white border-b border-gray-200 shadow-sm hidden lg:block">
        <div className="max-w-7xl mx-auto px-4">
          <ul className="flex">
            {navItems.map((item) => {
              const visibleChildren = item.children?.filter((c) => !c.adminOnly || admin);
              const hasDropdown = visibleChildren && visibleChildren.length > 0;
              const active = isGroupActive(item);

              return (
                <li key={item.label} className="relative"
                  onMouseEnter={() => hasDropdown && setOpenMenu(item.label)}
                  onMouseLeave={() => setOpenMenu(null)}>
                  <button
                    onClick={() => item.href && navigate(item.href)}
                    className={`px-4 py-3 flex items-center gap-1 text-sm font-medium whitespace-nowrap border-b-2 transition-all ${
                      active
                        ? "border-blue-600 text-blue-700"
                        : "border-transparent text-gray-600 hover:text-blue-600 hover:border-blue-300"
                    }`}
                  >
                    {item.label}
                    {hasDropdown && (
                      <svg className="w-3 h-3 mt-0.5 opacity-60" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd"
                          d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                          clipRule="evenodd" />
                      </svg>
                    )}
                  </button>

                  {hasDropdown && openMenu === item.label && (
                    <ul className="absolute left-0 top-full bg-white shadow-lg border border-gray-200 rounded-b-lg min-w-[210px] z-50 py-1">
                      {visibleChildren!.map((child) => (
                        <li key={child.href}>
                          <button
                            onClick={() => navigate(child.href)}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                              isActive(child.href)
                                ? "bg-blue-50 text-blue-700 font-medium"
                                : "text-gray-700 hover:bg-blue-50 hover:text-blue-600"
                            }`}
                          >
                            {child.label}
                          </button>
                        </li>
                      ))}
                      {item.label === "Profile" && !admin && user?.has_commission && (
                        <li>
                          <button
                            onClick={() => navigate("/profile/commission")}
                            className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors">
                            Download Commission
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* ── Mobile nav drawer ── */}
      {mobileOpen && (
        <div className="lg:hidden bg-white border-b border-gray-200 shadow-md">
          <ul className="divide-y divide-gray-100">
            {navItems.map((item) => {
              const visibleChildren = item.children?.filter((c) => !c.adminOnly || admin);
              return (
                <li key={item.label}>
                  {item.href ? (
                    <button onClick={() => navigate(item.href!)}
                      className="w-full text-left px-5 py-3 text-sm font-medium text-gray-700">
                      {item.label}
                    </button>
                  ) : (
                    <div>
                      <p className="px-5 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        {item.label}
                      </p>
                      {visibleChildren?.map((child) => (
                        <button key={child.href} onClick={() => navigate(child.href)}
                          className="w-full text-left px-8 py-2 text-sm text-gray-600 hover:text-blue-600">
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* ── Page content ── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 py-6">
        {title && (
          <h1 className="text-xl font-bold text-gray-800 mb-4">{title}</h1>
        )}
        {children}
      </main>

      {/* ── Footer ── */}
      <footer className="bg-white border-t border-gray-200 py-3 text-center text-xs text-gray-400">
        Copyright &copy; 2025 <span className="font-medium text-gray-600">Orbic Broker Portal</span>. All Rights Reserved.
      </footer>

    </div>
  );
}
