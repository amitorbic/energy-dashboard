import json
import logging
import os
from typing import Dict, List, Optional

from openai import AsyncOpenAI
from sqlalchemy.ext.asyncio import AsyncSession

from utils.voice import tools as voice_tools

_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))
logger = logging.getLogger("uvicorn")

SYSTEM_PROMPT = (
    "You are Orbi, a voice assistant for ORBIC, a Texas energy retailer. "
    "Always reply in English, even if the transcribed input looks like another "
    "language — the speech-to-text step occasionally mis-detects short or noisy "
    "audio, but users are speaking English. "
    "You only answer using real data provided to you through tools — never "
    "estimate, guess, or make up a number or fact. If you don't have a tool "
    "for what's being asked, say plainly that you don't have access to that "
    "data yet, instead of answering from general knowledge. Currently you can "
    "look up customer accounts, usage history, billing/invoice status, and "
    "the total customer count using your tools. "
    "Keep answers short and conversational — this reply will be read aloud by "
    "text-to-speech, so avoid tables, bullet points, or long lists."
)

MAX_TOOL_ITERATIONS = 5


async def generate_reply(
    history: List[Dict[str, str]],
    db: AsyncSession,
    requesting_user_id: Optional[int] = None,
) -> str:
    """Conversational LLM turn with tool-calling against real ORBIC account/
    usage/billing data. `history` is a list of {"role", "content"} dicts
    (user/assistant turns only — no system message, that's added here).

    `db` is the request-scoped DB session used to execute tool calls.
    `requesting_user_id` is included only for audit logging of who triggered
    a lookup — tool results are never filtered by it (any authenticated
    portal user can look up any account, same as the existing text Orbi).

    Swap target: a different provider needs its own tool-calling integration,
    but should keep this (history, db, requesting_user_id) -> str signature.
    """
    messages: List[dict] = [{"role": "system", "content": SYSTEM_PROMPT}, *history]

    for _ in range(MAX_TOOL_ITERATIONS):
        completion = await _client.chat.completions.create(
            model="gpt-4o-mini",
            messages=messages,
            tools=voice_tools.TOOL_DEFINITIONS,
            tool_choice="auto",
        )
        choice = completion.choices[0]
        messages.append(choice.message.model_dump(exclude_none=True))

        if choice.finish_reason != "tool_calls" or not choice.message.tool_calls:
            return (choice.message.content or "").strip()

        for call in choice.message.tool_calls:
            try:
                args = json.loads(call.function.arguments or "{}")
            except json.JSONDecodeError:
                args = {}

            logger.info(
                "Voice tool call: user_id=%s tool=%s args=%s",
                requesting_user_id,
                call.function.name,
                args,
            )
            result = await voice_tools.execute_tool(call.function.name, args, db)
            messages.append(
                {
                    "role": "tool",
                    "tool_call_id": call.id,
                    "content": json.dumps(result, default=str),
                }
            )

    logger.error("Voice LLM exceeded max tool iterations")
    return "Sorry, I'm having trouble pulling that up right now."
