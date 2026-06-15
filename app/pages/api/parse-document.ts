import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

export const config = { api: { bodyParser: { sizeLimit: "10mb" } } };

// ── Types ─────────────────────────────────────────────────────────────────────

export type DocType = "utility_bill" | "contract" | "unknown";

export interface ExtractedField {
  value: string;
  confidence: number;
}

export interface ParseResult {
  doc_type: DocType;
  fields: Record<string, ExtractedField>;
  template_id?: number;
  template_matched?: boolean;
}

interface BillTemplate {
  id: number;
  provider_name: string;
  sample_fields: Record<string, string> | null;
  confidence_score: number;
  times_used: number;
}

// ── Extraction prompts ────────────────────────────────────────────────────────

const BILL_SECTION = `
For UTILITY BILLS extract:
- esid: ESI ID / Premise ID / Service Point Identifier (17–18 digit number starting with 1)
- account_number: Customer account number
- bill_amount: Total amount due (include $ sign, e.g. "$124.56")
- due_date: Payment due date (YYYY-MM-DD)
- usage_kwh: Electricity consumption in kWh (numeric string, e.g. "1234.5")
- service_address: Full service address (street, city, state, zip)
- provider_name: Utility / TDU company name (e.g. "Oncor Electric Delivery")`;

const CONTRACT_SECTION = `
For COMPETITOR ENERGY CONTRACTS (competitive intelligence) extract:
- competitor_name: The energy retailer / supplier name on this contract
- rate: Energy supply rate in $/kWh (numeric only, e.g. "0.0465")
- contract_term_months: Contract length in months (numeric only, e.g. "12")
- pricing_type: "fixed" for fixed-price, "index" for indexed/variable pricing
- early_termination_fee: ETF description (e.g. "3 months remaining charges" or "None")
- auto_renewal: Does this contract auto-renew? ("yes" or "no")
- capacity_charges: Any capacity or demand charges (e.g. "$2.50/kW/month" or "None")
- swing_limits: Usage swing/tolerance limits (e.g. "+/-10% of forecasted volume" or "None")
- hidden_charges: JSON array of non-obvious or buried fees (e.g. ["$0.001/kWh line loss adder"])
- what_is_missing: JSON array of features ORBIC typically offers that this competitor contract does NOT include

ORBIC advantages to check when populating what_is_missing:
  No capacity charges, No swing limits, Month-to-month contract options,
  Online self-service portal, Dedicated ERCOT account management,
  ETF-free options, Transparent all-in pricing, No auto-renewal traps`;

const BASE_PROMPT = `You are a document data extraction assistant for ORBIC, a Texas energy retailer operating in ERCOT.

Analyze the provided document and extract structured data.

Identify the document type:
- "utility_bill": A utility / electric bill from a TDU (Oncor, AEP Texas, TNMP, CenterPoint, etc.)
- "contract": An energy supply contract or service agreement from a competitor retailer
- "unknown": Cannot determine from available content
${BILL_SECTION}
${CONTRACT_SECTION}

Confidence scoring:
90–100: Field is explicitly labeled and clearly readable
70–89: Field is present and you are reasonably certain
50–69: Field is inferred or partially visible
1–49: Guessed, context only, or barely legible
0: Field not found in this document

Respond with ONLY valid JSON — no markdown fences, no explanation text:
{
  "doc_type": "utility_bill",
  "fields": {
    "field_name": { "value": "extracted value or empty string", "confidence": 0 }
  }
}

If a field is not found: { "value": "", "confidence": 0 }`;

// ── Template matching ─────────────────────────────────────────────────────────

function findTemplate(docText: string, templates: BillTemplate[]): BillTemplate | null {
  const lower = docText.toLowerCase();
  for (const t of templates) {
    if (lower.includes(t.provider_name.toLowerCase())) {
      return t;
    }
  }
  return null;
}

function buildTemplateHint(t: BillTemplate): string {
  if (!t.sample_fields) return "";
  return (
    `\n\nTEMPLATE MATCH — ${t.provider_name}` +
    ` (used ${t.times_used}x, confidence ${t.confidence_score.toFixed(0)}%)` +
    `\nKnown field values from past successful extractions:\n` +
    JSON.stringify(t.sample_fields, null, 2) +
    "\n"
  );
}

// ── Fetch templates from FastAPI ──────────────────────────────────────────────

