import Layout from "../../components/Layout";
import ChargesForm from "../../components/pricing/ChargesForm";

export default function SupplierPage() {
  return (
    <Layout title="Supplier Charges">
      <ChargesForm
        title="Modify Supplier Charges"
        // Add /charges here to match your router prefix
        fetchEndpoint="/pricing/charges/supplier/values"
        updateEndpoint="/pricing/charges/supplier/update"
      />
    </Layout>
  );
}
