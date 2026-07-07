from __future__ import annotations

from io import BytesIO
from typing import Dict, List, Literal, Optional

import httpx
from fastapi import APIRouter, Depends, HTTPException, Path, Query, status
from fastapi.responses import StreamingResponse
from gtts import gTTS
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..database import get_db
from ..external_http import request_json_with_retries
from ..models_db import AnalysisResult, User
from ..settings import settings

router = APIRouter(prefix="/voice", tags=["voice"])

GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"
GROQ_API_KEY = settings.groq_api_key


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant", "system"]
    content: str = Field(min_length=1, max_length=4000)


class VoiceChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    messages: List[ChatMessage] = Field(min_length=1, max_length=50)
    language: Optional[str] = Field(default="en", min_length=2, max_length=10)
    summary_context: Optional[str] = Field(default=None, max_length=8000)


class VoiceChatResponse(BaseModel):
    message: str


@router.post("/chat", response_model=VoiceChatResponse)
async def voice_chat(req: VoiceChatRequest) -> VoiceChatResponse:
    """
    Interactive voice chat using Groq. Send conversation history; returns assistant reply.
    Configure GROQ_API_KEY as a deployment secret. For local development, use an uncommitted backend .env file.
    """
    if not GROQ_API_KEY or not GROQ_API_KEY.strip():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="GROQ_API_KEY is not set. Configure it as a deployment secret.",
        )
    if not req.messages:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="At least one message is required",
        )

    system_content = (
        "You are the TracePay voice assistant. You help users understand their spending, "
        "money leaks, and financial health. Use ONLY the context below to answer. "
        "Do not invent or guess numbers, leak names, amounts, or savings. "
        "If the user asks about something not in the context, say you don't have that information. "
        "Answer in the same language the user uses. Keep replies brief for voice."
    )
    if req.summary_context:
        system_content += f"\n\n--- Context (use only these facts) ---\n{req.summary_context}\n--- End context ---"

    messages_for_groq: List[Dict[str, str]] = [
        {"role": "system", "content": system_content},
        *[{"role": m.role, "content": m.content} for m in req.messages],
    ]

    payload = {
        "model": "llama-3.1-8b-instant",
        "messages": messages_for_groq,
        "max_tokens": 512,
        "temperature": 0.7,
    }

    try:
        data = await request_json_with_retries(
            "POST",
            GROQ_API_URL,
            timeout=15.0,
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json=payload,
        )
    except httpx.HTTPStatusError as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Groq API error: {e.response.text}",
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Failed to call Groq: {str(e)}",
        )

    choices = data.get("choices") or []
    if not choices:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="No reply from Groq",
        )
    content = (choices[0].get("message") or {}).get("content") or ""
    return VoiceChatResponse(message=content.strip())


@router.post("/generate")
def generate_voice(
    text: str = Query(min_length=1, max_length=2000),
    lang: str = Query(default="xh", min_length=2, max_length=10),  # IsiXhosa
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    """Generate IsiXhosa audio from text"""
    if not text or len(text.strip()) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Text is required"
        )

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
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate voice: {str(e)}",
        )


@router.get("/analysis/{analysis_id}")
def get_voice_analysis(
    analysis_id: int = Path(gt=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> StreamingResponse:
    """Get voice summary of an analysis"""
    analysis = (
        db.query(AnalysisResult)
        .filter(
            AnalysisResult.id == analysis_id, AnalysisResult.user_id == current_user.id
        )
        .first()
    )
    if not analysis:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found"
        )

    # Create plain language summary in IsiXhosa
    # For now, we'll use English and translate key phrases
    # In production, you'd have proper IsiXhosa translations
    summary_text = analysis.summary_plain_language

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
            headers={
                "Content-Disposition": f"attachment; filename=analysis_{analysis_id}.mp3"
            },
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate voice: {str(e)}",
        )
