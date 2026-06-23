import { useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn } from "../../utils/auth";

/*
 * LOA email-send feature is temporarily disabled.
 *
 * Background: the four hardcoded TDSP addresses (loa@oncor.com,
 * loa@centerpointenergy.com, loa@aeptexas.com, loa@tnmp.com) were found to
 * be incorrect or outdated for at least three of the four utilities. Oncor
 * and AEP Texas have moved LOA intake to web portals; CenterPoint uses CRIP
 * and does not accept email submissions from REPs; only TNMP confirmed an
 * email address (LOA@tnmp.com), but it is disabled here for consistency until
 * all four are verified.
 *
 * To re-enable: restore the full form from git history and update
 * _TDSP_EMAILS in api/controllers/broker_forms.py with the confirmed
 * addresses / portal URLs for each TDSP.
 *
 * Backend route POST /broker/forms/loa-upload and send_loa_email() in
 * api/controllers/broker_forms.py remain intact and are unchanged.
 */

const TDSP_PORTALS = [
  {
    name: "Oncor",
    instruction: "Submit via Oncor's Competitive Retailer Information Portal or email contactcenter@oncor.com.",
    url: "https://www.oncor.com/content/oncorwww/us/en/home/partners/retail-electric-providers/letter-of-authorization.html",
  },
  {
    name: "CenterPoint Energy",
    instruction: "Submit via CenterPoint's CRIP (Competitive Retailer Information Portal). Email submission is not accepted.",
    url: "https://www.centerpointenergy.com/en-us/Services/Pages/CRIP-User-Guides.aspx",
  },
  {
    name: "AEP Texas",
    instruction: "Submit via the AEP Texas Usage Hub (required since Jan 2021). Email aep_tx_usage_requests@aep.com to request portal access.",
    url: "https://www.aeptexas.com/account/service/choice/LettersOfAuthorization.aspx",
  },
  {
    name: "TNMP",
    instruction: "Email your signed LOA directly to LOA@tnmp.com. Include the reply-to address where TNMP should return the completed LOA.",
    url: "https://tnmp.com/retail-providers/loa-historical-usage",
  },
];

export default function LoaUploadPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/");
  }, []);

  return (
    <Layout>
      <section className="mb-5">
        <h2 className="text-xl font-bold text-gray-800">Upload LOA</h2>
      </section>

      <div className="border border-yellow-300 bg-yellow-50 rounded p-4 mb-6 text-sm text-yellow-800">
        <p className="font-semibold mb-1">This feature is temporarily disabled.</p>
        <p>
          LOA submissions must currently be made directly through each utility&apos;s
          own portal or contact address. The automated email delivery to TDSP
          intake addresses has been suspended while the correct submission process
          is confirmed for each utility.
        </p>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        Use the direct submission instructions below for each TDSP:
      </p>

      <div className="space-y-3">
        {TDSP_PORTALS.map(({ name, instruction, url }) => (
          <div key={name} className="border border-gray-200 rounded p-4 bg-white">
            <p className="font-semibold text-gray-800 text-sm mb-1">{name}</p>
            <p className="text-sm text-gray-600 mb-2">{instruction}</p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-blue-600 hover:underline break-all"
            >
              {url}
            </a>
          </div>
        ))}
      </div>
    </Layout>
  );
}
