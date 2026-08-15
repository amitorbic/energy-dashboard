import io
import os

from openai import AsyncOpenAI

_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


async def transcribe(audio_bytes: bytes, filename: str) -> str:
    """Speech-to-text. Returns "" (not an exception) when no speech is detected.

    Swap target: replace this function's body with a Deepgram call, keeping
    the same (audio_bytes, filename) -> str signature.
    """
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = filename or "audio.webm"

    result = await _client.audio.transcriptions.create(
        model="gpt-4o-transcribe",
        file=audio_file,
        language="en",
    )
    return (result.text or "").strip()
