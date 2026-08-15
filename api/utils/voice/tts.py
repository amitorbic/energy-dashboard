import os

from openai import AsyncOpenAI

_client = AsyncOpenAI(api_key=os.getenv("OPENAI_API_KEY"))


async def synthesize(text: str) -> bytes:
    """Text-to-speech. Returns MP3 audio bytes.

    Swap target: replace this function's body with a Cartesia call, keeping
    the same (text: str) -> bytes signature.
    """
    response = await _client.audio.speech.create(
        model="gpt-4o-mini-tts",
        voice="alloy",
        input=text,
        response_format="mp3",
    )
    return response.content