async function fetchTemplates(token: string): Promise<BillTemplate[]> {
  const base = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:8001";
  try {
    const res = await fetch(`${base}/api/document-parser/templates`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    return (await res.json()) as BillTemplate[];
  } catch {
    // Templates are optional; extraction still works without them
    return [];
  }
}

// ── OpenAI provider ───────────────────────────────────────────────────────────

async function parseWithOpenAI(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  templates: BillTemplate[]
): Promise<ParseResult> {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext);

  let content: OpenAI.Chat.ChatCompletionUserMessageParam["content"];
  let matchedTemplate: BillTemplate | null = null;

  if (isImage) {
    const base64 = buffer.toString("base64");
    content = [
      { type: "text", text: BASE_PROMPT },
      {
        type: "image_url",
        image_url: { url: `data:${mimeType};base64,${base64}`, detail: "high" },
      },
    ];
  } else {
    let docText = "";

    if (ext === "pdf") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
      const parsed = await pdfParse(buffer);
      docText = parsed.text;
    } else if (ext === "docx") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      const { value } = await mammoth.extractRawText({ buffer });
      docText = value;
    } else {
      docText = buffer.toString("utf-8");
    }

    if (!docText.trim()) {
      throw new Error(
        "No text could be extracted. " +
          "If this is a scanned PDF, upload a JPG or PNG image instead."
      );
    }

    matchedTemplate = findTemplate(docText, templates);
    const hint = matchedTemplate ? buildTemplateHint(matchedTemplate) : "";
    content =
      `${BASE_PROMPT}${hint}\n\nDOCUMENT CONTENT:\n\`\`\`\n${docText.slice(0, 12000)}\n\`\`\``;
  }

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content }],
    temperature: 0,
    max_tokens: 1024,
    response_format: { type: "json_object" },
  });

  const raw = completion.choices[0]?.message?.content ?? "{}";
  const result = JSON.parse(raw) as ParseResult;

  if (matchedTemplate) {
    result.template_id = matchedTemplate.id;
    result.template_matched = true;
  }

  return result;
}

// ── Claude provider (stub — swap in when ready) ───────────────────────────────

async function parseWithClaude(
  _buffer: Buffer,
  _filename: string,
  _mimeType: string,
  _templates: BillTemplate[]
): Promise<ParseResult> {
  // Install @anthropic-ai/sdk and set ANTHROPIC_API_KEY to activate.
  throw new Error(
    "Claude provider not yet configured. Set ANTHROPIC_API_KEY and install @anthropic-ai/sdk."
  );
}

// ── Gemini provider (stub — swap in when ready) ───────────────────────────────

async function parseWithGemini(
  _buffer: Buffer,
  _filename: string,
  _mimeType: string,
  _templates: BillTemplate[]
): Promise<ParseResult> {
  // Install @google/generative-ai and set GEMINI_API_KEY to activate.
  throw new Error(
    "Gemini provider not yet configured. Set GEMINI_API_KEY and install @google/generative-ai."
  );
}

// ── Provider abstraction ──────────────────────────────────────────────────────

async function parseDocument(
  buffer: Buffer,
  filename: string,
  mimeType: string,
  templates: BillTemplate[],
  provider: string = process.env.VISION_PROVIDER ?? "openai"
): Promise<ParseResult> {
  if (provider === "openai") return parseWithOpenAI(buffer, filename, mimeType, templates);
  if (provider === "claude") return parseWithClaude(buffer, filename, mimeType, templates);
  if (provider === "gemini") return parseWithGemini(buffer, filename, mimeType, templates);
  throw new Error(
    `Unknown VISION_PROVIDER: "${provider}". Valid values: openai, claude, gemini.`
  );
}

// ── ESI ID → TDSP / pricing zone derivation ──────────────────────────────────

interface TdspEntry {
  tdsp: string;
  zone: string;
}

// Prefix order: longer/specific first to prevent shorter prefixes from shadowing them
const ESI_PREFIX_MAP: [string, TdspEntry][] = [
  ["100890", { tdsp: "CenterPoint Energy", zone: "Houston" }],
  ["100327", { tdsp: "AEP Texas Central",  zone: "South"   }],
  ["10400",  { tdsp: "TNMP",               zone: ""        }], // zone resolved by zip
  ["1044",   { tdsp: "Oncor Electric Delivery", zone: "North" }],
  ["1020",   { tdsp: "AEP Texas West",     zone: "West"    }],
];

