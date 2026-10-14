// Pure helpers that turn the Portfolio contract upload response into something a
// non-technical user can read. No React, no imports, so it can be checked with
// plain node (see uploadReport.check.mjs).

export interface UploadProblem {
  row: number;
  column: string;
  value: string;
  code: string;
  message: string;
  fix: string;
}

export interface ProblemGroup {
  key: string;
  title: string;
  fix: string;
  problems: UploadProblem[];
}

export type UploadView =
  | { kind: "accepted"; inserted: number; updated: number; totalRows: number }
  | {
      kind: "rejected";
      totalRows: number;
      badRows: number;
      problemCount: number;
      problems: UploadProblem[];
      groups: ProblemGroup[];
    }
  | { kind: "unknown"; message: string };

export interface UploadErrorView {
  title: string;
  message: string;
  advice: string;
}

const GROUP_TITLES: Record<string, string> = {
  esi_has_space: "ESI ID contains spaces or symbols",
  esi_has_symbol: "ESI ID contains spaces or symbols",
  rate_not_number: "Contract rate is not a valid rate",
  rate_out_of_range: "Contract rate is not a valid rate",
  volume_not_number: "Annual volume is not a valid number",
  volume_negative: "Annual volume is not a valid number",
  profile_unknown: "Load profile is not in the master list",
  end_date_invalid: "Contract end date is not a real date",
  start_date_invalid: "Contract start date is not a real date",
  type_not_recognised: "Contract type is not recognised",
  future_needs_start: "Future contracts are missing a start date",
};

const num = (v: unknown): number => (typeof v === "number" && isFinite(v) ? v : 0);
const str = (v: unknown): string => (v === null || v === undefined ? "" : String(v));

function groupKey(p: UploadProblem): string {
  const title = GROUP_TITLES[p.code];
  if (p.code === "missing_value") return `missing_value:${p.column}`;
  return title ?? p.code;
}

function groupTitle(p: UploadProblem): string {
  if (p.code === "missing_value") return `${p.column || "A required column"} is empty`;
  return GROUP_TITLES[p.code] ?? (p.message || "Other problem");
}

export function describeUploadResponse(data: unknown): UploadView {
  const d = (data ?? {}) as Record<string, any>;
  if (d.accepted === false || Array.isArray(d.invalid_rows)) {
    const rows: any[] = Array.isArray(d.invalid_rows) ? d.invalid_rows : [];
    const problems: UploadProblem[] = [];
    for (const r of rows) {
      const rowNo = num(r?.row) || num(r?.line);
      if (Array.isArray(r?.problems) && r.problems.length > 0) {
        for (const p of r.problems) {
          problems.push({
            row: num(p?.row) || rowNo,
            column: str(p?.column),
            value: str(p?.value),
            code: str(p?.code) || "other",
            message: str(p?.message) || "This value is not valid.",
            fix: str(p?.fix),
          });
        }
      } else if (Array.isArray(r?.errors)) {
        // older backend: messages only
        for (const m of r.errors) {
          problems.push({ row: rowNo, column: "", value: "", code: "other", message: str(m), fix: "" });
        }
      }
    }
    const groupMap = new Map<string, ProblemGroup>();
    for (const p of problems) {
      const k = groupKey(p);
      let g = groupMap.get(k);
      if (!g) {
        g = { key: k, title: groupTitle(p), fix: p.fix, problems: [] };
        groupMap.set(k, g);
      }
      g.problems.push(p);
    }
    const groups = Array.from(groupMap.values()).sort((a, b) => b.problems.length - a.problems.length);
    return {
      kind: "rejected",
      totalRows: num(d.total_rows),
      badRows: num(d.error_count) || rows.length,
      problemCount: problems.length,
      problems,
      groups,
    };
  }
  if (d.accepted === true || typeof d.inserted === "number" || typeof d.updated === "number") {
    return { kind: "accepted", inserted: num(d.inserted), updated: num(d.updated), totalRows: num(d.total_rows) };
  }
  return { kind: "unknown", message: "The server answered, but the reply was not in the expected form. Nothing can be confirmed as imported; check the contract list before uploading again." };
}

function detailText(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((x) => (typeof x === "string" ? x : str((x as any)?.msg))).filter(Boolean).join("; ");
  }
  return "";
}

export function describeUploadError(e: any): UploadErrorView {
  const status: number | undefined = e?.response?.status;
  const message = detailText(e?.response?.data?.detail);
  if (!e?.response) {
    if (e?.code === "ECONNABORTED") {
      return {
        title: "No answer yet. The upload may still be running, or it may have finished.",
        message: "The page stopped waiting for a reply. This does not mean the upload failed.",
        advice: "Wait a minute, then check the Portfolio page (/portfolio) to see whether the contracts are there. Do not upload the file again until you have checked.",
      };
    }
    return {
      title: "Could not reach the server",
      message: "The request did not get a reply.",
      advice: "Check your connection. The upload may still have run: wait a minute and check the Portfolio page (/portfolio) before trying again.",
    };
  }
  if (status === 409 && /another upload/i.test(message)) {
    return { title: "Another upload is still running", message, advice: "Wait for it to finish, then check the Portfolio page (/portfolio). Do not start the upload again until then." };
  }
  if (status === 409) {
    return { title: "Upload is turned off for this account", message: message || "This tenant is on the full platform.", advice: "Contract data now syncs automatically, so there is nothing to upload." };
  }
  if (status === 503) {
    return { title: "Upload is not ready yet", message: message || "A reference list the upload needs is not available.", advice: "Ask support to run the reference data sync for this account, then try again. Nothing was imported." };
  }
  if (status === 401 || status === 403) {
    return { title: "Not signed in or not allowed", message: message || "Your session has expired or you do not have permission.", advice: "Sign in again as an admin, then retry." };
  }
  if (status === 400 || status === 422) {
    return { title: "The file could not be read", message: message || "The file is not in the expected form.", advice: "Check that it is a CSV that uses the column headings from the template, then upload again. Nothing was imported." };
  }
  return { title: "Upload failed", message: message || `The server returned an error${status ? ` (${status})` : ""}.`, advice: "Try again. If it keeps failing, contact support. Nothing was confirmed as imported." };
}

function csvCell(v: string): string {
  let s = v;
  // stop spreadsheet programs from running a value as a formula
  if (/^[=@\t\r]/.test(s) || /^[+-][^0-9.]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function problemsToCsv(problems: UploadProblem[]): string {
  const lines = ["Row,Column,Value,Problem,How to fix"];
  for (const p of problems) {
    lines.push([String(p.row), p.column, p.value, p.message, p.fix].map(csvCell).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

export function shownValue(v: string): string {
  return v === "" ? "(blank)" : v;
}
