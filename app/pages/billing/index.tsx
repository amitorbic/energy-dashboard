import { useEffect } from "react";
import { useRouter } from "next/router";

export default function BillingIndex() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/billing/upload");
  }, []);

  return null;
}
