import { useEffect } from "react";
import { useRouter } from "next/router";
import ContractLayout from "../../components/ContractLayout";

export default function EditConfirmation() {
  const router = useRouter();
  const { sid } = router.query;

  useEffect(() => {
    if (sid) {
      router.replace(`/contracts/send?sid=${sid}`);
    } else if (router.isReady) {
      router.replace("/contracts/view");
    }
  }, [sid, router.isReady, router]);

  return (
    <ContractLayout title="Edit Confirmation">
      <div className="text-sm p-8" style={{ color: "var(--ct-text-muted)" }}>Loading...</div>
    </ContractLayout>
  );
}
