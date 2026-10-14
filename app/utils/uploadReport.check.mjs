// Run from app/:  node utils/uploadReport.check.mjs
// (Node 22.6+ runs the .ts import directly.) Exits non-zero on the first failure.
import assert from "node:assert/strict";
import { describeUploadResponse, describeUploadError, problemsToCsv } from "./uploadReport.ts";

const prob = (row, column, value, code, message, fix) => ({ row, column, value, code, message, fix });

// 1. rejected, new shape
const rejected = {
  accepted: false, total_rows: 10727, error_count: 2, problem_count: 3,
  invalid_rows: [
    { line: 57, row: 57, esi_id: "X", errors: ["a"], problems: [
      prob(57, "contract_rate", "4.65", "rate_out_of_range", "Contract rate must be a number ...", "divide by 100"),
      prob(57, "contract_end_date", "", "missing_value", "Contract end date is required.", "Fill in contract_end_date for this row."),
    ] },
    { line: 58, row: 58, esi_id: "Y", errors: ["b"], problems: [
      prob(58, "contract_rate", "abc", "rate_not_number", "Contract rate must be a number ...", "plain number"),
    ] },
  ],
};
let v = describeUploadResponse(rejected);
assert.equal(v.kind, "rejected");
assert.equal(v.badRows, 2);
assert.equal(v.problemCount, 3);
assert.equal(v.totalRows, 10727);
assert.equal(v.groups.length, 2); // both rate codes share one group; missing end date is another
assert.equal(v.groups[0].problems.length, 2);
const csv = problemsToCsv(v.problems);
assert.ok(csv.includes("Row,Column,Value,Problem,How to fix"));
assert.ok(csv.includes("57,contract_rate,4.65"));

// 2. rejected, old shape (messages only): still renders, no crash, no blanks
v = describeUploadResponse({ accepted: false, total_rows: 5, error_count: 1, invalid_rows: [{ line: 3, errors: ["bad thing"] }] });
assert.equal(v.kind, "rejected");
assert.equal(v.problems[0].row, 3);
assert.equal(v.problems[0].message, "bad thing");

// 3. accepted
v = describeUploadResponse({ accepted: true, inserted: 7, updated: 3, total_rows: 10, rows: [] });
assert.deepEqual(v, { kind: "accepted", inserted: 7, updated: 3, totalRows: 10 });

// 4. unexpected / empty body never produces an empty template
assert.equal(describeUploadResponse({}).kind, "unknown");
assert.equal(describeUploadResponse(null).kind, "unknown");

// 5. errors
const mk = (status, detail) => ({ response: { status, data: { detail } } });
assert.match(describeUploadError(mk(409, "This tenant is on the full platform")).message, /full platform/);
assert.match(describeUploadError(mk(503, "load_profiles_master is empty")).advice, /reference data sync/);
assert.equal(describeUploadError(mk(403, "no")).title, "Not signed in or not allowed");
assert.match(describeUploadError(mk(422, [{ msg: "field required" }])).message, /field required/);
assert.equal(describeUploadError({ code: "ERR_NETWORK" }).title, "Could not reach the server");
const to = describeUploadError({ code: "ECONNABORTED" });
assert.match(to.title, /may still be running/);
assert.match(to.advice, /\/portfolio/);
assert.match(to.advice, /Do not upload the file again/);
assert.equal(describeUploadError(mk(409, "Another upload is still running. Wait for it to finish.")).title, "Another upload is still running");

// 6. csv formula guard
assert.ok(problemsToCsv([prob(2, "esi_id", "=1+1", "x", "m", "f")]).includes("'=1+1"));

console.log("uploadReport checks passed");
