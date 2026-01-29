from __future__ import annotations

import os
from io import BytesIO
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from gtts import gTTS
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..models_db import AnalysisResult, User

router = APIRouter(prefix="/voice", tags=["voice"])


@router.post("/generate")
def generate_voice(
    text: str,
    lang: str = "xh",  # IsiXhosa
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Generate IsiXhosa audio from text"""
    if not text or len(text.strip()) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Text is required")

    try:
        # Generate speech using gTTS
        tts = gTTS(text=text, lang=lang, slow=False)
        audio_buffer = BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)

        return StreamingResponse(
            audio_buffer,
            media_type="audio/mpeg",
            headers={"Content-Disposition": "attachment; filename=voice.mp3"},
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate voice: {str(e)}")


@router.get("/analysis/{analysis_id}")
def get_voice_analysis(
    analysis_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Get voice summary of an analysis"""
    analysis = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.id == analysis_id, AnalysisResult.user_id == current_user.id)
        .first()
    )
    if not analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")

    # Create plain language summary in IsiXhosa
    # For now, we'll use English and translate key phrases
    # In production, you'd have proper IsiXhosa translations
    summary_text = analysis.summary_plain_language

    # Simple translation mapping (in production, use proper translation service)
    translations = {
        "Warning": "Isilumkiso",
        "money is leaking": "imali iyaphuma",
        "Biggest issue": "Ingxaki enkulu",
    }

    # For MVP, use English with gTTS IsiXhosa voice
    # In production, translate full text to IsiXhosa
    try:
        tts = gTTS(text=summary_text, lang="xh", slow=False)
        audio_buffer = BytesIO()
        tts.write_to_fp(audio_buffer)
        audio_buffer.seek(0)

        return StreamingResponse(
            audio_buffer,
            media_type="audio/mpeg",
            headers={"Content-Disposition": f"attachment; filename=analysis_{analysis_id}.mp3"},
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to generate voice: {str(e)}")

