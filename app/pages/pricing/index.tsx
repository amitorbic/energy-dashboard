import React from "react";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";

const PricingHome = () => {
  const router = useRouter();

  const cardClass =
    "rounded-[var(--r-lg)] p-8 space-y-4 border transition-colors cursor-pointer hover:border-[var(--accent-light)]";
  const cardStyle = {
    background: "var(--ct-surface)",
    borderColor: "var(--ct-border-default)",
  };
  const iconClass =
    "w-12 h-12 rounded-[var(--r-md)] flex items-center justify-center text-white text-2xl";
  const iconStyle = { background: "var(--accent-light)" };
  const openLinkStyle = { color: "var(--accent-light)" };

  return (
    <Layout title="Pricing">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div
          onClick={() => router.push("/custom_pricing")}
          className={cardClass}
          style={cardStyle}
        >
          <div className={iconClass} style={iconStyle}>
            ⚡
          </div>
          <h2 className="font-bold text-xl" style={{ color: "var(--ct-text-primary)" }}>
            Custom Pricing
          </h2>
          <p className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
            Price individual customers based on their usage profile and volume.
          </p>
          <span className="text-sm font-bold" style={openLinkStyle}>Open →</span>
        </div>

        <div
          onClick={() => router.push("/pricing/email")}
          className={cardClass}
          style={cardStyle}
        >
          <div className={iconClass} style={iconStyle}>
            📧
          </div>
          <h2 className="font-bold text-xl" style={{ color: "var(--ct-text-primary)" }}>
            Send Pricing Emails
          </h2>
          <p className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
            Send daily matrix or custom pricing emails to brokers.
          </p>
          <span className="text-sm font-bold" style={openLinkStyle}>Open →</span>
        </div>

        <div
          onClick={() => router.push("/custom_pricing/blend_extend")}
          className={cardClass}
          style={cardStyle}
        >
          <div className={iconClass} style={iconStyle}>
            🔀
          </div>
          <h2 className="font-bold text-xl" style={{ color: "var(--ct-text-primary)" }}>
            Blend &amp; Extend
          </h2>
          <p className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
            Calculate blended rate combining existing contract with new
            extension.
          </p>
          <div className="flex gap-3">
            <span className="text-sm font-bold" style={openLinkStyle}>New →</span>
            <span
              className="text-sm font-bold transition-colors"
              style={{ color: "var(--ct-text-secondary)" }}
              onClick={(e) => {
                e.stopPropagation();
                router.push("/custom_pricing/blend_extend");
              }}
            >
              View Log →
            </span>
          </div>
        </div>
        <div
          onClick={() => router.push("/custom_pricing/multi_start")}
          className={cardClass}
          style={cardStyle}
        >
          <div className={iconClass} style={iconStyle}>
            📅
          </div>
          <h2 className="font-bold text-xl" style={{ color: "var(--ct-text-primary)" }}>
            Multiple Start Pricing
          </h2>
          <p className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
            Price customers with meters starting on different dates into one
            weighted rate.
          </p>
          <span className="text-sm font-bold" style={openLinkStyle}>Open →</span>
        </div>
        <div
          onClick={() => router.push("/custom_pricing/sample_bill")}
          className={cardClass}
          style={cardStyle}
        >
          <div className={iconClass} style={iconStyle}>
            🧾
          </div>
          <h2 className="font-bold text-xl" style={{ color: "var(--ct-text-primary)" }}>
            Sample Bill
          </h2>
          <p className="text-sm" style={{ color: "var(--ct-text-secondary)" }}>
            Generate a sample electricity bill PDF with tax calculations.
          </p>
          <span className="text-sm font-bold" style={openLinkStyle}>Open →</span>
        </div>
      </div>
    </Layout>
  );
};

export default PricingHome;
