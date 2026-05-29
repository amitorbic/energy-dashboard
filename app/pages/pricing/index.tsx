import React from "react";
import Layout from "../../components/Layout";
import { useRouter } from "next/router";

const PricingHome = () => {
  const router = useRouter();

  return (
    <Layout title="Pricing">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        <div
          onClick={() => router.push("/custom_pricing")}
          className="bg-slate-800 rounded-lg p-8 space-y-4 border border-slate-700 hover:border-red-500 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center text-white text-2xl">
            ⚡
          </div>
          <h2 className="text-white font-bold text-xl">Custom Pricing</h2>
          <p className="text-slate-400 text-sm">
            Price individual customers based on their usage profile and volume.
          </p>
          <span className="text-red-400 text-sm font-bold">Open →</span>
        </div>

        <div
          onClick={() => router.push("/pricing/email")}
          className="bg-slate-800 rounded-lg p-8 space-y-4 border border-slate-700 hover:border-red-500 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center text-white text-2xl">
            📧
          </div>
          <h2 className="text-white font-bold text-xl">Send Pricing Emails</h2>
          <p className="text-slate-400 text-sm">
            Send daily matrix or custom pricing emails to brokers.
          </p>
          <span className="text-red-400 text-sm font-bold">Open →</span>
        </div>

        <div
          onClick={() => router.push("/custom_pricing/blend_extend")}
          className="bg-slate-800 rounded-lg p-8 space-y-4 border border-slate-700 hover:border-red-500 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center text-white text-2xl">
            🔀
          </div>
          <h2 className="text-white font-bold text-xl">Blend &amp; Extend</h2>
          <p className="text-slate-400 text-sm">
            Calculate blended rate combining existing contract with new
            extension.
          </p>
          <div className="flex gap-3">
            <span className="text-red-400 text-sm font-bold">New →</span>
            <span
              className="text-slate-400 text-sm font-bold hover:text-white"
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
          className="bg-slate-800 rounded-lg p-8 space-y-4 border border-slate-700 hover:border-red-500 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center text-white text-2xl">
            📅
          </div>
          <h2 className="text-white font-bold text-xl">
            Multiple Start Pricing
          </h2>
          <p className="text-slate-400 text-sm">
            Price customers with meters starting on different dates into one
            weighted rate.
          </p>
          <span className="text-red-400 text-sm font-bold">Open →</span>
        </div>
        <div
          onClick={() => router.push("/custom_pricing/sample_bill")}
          className="bg-slate-800 rounded-lg p-8 space-y-4 border border-slate-700 hover:border-red-500 transition-colors cursor-pointer"
        >
          <div className="w-12 h-12 bg-red-600 rounded-lg flex items-center justify-center text-white text-2xl">
            🧾
          </div>
          <h2 className="text-white font-bold text-xl">Sample Bill</h2>
          <p className="text-slate-400 text-sm">
            Generate a sample electricity bill PDF with tax calculations.
          </p>
          <span className="text-red-400 text-sm font-bold">Open →</span>
        </div>
      </div>
    </Layout>
  );
};

export default PricingHome;
