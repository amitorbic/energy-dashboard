from typing import Optional

from pydantic import BaseModel


class VoiceTurnResponse(BaseModel):
    transcript: Optional[str] = None
    reply: Optional[str] = None
    audio_base64: Optional[str] = None
    audio_mime: Optional[str] = None
    note: Optional[str] = None  # e.g. "empty_transcript"
