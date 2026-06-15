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
- usage_kwh: Electricity consumption in kWh (numeric only, e.g. "1234.5")
- energy_rate: Energy supply rate $/kWh from the REP/retailer charges section (numeric only, e.g. "0.0432"). Leave empty if not explicitly shown — it will be calculated.
- tdsp_rate: Delivery rate $/kWh from the TDSP section (Oncor / AEP / CenterPoint / TNMP charges) (numeric only). Leave empty if not shown.
- energy_charges: Total REP energy supply charges in dollars (numeric only, e.g. "54.32")
- tdsp_charges: Total TDSP delivery charges in dollars (numeric only, e.g. "38.75")
- extra_charges: JSON array of any charges that are NOT energy supply, TDSP delivery, or taxes (e.g. ["$2.50 Franchise Fee", "$1.00 Customer Charge"]). Use [] if none.
- provider_name: Retail Electric Provider (REP) name shown on the bill header (e.g. "TXU Energy", "Reliant Energy")
- service_address: Full service address (street, city, state, zip)

Do NOT include total_average_rate — it is calculated automatically.`;

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

const DETECT_PROMPT = `Look at this document. Is it:
A) A utility/energy bill (shows charges, usage, ESI ID, account number, due date)
B) A contract or agreement (shows terms, conditions, rates, signatures)

Reply with only: BILL or CONTRACT`;

const CONFIDENCE_GUIDE = `
Confidence scoring:
90–100: Field is explicitly labeled and clearly readable
70–89: Field is present and you are reasonably certain
50–69: Field is inferred or partially visible
1–49: Guessed, context only, or barely legible
0: Field not found in this document`;

function buildExtractionPrompt(docType: "utility_bill" | "contract", templateHint: string): string {
  const docLabel =
    docType === "utility_bill" ? "utility electric bill" : "competitor energy contract";
  const section = docType === "utility_bill" ? BILL_SECTION : CONTRACT_SECTION;
  return (
    `You are a document data extraction assistant for ORBIC, a Texas energy retailer operating in ERCOT.\n\n` +
    `Extract structured data from this ${docLabel}.\n` +
    `${section}\n` +
    `${templateHint}` +
    `${CONFIDENCE_GUIDE}\n\n` +
    `Respond with ONLY valid JSON — no markdown fences, no explanation text:\n` +
    `{\n  "fields": {\n    "field_name": { "value": "extracted value or empty string", "confidence": 0 }\n  }\n}\n\n` +
    `If a field is not found: { "value": "", "confidence": 0 }`
  );
}

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

// ── Scanned PDF renderer ─────────────────────────────────────────────────────
// Uses pdf-parse v2's built-in getScreenshot(), which internally uses
// pdfjs-dist 5.x + @napi-rs/canvas — both already installed as its deps.

interface PageImage {
  base64: string;
  mimeType: "image/png";
}

async function renderScannedPdf(buffer: Buffer): Promise<PageImage[]> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PDFParse } = require("pdf-parse") as {
    PDFParse: new (opts: { data: Uint8Array }) => {
      getScreenshot(params: {
        scale: number;
        imageDataUrl: boolean;
        imageBuffer: boolean;
        first: number;
      }): Promise<{ pages: Array<{ dataUrl: string }>; total: number }>;
    };
  };

  const parser = new PDFParse({ data: new Uint8Array(buffer) });
  const result = await parser.getScreenshot({
    scale: 2,           // 2× for legible text when passed to vision
    imageDataUrl: true,
    imageBuffer: false,
    first: 3,           // cap at 3 pages — enough for any utility bill
  });

  return result.pages.map((p) => ({
    base64: p.dataUrl.includes(",") ? p.dataUrl.split(",")[1] : p.dataUrl,
    mimeType: "image/png",
  }));
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

  // ── Prepare document content once ──────────────────────────────────────────
  let docText = "";
  let imageBase64 = "";
  let scannedPages: PageImage[] | null = null; // set when PDF has no/sparse text

  if (isImage) {
    imageBase64 = buffer.toString("base64");
  } else {
    if (ext === "pdf") {
      // pdf-parse v2 is class-based: new PDFParse({ data }) → .getText()
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PDFParse } = require("pdf-parse") as {
        PDFParse: new (opts: { data: Uint8Array }) => { getText(): Promise<{ text: string }> };
      };
      const parser = new PDFParse({ data: new Uint8Array(buffer) });
      docText = (await parser.getText()).text;

      // < 200 chars means the PDF has no real text layer (scanned / image-based).
      // Render each page as a PNG and send to vision instead of the text path.
      if (docText.trim().length < 200) {
        scannedPages = await renderScannedPdf(buffer);
        if (scannedPages.length === 0) {
          throw new Error("Could not extract text or render this PDF. Try uploading as JPG or PNG.");
        }
      }
    } else if (ext === "docx") {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mammoth = require("mammoth") as {
        extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
      };
      docText = (await mammoth.extractRawText({ buffer })).value;

      if (!docText.trim()) {
        throw new Error("No text could be extracted from this DOCX file.");
      }
    } else {
      docText = buffer.toString("utf-8");
      if (!docText.trim()) {
        throw new Error("No text could be extracted from this file.");
      }
    }
  }

  // Builds the content block for a given prompt, reusing the prepared document data.
  // Scanned pages are sent as multiple image_url entries (one per rendered page).
  type MsgContent = OpenAI.Chat.ChatCompletionUserMessageParam["content"];
  const buildContent = (prompt: string, textLimit = 12000): MsgContent => {
    if (isImage) {
      return [
        { type: "text", text: prompt },
        { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageBase64}`, detail: "high" } },
      ];
    }
    if (scannedPages) {
      return [
        { type: "text", text: prompt },
        ...scannedPages.map((p) => ({
          type: "image_url" as const,
          image_url: { url: `data:${p.mimeType};base64,${p.base64}`, detail: "high" as const },
        })),
      ];
    }
    return `${prompt}\n\nDOCUMENT CONTENT:\n\`\`\`\n${docText.slice(0, textLimit)}\n\`\`\``;
  };

  // ── Step 1: Detect document type ────────────────────────────────────────────
  // Cheap call — max_tokens:10, no JSON mode, expects only "BILL" or "CONTRACT".
  const detectCompletion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: buildContent(DETECT_PROMPT, 4000) }],
    temperature: 0,
    max_tokens: 10,
  });
  const detectAnswer =
    detectCompletion.choices[0]?.message?.content?.trim().toUpperCase() ?? "";

  let docType: DocType;
  if (detectAnswer.startsWith("BILL")) docType = "utility_bill";
  else if (detectAnswer.startsWith("CONTRACT")) docType = "contract";
  else return { doc_type: "unknown", fields: {} };

  // ── Step 2: Template matching (text PDFs and DOCX only) ─────────────────────
  // Scanned pages and raw images have no extractable text for provider name lookup.
  let matchedTemplate: BillTemplate | null = null;
  if (docType === "utility_bill" && !isImage && !scannedPages) {
    matchedTemplate = findTemplate(docText, templates);
  }
  const templateHint = matchedTemplate ? buildTemplateHint(matchedTemplate) : "";

  // ── Step 3: Extract fields for the detected type ────────────────────────────
  const extractPrompt = buildExtractionPrompt(docType, templateHint);
  const extractCompletion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: buildContent(extractPrompt) }],
    temperature: 0,
    max_tokens: 1024,
    response_format: { type: "json_object" },
  });

  const raw = extractCompletion.choices[0]?.message?.content ?? "{}";
  const extracted = JSON.parse(raw) as { fields?: Record<string, ExtractedField> };

  const result: ParseResult = {
    doc_type: docType,
    fields: extracted.fields ?? {},
  };

  if (matchedTemplate) {
    result.template_id = matchedTemplate.id;
    result.template_matched = true;
  }

  return result;
}

