import io
from decimal import Decimal

import pytest
from reportlab.pdfgen.canvas import Canvas

from app.config import Settings, settings
from pdf_processor.ai_extract import AiExtractionError, ai_extraction_available, extract_transactions_with_ai
from pdf_processor.extract import extract_layers
from pdf_processor.main import PdfProcessingError, process_pdf
from pdf_processor.models import RawExtraction
from pdf_processor.ocr import OcrResult


def _load_settings(monkeypatch: pytest.MonkeyPatch, **env: str) -> Settings:
    for name in ("AI_PDF_EXTRACTION_ENABLED", "AI_CATEGORISATION_ENABLED"):
        monkeypatch.delenv(name, raising=False)
    for name, value in env.items():
        monkeypatch.setenv(name, value)
    return Settings(_env_file=None)


def _text_pdf(lines: list[str]) -> bytes:
    source = io.BytesIO()
    canvas = Canvas(source)
    y = 750
    for line in lines:
        canvas.drawString(50, y, line)
        y -= 18
    canvas.save()
    return source.getvalue()


def _forbid_providers(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden(*_args, **_kwargs):
        raise AssertionError("AI PDF provider must not be called")

    monkeypatch.setattr("pdf_processor.ai_extract._request_anthropic_pdf", forbidden)
    monkeypatch.setattr("pdf_processor.ai_extract._request_openai_pdf", forbidden)
    monkeypatch.setattr("pdf_processor.ai_extract._request_gemini_pdf", forbidden)


def _arm_provider_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "anthropic_api_key", "test-anthropic")
    monkeypatch.setattr(settings, "openai_api_key", "test-openai")
    monkeypatch.setattr(settings, "gemini_api_key", "test-gemini")


def _unknown_layers(*_args, **_kwargs):
    return (
        RawExtraction(
            pages=1,
            extraction_method="unknown",
            extraction_confidence=0,
            raw_text_available=False,
            useful_text_characters=0,
            tables_found=0,
            rows_found=0,
        ),
        "",
        [],
    )


def test_missing_ai_pdf_extraction_flag_is_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    loaded = _load_settings(monkeypatch)
    assert loaded.ai_pdf_extraction_enabled is False


def test_explicit_false_disables_ai_pdf_extraction(monkeypatch: pytest.MonkeyPatch) -> None:
    for value in ("false", "FALSE", "0", "no", "off", "", "maybe"):
        loaded = _load_settings(monkeypatch, AI_PDF_EXTRACTION_ENABLED=value)
        assert loaded.ai_pdf_extraction_enabled is False


def test_explicit_true_enables_ai_pdf_extraction(monkeypatch: pytest.MonkeyPatch) -> None:
    for value in ("true", "TRUE", "1", "yes", "on"):
        loaded = _load_settings(monkeypatch, AI_PDF_EXTRACTION_ENABLED=value)
        assert loaded.ai_pdf_extraction_enabled is True


