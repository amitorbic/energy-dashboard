import { useEffect } from "react";
import { useRouter } from "next/router";
import { PlusCircle, MinusCircle } from "lucide-react";
import Layout from "../components/Layout";
import { isLoggedIn } from "../utils/auth";

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    if (!isLoggedIn()) router.replace("/login");
  }, [router]);

  return (
    <Layout title="Dashboard">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">
          Meter Requests
        </h2>
        <p className="text-gray-500 text-sm mb-8">
          Select an option below to submit a meter add or cancellation request.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          {/* Add Meters */}
          <button
            onClick={() => router.push("/meters/add")}
            className="group bg-white rounded-2xl border-2 border-gray-200 hover:border-green-400 p-8
                       flex flex-col items-center gap-4 transition-all hover:shadow-md text-left"
          >
            <div className="w-16 h-16 bg-green-100 group-hover:bg-green-500 rounded-2xl flex items-center justify-center transition-colors">
              <PlusCircle className="h-8 w-8 text-green-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Add Meters</h3>
              <p className="text-gray-500 text-sm mt-1">
                Submit a request to enroll meters for service
              </p>
            </div>
          </button>

          {/* Cancel Meters */}
          <button
            onClick={() => router.push("/meters/cancel")}
            className="group bg-white rounded-2xl border-2 border-gray-200 hover:border-red-400 p-8
                       flex flex-col items-center gap-4 transition-all hover:shadow-md text-left"
          >
            <div className="w-16 h-16 bg-red-100 group-hover:bg-red-500 rounded-2xl flex items-center justify-center transition-colors">
              <MinusCircle className="h-8 w-8 text-red-600 group-hover:text-white transition-colors" />
            </div>
            <div>
              <h3 className="font-bold text-gray-900 text-lg">Cancel Meters</h3>
              <p className="text-gray-500 text-sm mt-1">
                Submit a request to cancel meters from service
              </p>
            </div>
          </button>
        </div>
      </div>
    </Layout>
  );
}
