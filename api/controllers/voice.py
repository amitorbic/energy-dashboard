import base64
import logging
from typing import Dict, List

from sqlalchemy.ext.asyncio import AsyncSession

from schemas.voice import VoiceTurnResponse
from utils.voice import llm, stt, tts

logger = logging.getLogger("uvicorn")


class VoiceProviderError(Exception):
    """Raised when an STT/LLM/TTS provider call fails."""


async def handle_turn(
    audio_bytes: bytes,
    filename: str,
    history: List[Dict[str, str]],
    db: AsyncSession,
    user: Dict,
) -> VoiceTurnResponse:
    try:
        transcript = await stt.transcribe(audio_bytes, filename)
    except Exception as e:
        logger.error("Voice STT failed: %s", e)
        raise VoiceProviderError("Speech-to-text failed") from e

    if not transcript:
        return VoiceTurnResponse(transcript="", note="empty_transcript")

    try:
        reply = await llm.generate_reply(
            history + [{"role": "user", "content": transcript}],
            db=db,
            requesting_user_id=user.get("user_id"),
        )
    except Exception as e:
        logger.error("Voice LLM failed: %s", e)
        raise VoiceProviderError("LLM reply failed") from e

    if not reply:
        return VoiceTurnResponse(transcript=transcript, note="empty_reply")

    try:
        audio = await tts.synthesize(reply)
    except Exception as e:
        logger.error("Voice TTS failed: %s", e)
        raise VoiceProviderError("Text-to-speech failed") from e

    return VoiceTurnResponse(
        transcript=transcript,
        reply=reply,
        audio_base64=base64.b64encode(audio).decode("ascii"),
        audio_mime="audio/mpeg",
    )