def test_disabled_flag_never_calls_a_provider(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_pdf_extraction_enabled", False)
    _arm_provider_keys(monkeypatch)
    _forbid_providers(monkeypatch)
    assert ai_extraction_available() is False
    with pytest.raises(AiExtractionError, match="not configured"):
        extract_transactions_with_ai(b"%PDF-1.4")


def test_enabled_flag_keeps_the_existing_fallback_path(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "ai_pdf_extraction_enabled", True)
    monkeypatch.setattr(settings, "anthropic_api_key", "test-anthropic")
    monkeypatch.setattr(settings, "openai_api_key", "")
    monkeypatch.setattr(settings, "gemini_api_key", "")
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    calls: list[int] = []

    def anthropic(_instructions: str, pdf_bytes: bytes) -> dict:
        calls.append(len(pdf_bytes))
        return {
            "transactions": [
                {
                    "date": "2026-09-18",
                    "description": "AI PAYMENT",
                    "amount": "-10.00",
                    "direction": "debit",
                }
            ]
        }

    def unused(*_args, **_kwargs):
        raise AssertionError("fallback provider must not run after a successful extraction")

    monkeypatch.setattr("pdf_processor.ai_extract._request_anthropic_pdf", anthropic)
    monkeypatch.setattr("pdf_processor.ai_extract._request_openai_pdf", unused)
    monkeypatch.setattr("pdf_processor.ai_extract._request_gemini_pdf", unused)
    monkeypatch.setattr("pdf_processor.main.extract_layers", _unknown_layers)

    content = _text_pdf(["unreadable"])
    result = process_pdf(content, "statement.pdf", "user-id-12345678")
    assert calls
    assert result.raw_extraction.extraction_method == "ai"
    assert [item.description for item in result.transactions] == ["AI PAYMENT"]
    assert [item.amount for item in result.transactions] == [Decimal("-10.00")]


def test_categorisation_flag_is_independent(monkeypatch: pytest.MonkeyPatch) -> None:
    pdf_off = _load_settings(
        monkeypatch,
        AI_PDF_EXTRACTION_ENABLED="false",
        AI_CATEGORISATION_ENABLED="true",
    )
    assert pdf_off.ai_pdf_extraction_enabled is False
    assert pdf_off.ai_categorisation_enabled is True

    pdf_on = _load_settings(
        monkeypatch,
        AI_PDF_EXTRACTION_ENABLED="true",
        AI_CATEGORISATION_ENABLED="false",
    )
    assert pdf_on.ai_pdf_extraction_enabled is True
    assert pdf_on.ai_categorisation_enabled is False


def test_classical_extraction_still_runs_when_ai_pdf_extraction_is_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ai_pdf_extraction_enabled", False)
    _arm_provider_keys(monkeypatch)
    _forbid_providers(monkeypatch)
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)
    monkeypatch.setattr(
        "pdf_processor.extract.extract_camelot_tables",
        lambda _content: (_ for _ in ()).throw(AssertionError("Camelot should not run")),
    )
    monkeypatch.setattr(
        "pdf_processor.extract.ocr_page_images",
        lambda _images: (_ for _ in ()).throw(AssertionError("OCR should not run")),
    )
    content = _text_pdf(
        [
            "18/09/2026 TEXT PAYMENT -450.00",
            "19/09/2026 TEXT DEPOSIT +900.00",
        ]
    )
    result = process_pdf(content, "statement.pdf", "user-id-12345678")
    assert result.raw_extraction.extraction_method == "text"
    assert [item.amount for item in result.transactions] == [Decimal("-450.00"), Decimal("900.00")]


def test_ocr_fallback_still_runs_when_ai_pdf_extraction_is_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from PIL import Image, ImageDraw
    from reportlab.lib.utils import ImageReader

    monkeypatch.setattr(settings, "ai_pdf_extraction_enabled", False)
    _arm_provider_keys(monkeypatch)
    _forbid_providers(monkeypatch)
    image = Image.new("RGB", (400, 560), "white")
    ImageDraw.Draw(image).text((40, 80), "SCANNED STATEMENT", fill="black")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    pdf = io.BytesIO()
    canvas = Canvas(pdf)
    canvas.drawImage(ImageReader(buffer), 0, 0, width=400, height=560)
    canvas.save()
    monkeypatch.setattr(
        "pdf_processor.extract.ocr_page_images",
        lambda images: OcrResult(
            text="18/09/2026 SCANNED PAYMENT -450.00 extra useful characters for the threshold padding",
            confidence=0.88,
            engine="paddleocr",
        ),
    )
    raw, text, tables = extract_layers(pdf.getvalue())
    assert raw.extraction_method == "ocr"
    assert raw.extraction_confidence == 0.88
    assert "SCANNED PAYMENT" in text
    assert tables == []


def test_failed_extraction_does_not_invent_transactions_when_ai_pdf_is_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "ai_pdf_extraction_enabled", False)
    _arm_provider_keys(monkeypatch)
    _forbid_providers(monkeypatch)
    monkeypatch.setattr("pdf_processor.main.extract_layers", _unknown_layers)
    with pytest.raises(PdfProcessingError, match="insufficient readable content"):
        process_pdf(_text_pdf(["blank"]), "statement.pdf", "user-id-12345678")
