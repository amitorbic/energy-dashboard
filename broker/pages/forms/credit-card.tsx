import { useEffect } from "react";
import { useRouter } from "next/router";

/**
 * Credit Card form shares the same fields and endpoint as the ACH form
 * (mirrors ach_form.php which contains the Credit Card Information section).
 * Redirects to /forms/ach.
 */
export default function CreditCardPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/forms/ach");
  }, []);
  return null;
}
