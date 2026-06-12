import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import Layout from "../../../components/Layout";
import { isLoggedIn, isAdmin } from "../../../utils/auth";
import api from "../../../utils/api";

interface UploadResult {
  success:  boolean;
  message:  string;
  inserted: number;
  skipped:  number;
  errors:   string[];
}

/**
 * Mirrors contract_user_upload.php — admin only.
 *
 * Expected Excel columns (1-indexed):
 *   B (col 2) = broker_id
 *   C (col 3) = name
 *
 * Email pulled from broker_new.pricing_email (phpserialize, first comma-split value).
 * Generates random 6-char password per user.
 * Skips existing broker_ids.
 * Inserts with role='3'.
 *
 * PHP validation: file must be .xls — we accept .xlsx too (openpyxl).
 */
export default function AdminUploadPage() {
  const router  = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [result,    setResult]    = useState<UploadResult | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error,     setError]     = useState("");

  useEffect(() => {
    if (!isLoggedIn()) { router.replace("/"); return; }
    if (!isAdmin())    { router.replace("/home"); return; }
  }, []);

  function validate(): boolean {
    const file = fileRef.current?.files?.[0];
    if (!file) { alert("Please select a file"); return false; }
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "xls" && ext !== "xlsx") {
      alert("File must be .xls or .xlsx"); return false;
    }
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setUploading(true); setResult(null); setError("");
    const fd = new FormData();
    fd.append("file", fileRef.current!.files![0]);

    try {
      const res = await api.post<UploadResult>(
        "/profile/admin/users/upload", fd,
        { headers: { "Content-Type": "multipart/form-data" } },
      );
      setResult(res.data);
    } catch {
      setError("Upload failed. Please check the file format.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <Layout>
      <section className="mb-3">
        <h2 className="text-xl font-bold text-gray-800">Upload Users</h2>
        <p className="text-xs text-gray-500 mt-1">
          Excel columns: B = Broker ID, C = Name. Email is auto-fetched from broker_new.
        </p>
      </section>

      {error && <p className="text-red-600 text-sm mb-3">{error}</p>}

      <form onSubmit={handleSubmit} encType="multipart/form-data">
        <table>
          <tbody>
            <tr>
              <td className="pr-3 py-1 text-sm">File :</td>
              <td className="py-1">
                <input type="file" ref={fileRef} name="contract_user_data"
                  accept=".xls,.xlsx" className="text-sm" />
              </td>
            </tr>
            <tr>
              <td className="h-10">&nbsp;</td>
              <td>
                <input type="submit" name="Submit"
                  value={uploading ? "Uploading…" : "Submit"}
                  disabled={uploading}
                  className="border border-gray-300 bg-gray-100 hover:bg-gray-200 disabled:bg-gray-50 text-sm px-4 py-1 cursor-pointer" />
              </td>
            </tr>
          </tbody>
        </table>
      </form>

      {result && (
        <div className={`mt-4 p-4 rounded border text-sm ${
          result.success
            ? "bg-green-50 border-green-200 text-green-800"
            : "bg-red-50 border-red-200 text-red-800"
        }`}>
          <p className="font-medium">{result.message}</p>
          <p className="mt-1">Inserted: {result.inserted} &nbsp;|&nbsp; Skipped: {result.skipped}</p>
          {result.errors.length > 0 && (
            <ul className="mt-2 list-disc list-inside text-xs text-red-700">
              {result.errors.map((e, i) => <li key={i}>{e}</li>)}
            </ul>
          )}
        </div>
      )}
    </Layout>
  );
}