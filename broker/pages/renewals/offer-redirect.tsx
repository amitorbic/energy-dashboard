import { useEffect } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn } from "../../utils/auth";

/**
 * Mirrors renewal_offer_redirect.php.
 *
 * PHP logic:
 *   SELECT * FROM renewal_offer WHERE sr = $_GET['pass']
 *   Deserializes esid_list, sets session vars, redirects to amendment_form.php
 *
 * In the Next.js flow, amendment_form.php maps to the renewal offer sheet form
 * (not yet fully implemented). This page serves as the routing stub.
 */
export default function OfferRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    // amendment_form.php equivalent is not yet implemented
    // Redirect to active renewals page as fallback
    router.replace("/renewals/active");
  }, []);

  return (
    <Layout>
      <p className="text-sm text-gray-500">Redirecting…</p>
    </Layout>
  );
}
