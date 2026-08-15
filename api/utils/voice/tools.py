"""Business-data tools for the voice assistant.

Each tool is a thin wrapper around an existing router function — the same
ones the Next.js "Orbi" text assistant already calls over HTTP (see
app/pages/api/chat.ts). Called in-process here since both live in the same
FastAPI app, so no new endpoints or duplicated query logic.

Any authenticated user of this portal (require_auth) can use all three
tools, matching the existing text assistant's behavior exactly (chat.ts has
no additional role check). Search is by company name / ESID / customer ID,
not by the caller's own identity.
"""
import logging
from typing import Any, Dict

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from routers.billing_engine import list_billing_periods
from routers.custom_pricing import search_renewal
from routers.invoice_engine import api_list_invoices_by_esi

logger = logging.getLogger("uvicorn")

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_account_summary",
            "description": (
                "Search ORBIC customer accounts by company name, ESID, or "
                "customer ID. Returns matching contract_renewal records: "
                "company name, broker, rate, and contract start/end dates."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "query": {
                        "type": "string",
                        "description": "Company name, ESID, or customer ID (e.g. C00123) to search for",
                    }
                },
                "required": ["query"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_usage_history",
            "description": (
                "Get energy usage (kWh) history for a customer's ESI ID, "
                "one row per billing period, most recent first."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "esi_id": {
                        "type": "string",
                        "description": "The customer's ESI ID (premise ID)",
                    }
                },
                "required": ["esi_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_billing_status",
            "description": (
                "Get all invoices for a customer's ESI ID, with amounts, "
                "due dates, and status (draft/sent/paid)."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "esi_id": {
                        "type": "string",
                        "description": "The customer's ESI ID (premise ID)",
                    }
                },
                "required": ["esi_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_customer_count",
            "description": (
                "Get the total number of distinct customer accounts (companies) "
                "in the system. Takes no parameters."
            ),
            "parameters": {"type": "object", "properties": {}, "required": []},
        },
    },
]


async def execute_tool(name: str, arguments: Dict[str, Any], db: AsyncSession) -> Any:
    """Run one tool call against real DB-backed logic.

    Never raises — on failure this returns an {"error": ...} payload so the
    LLM can tell the user it couldn't retrieve the data, instead of the
    whole voice turn erroring out.
    """
    try:
        if name == "get_account_summary":
            query = str(arguments.get("query", "")).strip()
            if not query:
                return {"error": "No search query provided."}
            rows = await search_renewal(q=query, db=db)
            return rows if rows else {"message": f"No accounts found matching '{query}'."}

        if name == "get_usage_history":
            esi_id = str(arguments.get("esi_id", "")).strip()
            if not esi_id:
                return {"error": "No ESI ID provided."}
            rows = await list_billing_periods(
                status=None, esi_id=esi_id, limit=24, offset=0, db=db
            )
            return rows if rows else {"message": f"No usage history found for ESI ID {esi_id}."}

        if name == "get_billing_status":
            esi_id = str(arguments.get("esi_id", "")).strip()
            if not esi_id:
                return {"error": "No ESI ID provided."}
            rows = await api_list_invoices_by_esi(esi_id=esi_id, db=db)
            return rows if rows else {"message": f"No invoices found for ESI ID {esi_id}."}

        if name == "get_customer_count":
            # contract_renewal is the real customer/ESID book (~10k+ rows) —
            # customers_new is a much smaller table scoped to the Custom
            # Pricing tool's own quote records, confirmed by controllers/
            # customers.py's CRUD being used only from custom_pricing.py /
            # contracts_confirm.py / email_pricing.py, not a master roster.
            # Filter matches broker_home.get_portfolio()'s existing
            # total_esiids query — excludes blank/placeholder premise_id rows.
            result = await db.execute(
                text(
                    "SELECT COUNT(*) FROM contract_renewal "
                    "WHERE premise_id != '' AND premise_id != 'Array'"
                )
            )
            return {"customer_count": int(result.scalar() or 0)}

        return {"error": f"Unknown tool: {name}"}
    except Exception:
        logger.exception("Voice tool '%s' failed", name)
        return {"error": "Couldn't retrieve that information right now."}
