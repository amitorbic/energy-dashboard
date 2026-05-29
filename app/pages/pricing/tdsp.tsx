import Layout from "../../components/Layout";
import ChargesForm from "../../components/pricing/ChargesForm";

export default function TDSPPage() {
  return (
    <Layout title="TDSP Charges">
      <ChargesForm
        title="Modify TDSP Charges"
        // Add /charges here to match your router prefix
        fetchEndpoint="/pricing/charges/tdsp/values"
        updateEndpoint="/pricing/charges/tdsp/update"
      />
    </Layout>
  );
}
