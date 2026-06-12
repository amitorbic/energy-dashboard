import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../components/Layout";
import { isLoggedIn, isAdmin } from "../../utils/auth";
import api from "../../utils/api";

interface RenewalRecord {
  broker_code: string;
  broker_name: string;
  com_name:    string;
  email:       string;
  esid_list:   string[];
  start_date:  string;
  text:        string;
  sr?:         number;
}

interface UploadResponse {
  success:  boolean;
  message:  string;
  records:  RenewalRecord[];
}

/**
 * Mirrors renewal_offer_upload.php — admin-only Excel upload for renewal offers.
 *
 * Expected Excel columns:
 *   A=Cust ID, B=Premise ID, C=Company Name, D=Load Profile,
 *   E=Service Address, I=Agent Code, J=Agent Name, L=Cust Email,
 *   M=Contract End Date
 *
 * On upload:
 *   1. Truncates renewal_offer table.
 *   2. Parses + validates headers.
 *   3. Groups rows by company name, computes expiry status.
 *   4. Inserts records, returns table for review.
 *
 * PHP note: after upload shows "For Multiple Esiids Please Cross Check Renewal Offer (PDF)"
 * Pricing "Go" button opens /renewals/offer-redirect?sr=X (future block).
 */
export default function OfferUploadPage() {
  const router   = useRouter();
  const fileRef  = useRef<HTMLInputElement>(null);
  const [msg, setMsg]           = useState("");
  const [error, setError]       = useState("");
  const [records, setRecords]   = useState<RenewalRecord[]>([]);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    if (!isAdmin())    { router.replace("/home"); return; }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setMsg("");
    setError("");
    setRecords([]);
    setUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await api.post<UploadResponse>("/renewals/upload-offer", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      if (res.data.success) {
        setMsg(res.data.message);
        setRecords(res.data.records);
      } else {
        setError(res.data.message);
      }
    } catch {
      setError("Upload failed. Please check the file format and try again.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Layout>
      <section className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">Upload Renewal Sheet</h2>
      </section>

      {/* Success / error messages — mirrors PHP echo $msg */}
      {msg && (
        <p className="text-center text-green-700 font-bold mb-3">{msg}</p>
      )}
      {error && (
        <p className="text-center text-red-600 font-bold mb-3">{error}</p>
      )}

      {/* Upload form — mirrors renewal_offer_upload.php form */}
      <form onSubmit={handleSubmit} encType="multipart/form-data">
        <table>
          <tbody>
            <tr id="upload_row">
              <td>
                <input
                  type="file"
                  name="file"
                  ref={fileRef}
                  accept=".xlsx,.xls"
                  className="text-sm"
                />
              </td>
              <td className="pl-3">
                <button
                  type="submit"
                  name="submit_file"
                  disabled={uploading}
                  className="bg-blue-700 hover:bg-blue-800 disabled:bg-blue-400 text-white text-sm font-medium px-4 py-1.5 rounded cursor-pointer"
                >
                  {uploading ? "Uploading…" : "Submit"}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </form>

      <br /><br />

      {/* Results table — mirrors PHP renewal_offer table display after upload */}
      {records.length > 0 && (
        <>
          <h3 className="text-center font-bold text-red-600 mb-3">
            For Multiple Esiids Please Cross Check Renewal Offer (PDF)
          </h3>

          <div className="overflow-x-auto">
            <table
              className="border-collapse text-xs"
              style={{ width: 850, borderTop: "1px solid #ccc" }}
            >
              <thead>
                <tr>
                  {[
                    "Sr", "Broker Code", "Broker Name", "Company Name",
                    "Con. End Date", "Con. Status", "Esid List", "Pricing",
                  ].map((h) => (
                    <th
                      key={h}
                      className="border-l border-b border-gray-300 px-2 py-1.5 text-center bg-gray-50"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {records.map((row, idx) => (
                  <tr
                    key={idx}
                    style={{ backgroundColor: idx % 2 === 0 ? "#CCCCFF" : "#FFFFFF" }}
                    className="h-10"
                  >
                    <td className="border-l border-b border-gray-300 px-2 text-center">
                      {idx + 1}
                    </td>
                    <td className="border-l border-b border-gray-300 px-2 text-center">
                      &nbsp;{row.broker_code}&nbsp;
                    </td>
                    <td className="border-l border-b border-gray-300 px-2 text-center">
                      &nbsp;{row.broker_name}&nbsp;
                    </td>
                    <td className="border-l border-b border-gray-300 px-3">
                      &nbsp;{row.com_name}&nbsp;
                    </td>
                    <td className="border-l border-b border-gray-300 px-3">
                      {row.start_date}
                    </td>
                    <td className="border-l border-b border-gray-300 px-3">
                      {row.text}&nbsp;
                    </td>
                    <td className="border-l border-b border-gray-300 px-3 pr-1">
                      {row.esid_list.map((esid, i) => (
                        <span key={i}>&nbsp;{esid}<br /></span>
                      ))}
                      &nbsp;
                    </td>
                    <td className="border-l border-b border-r border-gray-300 text-center px-1">
                      {/* "Go" → /renewals/offer-redirect?sr=X (future block) */}
                      <button
                        type="button"
                        onClick={() =>
                          router.push(`/renewals/offer-redirect?sr=${idx + 1}`)
                        }
                        className="bg-gray-200 hover:bg-gray-300 border border-gray-400 text-xs px-2 py-0.5 rounded"
                      >
                        Go
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Layout>
  );
}
