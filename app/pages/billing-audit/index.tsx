import { useEffect } from "react";
import { useRouter } from "next/router";

export default function BillingAuditIndex() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/billing-audit/upload");
  }, []);

  return null;
}
