import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn, getUser } from "../../utils/auth";
import api from "../../utils/api";

/**
 * Mirrors pricing_offer.php + pricing_offer_form.php.
 *
 * Called from /pricing/dashboard with GET params pre-filled.
 * User can also fill the form manually and click "Download Pricing Offer PDF"
 * which fetches the PDF from the FastAPI endpoint (authenticated).
 *
 * PHP GET params: cid, type, acc_name, acc_per, acc_address, acc_phone,
 *   acc_email, dasdate, doccterm1-5, quote6/12/18/24/36, acc_damount, com_name
 */
export default function OfferPage() {
  const router = useRouter();
  const user   = getUser();

  // Auth guard
  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  // Pre-populate from query params (when navigated from dashboard)
  const q = router.query as Record<string, string>;

  const [cid,        setCid]        = useState(q.cid        || "");
  const [type_,      setType]        = useState(q.type       || "regular");
  const [accName,    setAccName]    = useState(q.acc_name   || "");
  const [accPer,     setAccPer]     = useState(q.acc_per    || "");
  const [accAddress, setAccAddress] = useState(q.acc_address|| "");
  const [accPhone,   setAccPhone]   = useState(q.acc_phone  || "");
  const [accEmail,   setAccEmail]   = useState(q.acc_email  || "");
  const [dasdate,    setDasdate]    = useState(q.dasdate    || "");
  const [term1,      setTerm1]      = useState(q.doccterm1  || "");
  const [term2,      setTerm2]      = useState(q.doccterm2  || "");
  const [term3,      setTerm3]      = useState(q.doccterm3  || "");
  const [term4,      setTerm4]      = useState(q.doccterm4  || "");
  const [term5,      setTerm5]      = useState(q.doccterm5  || "");
  const [quote6,     setQuote6]     = useState(q.quote6     || "N/A");
  const [quote12,    setQuote12]    = useState(q.quote12    || "N/A");
  const [quote18,    setQuote18]    = useState(q.quote18    || "N/A");
  const [quote24,    setQuote24]    = useState(q.quote24    || "N/A");
  const [quote36,    setQuote36]    = useState(q.quote36    || "N/A");
  const [damount,    setDamount]    = useState(q.acc_damount|| "");
  const [comName,    setComName]    = useState(q.com_name   || user?.username || "");

  const [downloading, setDownloading] = useState(false);
  const [error, setError]             = useState("");

  // Sync form if router.query arrives asynchronously (Next.js page router)
  useEffect(() => {
    if (!router.isReady) return;
    const q2 = router.query as Record<string, string>;
    if (q2.cid)         setCid(q2.cid);
    if (q2.type)        setType(q2.type);
    if (q2.acc_name)    setAccName(q2.acc_name);
    if (q2.acc_per)     setAccPer(q2.acc_per);
    if (q2.acc_address) setAccAddress(q2.acc_address);
    if (q2.acc_phone)   setAccPhone(q2.acc_phone);
    if (q2.acc_email)   setAccEmail(q2.acc_email);
    if (q2.dasdate)     setDasdate(q2.dasdate);
    if (q2.doccterm1)   setTerm1(q2.doccterm1);
    if (q2.doccterm2)   setTerm2(q2.doccterm2);
    if (q2.doccterm3)   setTerm3(q2.doccterm3);
    if (q2.doccterm4)   setTerm4(q2.doccterm4);
    if (q2.doccterm5)   setTerm5(q2.doccterm5);
    if (q2.quote6)      setQuote6(q2.quote6);
    if (q2.quote12)     setQuote12(q2.quote12);
    if (q2.quote18)     setQuote18(q2.quote18);
    if (q2.quote24)     setQuote24(q2.quote24);
    if (q2.quote36)     setQuote36(q2.quote36);
    if (q2.acc_damount) setDamount(q2.acc_damount);
    if (q2.com_name)    setComName(q2.com_name);
  }, [router.isReady]);

  // Authenticated PDF download via axios → blob → anchor click
  async function handleDownload() {
    if (!cid) {
      setError("Customer ID is required to generate the PDF.");
      return;
    }
    setError("");
    setDownloading(true);
    try {
      const res = await api.get("/pricing/offer-pdf", {
        params: {
          cid, type: type_,
          acc_name: accName, acc_per: accPer,
          acc_address: accAddress, acc_phone: accPhone, acc_email: accEmail,
          dasdate,
          doccterm1: term1, doccterm2: term2, doccterm3: term3,
          doccterm4: term4, doccterm5: term5,
          quote6, quote12, quote18, quote24, quote36,
          acc_damount: damount, com_name: comName,
        },
        responseType: "blob",
      });
      const url  = URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href     = url;
      link.download = "Pricing Offer.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Failed to generate PDF. Please try again.");
    } finally {
      setDownloading(false);
    }
  }

  // ── Helper: labeled input row ──────────────────────────────────────────────
  function Row({ label, value, onChange }: {
    label: string; value: string; onChange: (v: string) => void;
  }) {
    return (
      <tr>
        <td className="py-1 pr-3 text-sm text-gray-700 font-medium whitespace-nowrap">{label}:</td>
        <td className="py-1">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-full"
          />
        </td>
      </tr>
    );
  }

  return (
    <Layout>
      {/* Title — mirrors pricing_offer_form.php header */}
      <div className="mb-4">
        <p className="text-2xl font-bold">
          <span>Ameri</span>
          <span className="text-red-600">Power</span>
        </p>
        <p className="text-lg font-bold text-center mt-1">
          AmeriPower Pricing Offer Sheet
        </p>
      </div>

      {error && (
        <p className="text-red-600 text-sm mb-3 border border-red-200 bg-red-50 rounded px-3 py-2">
          {error}
        </p>
      )}

      {/* Form — mirrors pricing_offer_form.php fields + pricing_offer.php GET params */}
      <form
        onSubmit={(e) => { e.preventDefault(); handleDownload(); }}
        className="space-y-6"
      >
        {/* Customer Information */}
        <div className="border border-gray-300 rounded">
          <div className="bg-[#4169E1] text-white font-bold px-3 py-1.5 text-sm rounded-t">
            Customer Information
          </div>
          <div className="p-3">
            <table className="w-full">
              <tbody>
                <Row label="Company Name"    value={accName}    onChange={setAccName} />
                <Row label="Contact Person"  value={accPer}     onChange={setAccPer} />
                <Row label="Address"         value={accAddress} onChange={setAccAddress} />
                <Row label="Phone"           value={accPhone}   onChange={setAccPhone} />
                <Row label="Email"           value={accEmail}   onChange={setAccEmail} />
                <Row label="Start Date"      value={dasdate}    onChange={setDasdate} />
                <Row label="Deposit Amount"  value={damount}    onChange={setDamount} />
                <Row label="Agent/Co. Name"  value={comName}    onChange={setComName} />
              </tbody>
            </table>
          </div>
        </div>

        {/* Pricing Summary — 5 terms */}
        <div className="border border-gray-300 rounded">
          <div className="bg-[#4169E1] text-white font-bold px-3 py-1.5 text-sm rounded-t">
            Pricing Summary
          </div>
          <div className="p-3 overflow-x-auto">
            <table className="border-collapse text-sm w-full">
              <thead>
                <tr className="bg-gray-100">
                  <th className="border border-gray-300 px-3 py-1.5 text-left">Term</th>
                  <th className="border border-gray-300 px-3 py-1.5 text-left">Term (months)</th>
                  <th className="border border-gray-300 px-3 py-1.5 text-left">Contract Price (¢/kWh)</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { label: "6-month",  term: term1,  setTerm: setTerm1,  quote: quote6,  setQuote: setQuote6  },
                  { label: "12-month", term: term2,  setTerm: setTerm2,  quote: quote12, setQuote: setQuote12 },
                  { label: "18-month", term: term3,  setTerm: setTerm3,  quote: quote18, setQuote: setQuote18 },
                  { label: "24-month", term: term4,  setTerm: setTerm4,  quote: quote24, setQuote: setQuote24 },
                  { label: "36-month", term: term5,  setTerm: setTerm5,  quote: quote36, setQuote: setQuote36 },
                ].map(({ label, term, setTerm, quote, setQuote }) => (
                  <tr key={label}>
                    <td className="border border-gray-300 px-3 py-1 text-gray-600">{label}</td>
                    <td className="border border-gray-300 px-2 py-1">
                      <input
                        type="text"
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        className="border border-gray-200 rounded px-2 py-0.5 text-sm w-20"
                        placeholder="e.g. 6"
                      />
                    </td>
                    <td className="border border-gray-300 px-2 py-1">
                      <input
                        type="text"
                        value={quote}
                        onChange={(e) => setQuote(e.target.value)}
                        className="border border-gray-200 rounded px-2 py-0.5 text-sm w-24"
                        placeholder="N/A"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Hidden CID + Type (from query params) */}
        <div className="text-xs text-gray-500">
          Customer ID: <span className="font-medium">{cid || "(not set)"}</span>
          {" · "}
          Account Type: <span className="font-medium">{type_}</span>
        </div>

        {/* Submit */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={downloading}
            className="bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-sm font-medium px-6 py-2 rounded transition-colors"
          >
            {downloading ? "Generating…" : "Download Pricing Offer PDF"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="border border-gray-300 text-gray-700 hover:bg-gray-50 text-sm font-medium px-6 py-2 rounded transition-colors"
          >
            Back
          </button>
        </div>

        {/* For Agent Use Only disclaimer — mirrors pricing_offer_form.php table */}
        <div className="border border-gray-300 rounded text-sm">
          <div className="bg-[#B22222] text-white font-bold px-3 py-1.5 rounded-t">
            For Agent Use Only
          </div>
          <div className="bg-gray-50 px-4 py-3 text-xs leading-6">
            <p className="font-medium">
              To ensure AmeriPower LLC can accurately serve your energy needs and avoid
              potential cancellation penalty, please ensure the above mentioned ESI ID(s)
              and start dates are correct before signing.
            </p>
            <p>Customer Signature_____________________</p>
            <p>Customer Name________________________</p>
            <p>Effective Date_________________________</p>
            <br />
            <p>
              <strong>TDSP Charges non-inclusion Statement:</strong>{" "}
              <em>
                By signing customer here acknowledges its understanding that regulated
                TDSP charges are not included in the above pricing quote(s) and will
                appear in bill as a separate line item. These charges vary based on
                customer and TDSP. AmeriPower LLC makes no representation or promise
                regarding TDSP charges.
              </em>
            </p>
          </div>
        </div>

        {/* Bottom note — mirrors PHP bottom paragraph */}
        <p className="text-xs text-gray-600">
          Note: This offer shall only become binding &amp; enforceable when executed
          in accordance with the terms &amp; conditions specified in our contract
          agreement and nothing herein shall be deemed to require AmeriPower LLC to
          enter into any such agreement.
        </p>
      </form>
    </Layout>
  );
}
