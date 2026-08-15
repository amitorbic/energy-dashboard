import json

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

import controllers.voice as ctrl
from middleware.auth import require_auth
from schemas.voice import VoiceTurnResponse
from utils.database import get_db

router = APIRouter(prefix="/voice", tags=["Voice"])


@router.post("/turn", response_model=VoiceTurnResponse)
async def voice_turn(
    audio: UploadFile = File(...),
    history: str = Form("[]"),
    user=Depends(require_auth),
    db: AsyncSession = Depends(get_db),
):
    """One turn of the voice loop: recorded audio in, transcript + LLM reply +
    TTS audio out. `history` is a JSON-encoded list of {"role","content"}
    dicts held client-side (no server-side persistence). `db` is passed
    through for the LLM's account/usage/billing tool calls."""
    audio_bytes = await audio.read()

    try:
        history_list = json.loads(history)
        if not isinstance(history_list, list):
            history_list = []
    except json.JSONDecodeError:
        history_list = []

    try:
        return await ctrl.handle_turn(
            audio_bytes, audio.filename or "audio.webm", history_list, db, user
        )
    except ctrl.VoiceProviderError as e:
        raise HTTPException(status_code=502, detail=str(e))