// Rough ZIP→TDSP fallback for when ESI ID is absent or unrecognized.
// Ranges sourced from ERCOT service area maps — not exhaustive.
function tdspFromZip(zip: string): TdspEntry | null {
  const z = parseInt(zip.slice(0, 5), 10);
  if (isNaN(z)) return null;
  if (z >= 77001 && z <= 77599) return { tdsp: "CenterPoint Energy",        zone: "Houston" };
  if (z >= 75001 && z <= 75999) return { tdsp: "Oncor Electric Delivery",   zone: "North"   };
  if (z >= 76001 && z <= 76699) return { tdsp: "Oncor Electric Delivery",   zone: "North"   };
  if (z >= 78001 && z <= 78599) return { tdsp: "AEP Texas Central",         zone: "South"   };
  if (z >= 78600 && z <= 78999) return { tdsp: "AEP Texas Central",         zone: "South"   };
  if (z >= 79001 && z <= 79999) return { tdsp: "AEP Texas West",            zone: "West"    };
  if (z >= 76700 && z <= 76899) return { tdsp: "TNMP",                      zone: "North"   };
  if (z >= 77600 && z <= 77899) return { tdsp: "TNMP",                      zone: "Houston" };
  return null;
}

// TNMP zone via zip — TNMP operates in three distinct geographic areas
function tnmpZoneFromZip(zip: string): string {
  const z = parseInt(zip.slice(0, 5), 10);
  if (isNaN(z)) return "North"; // safest default
  if (z >= 77600 && z <= 77899) return "Houston";
  if (z >= 76700 && z <= 76899) return "North";
  if (z >= 79100 && z <= 79399) return "West";
  return "North";
}

function deriveFields(fields: Record<string, ExtractedField>): Record<string, ExtractedField> {
  const derived: Record<string, ExtractedField> = {};

  // 1. service_zip — last 5-digit block in the service address
  const address = fields["service_address"]?.value ?? "";
  const zipMatches = address.match(/\b\d{5}(?:-\d{4})?\b/g);
  const serviceZip = zipMatches ? zipMatches[zipMatches.length - 1].slice(0, 5) : "";
  derived["service_zip"] = {
    value: serviceZip,
    confidence: serviceZip ? 90 : 0,
  };

  // 2. TDSP / zone from ESI ID prefix
  const esiId = (fields["esid"]?.value ?? "").replace(/\s/g, "");
  let tdspEntry: TdspEntry | null = null;

  if (esiId) {
    for (const [prefix, entry] of ESI_PREFIX_MAP) {
      if (esiId.startsWith(prefix)) {
        tdspEntry = entry;
        break;
      }
    }
    // If TNMP and zone is blank, resolve via zip
    if (tdspEntry && tdspEntry.tdsp === "TNMP" && !tdspEntry.zone) {
      tdspEntry = { tdsp: "TNMP", zone: tnmpZoneFromZip(serviceZip) };
    }
  }

  // 3. Fallback to zip-based lookup when ESI not available or unrecognized
  if (!tdspEntry && serviceZip) {
    tdspEntry = tdspFromZip(serviceZip);
  }

  derived["tdsp_name"] = {
    value: tdspEntry?.tdsp ?? "",
    confidence: tdspEntry ? (esiId ? 95 : 60) : 0,
  };
  derived["pricing_zone"] = {
    value: tdspEntry?.zone ?? "",
    confidence: tdspEntry?.zone ? (esiId ? 95 : 60) : 0,
  };

  return derived;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { token, data, filename, mimeType } = req.body as {
    token?: string;
    data?: string;
    filename?: string;
    mimeType?: string;
  };

  if (!token) return res.status(401).json({ error: "Unauthorized" });
  if (!data || !filename) return res.status(400).json({ error: "Missing file data or filename" });

  try {
    const buffer = Buffer.from(data, "base64");
    const provider = process.env.VISION_PROVIDER ?? "openai";
    const templates = await fetchTemplates(token);
    const result = await parseDocument(
      buffer,
      filename,
      mimeType ?? "application/octet-stream",
      templates,
      provider
    );

    // Post-process: inject deterministic TDSP/zone fields for utility bills
    if (result.doc_type === "utility_bill") {
      const derived = deriveFields(result.fields);
      result.fields = { ...result.fields, ...derived };
    }

    return res.status(200).json(result);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Document parsing failed";
    console.error("[parse-document]", message);
    return res.status(500).json({ error: message });
  }
}
