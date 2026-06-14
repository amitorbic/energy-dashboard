import type { NextApiRequest, NextApiResponse } from "next";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const FASTAPI = process.env.INTERNAL_API_URL ?? "http://127.0.0.1:8001";

const SYSTEM_PROMPT = `You are Orbi, a helpful AI assistant built into the ORBIC internal portal.
ORBIC is a Texas energy retailer operating in ERCOT. You help staff look up customer accounts, check pricing, review broker info, track commissions, check payment balances, view expiring contracts, analyze the open/short position, review past-due accounts, and track the renewal pipeline.
Be concise, professional, and friendly. Format data as readable tables or bullet points when it helps clarity.
Never invent data — always call a tool to fetch real information. If a tool returns no results, say so clearly.
Today's date is ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}.`;

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;
type FnCall = { id: string; type: "function"; function: { name: string; arguments: string } };

const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_customers",
      description:
        "Search for ORBIC customers by company name or ESID. Returns matching records with key fields.",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Search term: company name or ESID" },
        },
        required: ["q"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_customer_details",
      description:
        "Get the full contract_renewal record for a specific customer by their cust_id string (e.g. C00123). Use after search_customers to get complete details.",
      parameters: {
        type: "object",
        properties: {
          cust_id: { type: "string", description: "Customer ID string from contract_renewal, e.g. C00123" },
        },
        required: ["cust_id"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "check_esid",
      description: "Look up a customer by their ESID (stored as premise_id in contract_renewal). Returns contract details including company name, broker, rate, and end date.",
      parameters: {
        type: "object",
        properties: {
          esid: { type: "string", description: "The ESID / premise_id to look up" },
        },
        required: ["esid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_payment_balance",
      description: "Get the payment balance and account summary for a customer by their ESIID.",
      parameters: {
        type: "object",
        properties: {
          esiid: { type: "string", description: "The ESIID for the customer account" },
        },
        required: ["esiid"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_brokers",
      description:
        "Search active brokers by company name or broker code (e.g. V0364). Returns sid, broker_code, and company_name.",
      parameters: {
        type: "object",
        properties: {
          q: { type: "string", description: "Search term: broker company name or broker code" },
        },
        required: ["q"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_daily_pricing",
      description:
        "Get the daily pricing matrix for a given start month and contract terms. Prices are in $/MWh unless otherwise noted.",
      parameters: {
        type: "object",
        properties: {
          start_month: {
            type: "string",
            description: "Start month in YYYY-MM format, e.g. 2025-07",
          },
          terms: {
            type: "string",
            description: "Comma-separated contract lengths in months, e.g. '12,24,36'",
          },
          price_type: {
            type: "string",
            enum: ["commercial", "residential"],
            description: "Price type — defaults to commercial",
          },
        },
        required: ["start_month", "terms"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_commission_summary",
      description:
        "Get commission summary data for brokers. Filter by vendor code (e.g. V1) and/or month (YYYY-MM). Returns balances, owed amounts, and payment history.",
      parameters: {
        type: "object",
        properties: {
          vendor: {
            type: "string",
            description: "Short vendor/commission ID, e.g. V1, V2, V369. Omit to get all vendors.",
          },
          month: {
            type: "string",
            description: "Month in YYYY-MM format. Omit to get the latest available month.",
          },
        },
      },
    },
  },
  // ── Wave 2 ──────────────────────────────────────────────────────────────────
  {
    type: "function",
    function: {
      name: "get_ercot_forecast",
      description:
        "Get the ERCOT shape load forecast for the ORBIC portfolio. Returns load projections by zone and horizon.",
      parameters: {
        type: "object",
        properties: {
          zone: {
            type: "string",
            enum: ["HOUSTON", "NORTH", "SOUTH", "WEST"],
            description: "ERCOT zone to filter by. Omit for all zones.",
          },
          method: {
            type: "string",
            enum: ["base", "weather", "bias", "analog", "composite"],
            description: "Forecast method. Defaults to composite.",
          },
          horizon: {
            type: "string",
            enum: ["monthly", "weekly", "daily"],
            description: "Forecast granularity. Defaults to monthly.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_expiring_contracts",
      description:
        "Get customer contracts expiring within a given number of days. Filters the contract_renewal table by contract_end_date.",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "Look-ahead window in days from today. E.g. 30 returns contracts expiring in the next 30 days.",
          },
          include_expired: {
            type: "boolean",
            description: "If true, also include already-expired contracts. Defaults to false.",
          },
        },
        required: ["days"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_open_position",
      description:
        "Get the portfolio open/short position — total forecasted load through the last contract end date. Used for hedging and risk analysis.",
      parameters: {
        type: "object",
        properties: {
          zone: {
            type: "string",
            enum: ["HOUSTON", "NORTH", "SOUTH", "WEST"],
            description: "ERCOT zone to filter by. Omit for all zones.",
          },
          granularity: {
            type: "string",
            enum: ["monthly", "weekly", "daily"],
            description: "Position granularity. Defaults to monthly.",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_past_due_accounts",
      description:
        "Get collections accounts that are past due by at least X days. Returns accounts with days overdue, total amount due, and delinquency tier.",
      parameters: {
        type: "object",
        properties: {
          days_min: {
            type: "number",
            description: "Minimum days past due. E.g. 30 for accounts 30+ days overdue.",
          },
          days_max: {
            type: "number",
            description: "Maximum days past due. Omit for no upper limit.",
          },
          page_size: {
            type: "number",
            description: "Max number of accounts to return. Defaults to 25.",
          },
        },
        required: ["days_min"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_renewal_pipeline",
      description:
        "Get the contract renewal pipeline bucketed by expiry window: expired, 0–30, 31–60, 61–90, and 90+ days. Useful for renewal prioritization. Optionally filter by broker code.",
      parameters: {
        type: "object",
        properties: {
          broker_code: {
            type: "string",
            description: "Filter by broker code, e.g. V0366. Omit for all brokers.",
          },
        },
      },
    },
  },
];

async function executeTool(
  name: string,
  args: Record<string, unknown>,
  token: string
): Promise<unknown> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  async function get(path: string) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    try {
      const r = await fetch(`${FASTAPI}${path}`, { headers, signal: controller.signal });
      if (!r.ok) return { error: `API error ${r.status}: ${r.statusText}` };
      return r.json();
    } catch (err) {
      if ((err as Error).name === "AbortError") return { error: "FastAPI request timed out after 8s" };
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  switch (name) {
    case "search_customers": {
      const q = encodeURIComponent(String(args.q));
      const result = await get(`/api/customers/renewal/search?q=${q}`);
      if (!Array.isArray(result)) return result;
      return result.length ? result : { message: "No customers found matching that query." };
    }

    case "get_customer_details": {
      const q = encodeURIComponent(String(args.cust_id));
      const result = await get(`/api/customers/renewal/search?q=${q}`);
      if (!Array.isArray(result)) return result;
      const match = result.find(
        (r: Record<string, unknown>) => String(r.cust_id) === String(args.cust_id)
      );
      return match ?? { message: `No customer found with ID ${args.cust_id}` };
    }

    case "check_esid": {
      const esid = encodeURIComponent(String(args.esid));
      const result = await get(`/api/customers/renewal/search?q=${esid}`);
      if (!Array.isArray(result)) return result;
      const match = result.find(
        (r: Record<string, unknown>) => String(r.premise_id) === String(args.esid)
      );
      return match ?? { message: `No customer found with ESID ${args.esid}` };
    }

    case "get_payment_balance":
      return get(`/api/payments/balance/${encodeURIComponent(String(args.esiid))}`);

    case "search_brokers": {
      const q = String(args.q).toLowerCase();
      const all = (await get("/api/brokers/dropdown")) as Record<string, unknown>[];
      if (!Array.isArray(all)) return all;
      const hits = all
        .filter(
          (b) =>
            String(b.company_name ?? "").toLowerCase().includes(q) ||
            String(b.broker_code ?? "").toLowerCase().includes(q)
        )
        .slice(0, 15);
      return hits.length ? hits : { message: "No brokers found matching that query." };
    }

    case "get_daily_pricing": {
      const params = new URLSearchParams({
        start_month: String(args.start_month),
        terms: String(args.terms),
        price_type: String(args.price_type ?? "commercial"),
      });
      return get(`/api/pricing/daily-matrix?${params}`);
    }

    case "get_commission_summary": {
      const params = new URLSearchParams();
      if (args.vendor) params.set("vendor", String(args.vendor));
      if (args.month) params.set("month", String(args.month));
      const qs = params.toString();
      return get(`/api/commission/summary${qs ? `?${qs}` : ""}`);
    }

    // ── Wave 2 ────────────────────────────────────────────────────────────────

    case "get_ercot_forecast": {
      const params = new URLSearchParams();
      if (args.zone) params.set("zone", String(args.zone));
      params.set("method", String(args.method ?? "composite"));
      params.set("horizon", String(args.horizon ?? "monthly"));
      return get(`/api/portfolio/forecast?${params}`);
    }

    case "get_expiring_contracts": {
      const raw = await get("/api/contract-renewal/list") as { rows?: Record<string, unknown>[] };
      const rows = raw?.rows;
      if (!Array.isArray(rows)) return raw;

      const today = new Date(); today.setHours(0, 0, 0, 0);
      const cutoff = new Date(today);
      cutoff.setDate(cutoff.getDate() + Number(args.days));
      const includeExpired = Boolean(args.include_expired);

      const hits = rows
        .filter((r) => {
          if (!r.contract_end_date) return false;
          const end = new Date(String(r.contract_end_date));
          return includeExpired ? end <= cutoff : end >= today && end <= cutoff;
        })
        .sort((a, b) =>
          new Date(String(a.contract_end_date)).getTime() -
          new Date(String(b.contract_end_date)).getTime()
        );

      return hits.length
        ? { count: hits.length, contracts: hits }
        : { message: `No contracts expiring in the next ${args.days} days.` };
    }

    case "get_open_position": {
      const params = new URLSearchParams();
      if (args.zone) params.set("zone", String(args.zone));
      params.set("granularity", String(args.granularity ?? "monthly"));
      return get(`/api/portfolio/open-position?${params}`);
    }

    case "get_past_due_accounts": {
      const params = new URLSearchParams({
        days_min: String(args.days_min),
        page_size: String(args.page_size ?? 25),
      });
      if (args.days_max) params.set("days_max", String(args.days_max));
      return get(`/api/collections/accounts?${params}`);
    }

    case "get_renewal_pipeline": {
      const raw = await get("/api/contract-renewal/list") as { rows?: Record<string, unknown>[] };
      const rows = raw?.rows;
      if (!Array.isArray(rows)) return raw;

      const filtered = args.broker_code
        ? rows.filter((r) =>
            String(r.broker_code ?? "").toLowerCase() === String(args.broker_code).toLowerCase()
          )
        : rows;

      const today = new Date(); today.setHours(0, 0, 0, 0);

      type Bucket = Record<string, unknown>[];
      const buckets: Record<string, Bucket> = {
        expired: [], "0_30": [], "31_60": [], "61_90": [], "90_plus": [],
      };

      for (const r of filtered) {
        if (!r.contract_end_date) continue;
        const diff = Math.ceil(
          (new Date(String(r.contract_end_date)).getTime() - today.getTime()) / 86_400_000
        );
        if (diff < 0) buckets.expired.push(r);
        else if (diff <= 30) buckets["0_30"].push(r);
        else if (diff <= 60) buckets["31_60"].push(r);
        else if (diff <= 90) buckets["61_90"].push(r);
        else buckets["90_plus"].push(r);
      }

      return {
        total_contracts: filtered.length,
        pipeline: {
          expired:    { count: buckets.expired.length,   contracts: buckets.expired.slice(0, 10) },
          "0_30_days":  { count: buckets["0_30"].length,   contracts: buckets["0_30"].slice(0, 10) },
          "31_60_days": { count: buckets["31_60"].length,  contracts: buckets["31_60"].slice(0, 10) },
          "61_90_days": { count: buckets["61_90"].length,  contracts: buckets["61_90"].slice(0, 10) },
          "90_plus_days": { count: buckets["90_plus"].length },
        },
      };
    }

    default:
      return { error: `Unknown tool: ${name}` };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { messages, token } = req.body as { messages: Message[]; token: string };

  if (!token || typeof token !== "string" || token.trim() === "") {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "messages array required" });
  }

  const conversation: Message[] = [{ role: "system", content: SYSTEM_PROMPT }, ...messages];

  try {
    for (let i = 0; i < 5; i++) {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: conversation,
        tools,
        tool_choice: "auto",
      });

      const choice = completion.choices[0];
      conversation.push(choice.message);

      if (choice.finish_reason !== "tool_calls" || !choice.message.tool_calls?.length) {
        return res.status(200).json({ reply: choice.message.content });
      }

      const toolResults = await Promise.all(
        choice.message.tool_calls
          .filter((tc): tc is FnCall => tc.type === "function")
          .map(async (tc) => {
          const result = await executeTool(
            tc.function.name,
            JSON.parse(tc.function.arguments) as Record<string, unknown>,
            token ?? ""
          );
          return {
            role: "tool" as const,
            tool_call_id: tc.id,
            content: JSON.stringify(result),
          };
        })
      );

      conversation.push(...toolResults);
    }

    return res.status(500).json({ error: "Agent exceeded maximum iterations." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "OpenAI error";
    return res.status(500).json({ error: message });
  }
}