// ── Claude provider (stub — swap in when ready) ───────────────────────────────
// Follow the same two-step pattern as parseWithOpenAI:
//   1. Send DETECT_PROMPT → expect "BILL" or "CONTRACT"
//   2. Send buildExtractionPrompt(docType, templateHint) → parse { fields }
// Install @anthropic-ai/sdk and set ANTHROPIC_API_KEY to activate.

async function parseWithClaude(
  _buffer: Buffer,
  _filename: string,
  _mimeType: string,
  _templates: BillTemplate[]
): Promise<ParseResult> {
  throw new Error(
    "Claude provider not yet configured. Set ANTHROPIC_API_KEY and install @anthropic-ai/sdk."
  );
}

// ── Gemini provider (stub — swap in when ready) ───────────────────────────────
// Follow the same two-step pattern as parseWithOpenAI:
//   1. Send DETECT_PROMPT → expect "BILL" or "CONTRACT"
//   2. Send buildExtractionPrompt(docType, templateHint) → parse { fields }
// Install @google/generative-ai and set GEMINI_API_KEY to activate.

async function parseWithGemini(
  _buffer: Buffer,
  _filename: string,
  _mimeType: string,
  _templates: BillTemplate[]
): Promise<ParseResult> {
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

  // ── Rate calculations ───────────────────────────────────────────────────────

  const kwh = parseFloat(fields["usage_kwh"]?.value ?? "");

  // total_average_rate — always computed from total bill ÷ kWh, never from AI
  const billAmt = parseFloat((fields["bill_amount"]?.value ?? "").replace(/[$,\s]/g, ""));
  if (!isNaN(billAmt) && !isNaN(kwh) && kwh > 0) {
    derived["total_average_rate"] = {
      value: (billAmt / kwh).toFixed(5),
      confidence: 95,
    };
  }

  // energy_rate — use AI value when confident; otherwise compute from energy_charges ÷ kWh
  const aiEnergyConf = fields["energy_rate"]?.confidence ?? 0;
  if ((!fields["energy_rate"]?.value || aiEnergyConf < 40) && !isNaN(kwh) && kwh > 0) {
    const ec = parseFloat((fields["energy_charges"]?.value ?? "").replace(/[$,\s]/g, ""));
    if (!isNaN(ec) && ec > 0) {
      derived["energy_rate"] = { value: (ec / kwh).toFixed(5), confidence: 70 };
    }
  }

  // tdsp_rate — same pattern
  const aiTdspConf = fields["tdsp_rate"]?.confidence ?? 0;
  if ((!fields["tdsp_rate"]?.value || aiTdspConf < 40) && !isNaN(kwh) && kwh > 0) {
    const tc = parseFloat((fields["tdsp_charges"]?.value ?? "").replace(/[$,\s]/g, ""));
    if (!isNaN(tc) && tc > 0) {
      derived["tdsp_rate"] = { value: (tc / kwh).toFixed(5), confidence: 70 };
    }
  }

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
