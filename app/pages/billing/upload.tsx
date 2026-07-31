import { useCallback, useEffect, useRef, useState } from "react";
import BillingEngineLayout from "../../components/BillingEngineLayout";
import api from "../../utils/api";
import { isAdmin } from "../../utils/auth";

// ── types ─────────────────────────────────────────────────────────────────────

type FileStatus = "pending" | "uploading" | "success" | "duplicate" | "error";

interface QueueItem {
  file: File;
  status: FileStatus;
  found?: number;
  matched?: number;
  interchange?: string;
  error?: string;
}

interface EdiFile {
  id: number;
  interchange_control: string;
  edi_type: string;
  tdsp_name: string | null;
  tdsp_duns: string | null;
  file_date: string | null;
  original_filename: string | null;
  uploaded_by: string | null;
  status: string;
  records_found: number | null;
  records_matched: number | null;
  created_at: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function Spinner() {
  return (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function StatusBadge({ item }: { item: QueueItem }) {
  if (item.status === "pending") {
    return <span className="text-xs text-gray-400">pending</span>;
  }
  if (item.status === "uploading") {
    return (
      <span className="flex items-center gap-1 text-xs text-blue-500">
        <Spinner /> uploading
      </span>
    );
  }
  if (item.status === "success") {
    return (
      <span className="text-xs text-green-600 font-medium">
        {item.matched}/{item.found} matched
        {item.interchange ? ` · ${item.interchange}` : ""}
      </span>
    );
  }
  if (item.status === "duplicate") {
    return (
      <span className="text-xs text-yellow-600 font-medium" title={item.error}>
        duplicate
      </span>
    );
  }
  return (
    <span className="text-xs text-red-500 font-medium" title={item.error}>
      error
    </span>
  );
}

function statusIcon(status: FileStatus) {
  if (status === "pending")   return <span className="text-gray-300 text-base leading-none">○</span>;
  if (status === "uploading") return <span className="text-blue-400 text-base leading-none">◑</span>;
  if (status === "success")   return <span className="text-green-500 text-base leading-none">✓</span>;
  if (status === "duplicate") return <span className="text-yellow-500 text-base leading-none">⊘</span>;
  return                             <span className="text-red-400 text-base leading-none">✗</span>;
}

// ── drop zone panel ───────────────────────────────────────────────────────────

interface PanelProps {
  label: string;
  accept?: string;
  queue: QueueItem[];
  onAddFiles: (files: File[]) => void;
  onUpload: () => void;
  onClear: () => void;
  uploading: boolean;
}

function UploadPanel({
  label, accept = ".txt,.dat,*", queue, onAddFiles, onUpload, onClear, uploading,
}: PanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length) onAddFiles(files);
    },
    [onAddFiles],
  );

  const pending = queue.filter((q) => q.status === "pending").length;
  const done    = queue.filter((q) => q.status === "success" || q.status === "duplicate").length;
  const errors  = queue.filter((q) => q.status === "error").length;

