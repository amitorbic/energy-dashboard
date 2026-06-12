import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn, isAdmin } from "../../utils/auth";
import api from "../../utils/api";

/**
 * Commission download — user's spec:
 *   "When the commission link is accessed, the system must securely email
 *    the commission file link directly to the broker's registered email address."
 *
 * Replaces PHP download_comm.php password-gate with a secure email delivery.
 * Admin does not see this page (commission link hidden for admin in Layout).
 *
 * Backend:
 *   POST /broker/profile/commission-email
 *   SELECT c.comm_file_link FROM comm_vendors c
 *   LEFT JOIN broker_new b ON b.vendor = c.vendor
 *   WHERE b.broker_code = :broker_id
 *   → emails URL (COMMISSION_BASE_URL + comm_file_link) to broker's email
 */
export default function CommissionPage() {
  const router = useRouter();
  const [status,  setStatus]  = useState<"idle"|"sending"|"done"|"error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    if (isAdmin())     { router.replace("/home"); return; }

    // Trigger email automatically on page load
    triggerEmail();
  }, []);

  async function triggerEmail() {
    setStatus("sending");
    try {
      const res = await api.post<{ success: boolean; message: string }>(
        "/profile/commission-email",
      );
      setMessage(res.data.message);
      setStatus(res.data.success ? "done" : "error");
    } catch {
      setMessage("Failed to send commission email. Please try again.");
      setStatus("error");
    }
  }

  return (
    <Layout>
      <section className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">Download Commission</h2>
      </section>

      <div className="max-w-md">
        {status === "sending" && (
          <p className="text-sm text-gray-500">
            Sending your commission file link to your registered email…
          </p>
        )}

        {status === "done" && (
          <div className="border border-green-200 bg-green-50 rounded p-4 text-sm text-green-800">
            <p className="font-medium">Commission link sent!</p>
            <p className="mt-1">{message}</p>
            <p className="mt-3 text-gray-600">
              Please check your registered email inbox for the download link.
            </p>
          </div>
        )}

        {status === "error" && (
          <div className="border border-red-200 bg-red-50 rounded p-4 text-sm text-red-800">
            <p className="font-medium">Could not send commission email.</p>
            <p className="mt-1">{message}</p>
            <button
              onClick={triggerEmail}
              className="mt-3 border border-gray-300 bg-gray-100 hover:bg-gray-200 text-sm px-4 py-1"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
}