  return (
    <div className="flex-1 bg-white border border-gray-200 rounded-lg overflow-hidden min-w-0">
      {/* header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">{label}</span>
        {queue.length > 0 && (
          <span className="text-xs text-gray-400">
            {queue.length} file{queue.length !== 1 ? "s" : ""}
            {done > 0 && <> · <span className="text-green-600">{done} ok</span></>}
            {errors > 0 && <> · <span className="text-red-500">{errors} failed</span></>}
          </span>
        )}
      </div>

      {/* drop zone */}
      <div className="px-4 pt-4">
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed py-6 cursor-pointer transition-colors ${
            dragOver
              ? "border-green-400 bg-green-50"
              : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
          }`}
        >
          <svg className="w-8 h-8 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          <p className="text-xs text-gray-400">
            Drag files here or <span className="text-green-600 font-medium">click to browse</span>
          </p>
          <p className="text-xs text-gray-300">Multiple files supported</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onAddFiles(files);
            e.target.value = "";
          }}
        />
      </div>

      {/* file list */}
      {queue.length > 0 && (
        <ul className="px-4 pt-3 space-y-1 max-h-56 overflow-y-auto">
          {queue.map((item, i) => (
            <li key={i} className="flex items-center gap-2 py-1">
              {statusIcon(item.status)}
              <span className="flex-1 text-xs text-gray-600 truncate min-w-0" title={item.file.name}>
                {item.file.name}
              </span>
              <StatusBadge item={item} />
            </li>
          ))}
        </ul>
      )}

      {/* actions */}
      <div className="px-4 py-3 mt-3 flex items-center gap-2">
        <button
          onClick={onClear}
          disabled={queue.length === 0 || uploading}
          className="px-3 py-1.5 text-xs text-gray-500 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-40 transition-colors"
        >
          Clear
        </button>
        <div className="flex-1" />
        <button
          onClick={onUpload}
          disabled={pending === 0 || uploading}
          className="flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white text-xs font-medium rounded hover:bg-green-700 disabled:opacity-40 transition-colors"
        >
          {uploading && <Spinner />}
          {uploading ? "Uploading…" : `Upload ${pending > 0 ? pending : ""} File${pending !== 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

// ── history table ─────────────────────────────────────────────────────────────

function HistoryTable({ rows, loading, onRefresh }: {
  rows: EdiFile[];
  loading: boolean;
  onRefresh: () => void;
}) {
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [rowError, setRowError]     = useState<{ id: number; msg: string } | null>(null);
  const admin = isAdmin();

  const handleDelete = async (row: EdiFile) => {
    if (!window.confirm(
      `Delete "${row.original_filename ?? row.interchange_control}"?\n\n` +
      `This permanently deletes the file and all its parsed records. ` +
      `Blocked if any record has already been matched to a billing period.`
    )) return;

    setRowError(null);
    setDeletingId(row.id);
    try {
      await api.delete(`/admin/edi-files/${row.id}`);
      onRefresh();
    } catch (e: any) {
      setRowError({ id: row.id, msg: e?.response?.data?.detail ?? "Delete failed." });
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
        <span className="text-sm font-semibold text-gray-700">Upload History</span>
        <button
          onClick={onRefresh}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700 disabled:opacity-40"
        >
          {loading ? <Spinner /> : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          )}
          Refresh
        </button>
      </div>

      {loading && rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-gray-400">No uploads yet.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">Filename</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">Type</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">TDSP</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">File Date</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">Found</th>
                <th className="px-3 py-2 text-right text-gray-500 font-medium">Matched</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">Status</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">Uploaded At</th>
                {admin && <th className="px-3 py-2 text-right text-gray-500 font-medium">&nbsp;</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={r.original_filename ?? ""}>
                    {r.original_filename ?? "—"}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                      r.edi_type === "867_03"
                        ? "bg-blue-50 text-blue-700"
                        : "bg-purple-50 text-purple-700"
                    }`}>
                      {r.edi_type}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-600">{r.tdsp_name ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{r.file_date ?? "—"}</td>
                  <td className="px-3 py-2 text-gray-700 text-right">{r.records_found ?? "—"}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={r.records_matched === r.records_found && r.records_found !== null
                      ? "text-green-600 font-medium"
                      : "text-orange-500 font-medium"
                    }>
                      {r.records_matched ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium ${
                      r.status === "matched"   ? "bg-green-50 text-green-700"  :
                      r.status === "duplicate" ? "bg-yellow-50 text-yellow-700" :
                      r.status === "partial"   ? "bg-orange-50 text-orange-700" :
                      "bg-gray-100 text-gray-500"
                    }`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-400 whitespace-nowrap">
                    {r.created_at ? new Date(r.created_at).toLocaleString() : "—"}
                  </td>
                  {admin && (
                    <td className="px-3 py-2 text-right">
                      <button
                        onClick={() => handleDelete(r)}
                        disabled={deletingId === r.id}
                        className="text-xs text-red-500 hover:text-red-700 disabled:opacity-40"
                        title="Delete this file and its records (blocked if already billed)"
                      >
                        {deletingId === r.id ? "…" : "Delete"}
                      </button>
                      {rowError?.id === r.id && (
                        <p className="text-xs text-red-500 mt-1 max-w-[220px] ml-auto text-right">{rowError.msg}</p>
                      )}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function BillingUploadPage() {
  const [queue867, setQueue867] = useState<QueueItem[]>([]);
  const [queue810, setQueue810] = useState<QueueItem[]>([]);
  const [uploading867, setUploading867] = useState(false);
  const [uploading810, setUploading810] = useState(false);

  const [history, setHistory]         = useState<EdiFile[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);

  // ── history loader ─────────────────────────────────────────────────────────
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      const res = await api.get("/billing-engine/files?limit=100");
      setHistory(res.data);
    } catch {
      // silently ignore — table shows "No uploads yet"
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // ── add files helpers ──────────────────────────────────────────────────────
  const addFiles = (
    files: File[],
    setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>,
  ) => {
    setQueue((prev) => {
      const existingNames = new Set(prev.map((q) => q.file.name));
      const fresh = files
        .filter((f) => !existingNames.has(f.name))
        .map((f): QueueItem => ({ file: f, status: "pending" }));
      return [...prev, ...fresh];
    });
  };

  // ── sequential upload ──────────────────────────────────────────────────────
  const runUpload = async (
    endpoint: string,
    snapshot: QueueItem[],
    setQueue: React.Dispatch<React.SetStateAction<QueueItem[]>>,
    setUploading: React.Dispatch<React.SetStateAction<boolean>>,
  ) => {
    setUploading(true);
    for (let i = 0; i < snapshot.length; i++) {
      if (snapshot[i].status !== "pending") continue;

      setQueue((q) => q.map((item, j) =>
        j === i ? { ...item, status: "uploading" } : item,
      ));

      const fd = new FormData();
      fd.append("file", snapshot[i].file);

      try {
        const res = await api.post(endpoint, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
        setQueue((q) => q.map((item, j) =>
          j === i
            ? {
                ...item,
                status: "success",
                found: res.data.records_found,
                matched: res.data.records_matched,
                interchange: res.data.interchange_control,
              }
            : item,
        ));
      } catch (err: any) {
        const status = err?.response?.status;
        const detail = err?.response?.data?.detail ?? "Upload failed";
        setQueue((q) => q.map((item, j) =>
          j === i
            ? { ...item, status: status === 409 ? "duplicate" : "error", error: detail }
            : item,
        ));
      }
    }
    setUploading(false);
    loadHistory();
  };

  const handle867Upload = () => {
    const snapshot = [...queue867];
    runUpload("/billing-engine/upload/867", snapshot, setQueue867, setUploading867);
  };

  const handle810Upload = () => {
    const snapshot = [...queue810];
    runUpload("/billing-engine/upload/810", snapshot, setQueue810, setUploading810);
  };

  return (
    <BillingEngineLayout title="EDI Upload">
      {/* page header */}
      <div className="mb-6">
        <h2 className="text-base font-semibold text-gray-800">EDI File Upload</h2>
        <p className="text-xs text-gray-400 mt-0.5">
          Upload ERCOT 867 usage files and 810 TDSP invoice files. Multiple files can be queued and uploaded in batch.
        </p>
      </div>

      {/* two-panel upload row */}
      <div className="flex gap-4 mb-6">
        <UploadPanel
          label="867 Usage Files"
          queue={queue867}
          onAddFiles={(files) => addFiles(files, setQueue867)}
          onUpload={handle867Upload}
          onClear={() => setQueue867([])}
          uploading={uploading867}
        />
        <UploadPanel
          label="810 TDSP Invoice Files"
          queue={queue810}
          onAddFiles={(files) => addFiles(files, setQueue810)}
          onUpload={handle810Upload}
          onClear={() => setQueue810([])}
          uploading={uploading810}
        />
      </div>

      {/* history */}
      <HistoryTable rows={history} loading={historyLoading} onRefresh={loadHistory} />
    </BillingEngineLayout>
  );
}
