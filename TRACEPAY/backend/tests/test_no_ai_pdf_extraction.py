"""Statement PDFs are read deterministically (text, tables, OCR) and never sent to an AI provider."""

import importlib
import io
import socket
from decimal import Decimal

import pytest
from reportlab.pdfgen.canvas import Canvas

from app.config import Settings, settings
from pdf_processor.main import PdfProcessingError, process_pdf
from pdf_processor.models import RawExtraction


def _text_pdf(lines: list[str]) -> bytes:
    source = io.BytesIO()
    canvas = Canvas(source)
    y = 750
    for line in lines:
        canvas.drawString(50, y, line)
        y -= 18
    canvas.save()
    return source.getvalue()


def _forbid_network(monkeypatch: pytest.MonkeyPatch) -> None:
    def forbidden(*_args, **_kwargs):
        raise AssertionError("PDF processing must not touch the network")

    monkeypatch.setattr("urllib.request.urlopen", forbidden)
    monkeypatch.setattr(socket.socket, "connect", forbidden)


def _arm_provider_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for name in ("anthropic_api_key", "openai_api_key", "xai_api_key", "openrouter_api_key"):
        monkeypatch.setattr(settings, name, "test-key")
    monkeypatch.setattr("categorisation.service.settings.ai_categorisation_enabled", False)


def _unknown_layers(*_args, **_kwargs):
    raw = RawExtraction(
        pages=1,
        extraction_method="unknown",
        extraction_confidence=0,
        raw_text_available=False,
        useful_text_characters=0,
        tables_found=0,
        rows_found=0,
    )
    return raw, "", []


def test_ai_extraction_module_and_settings_no_longer_exist(monkeypatch: pytest.MonkeyPatch) -> None:
    with pytest.raises(ModuleNotFoundError):
        importlib.import_module("pdf_processor.ai_extract")
    monkeypatch.setenv("AI_PDF_EXTRACTION_ENABLED", "true")
    loaded = Settings(_env_file=None)
    assert not hasattr(loaded, "ai_pdf_extraction_enabled")


def test_text_statement_is_read_without_any_provider_call(monkeypatch: pytest.MonkeyPatch) -> None:
    _arm_provider_keys(monkeypatch)
    _forbid_network(monkeypatch)
    content = _text_pdf(["18/09/2026 TEXT PAYMENT -450.00", "19/09/2026 TEXT DEPOSIT +900.00"])
    result = process_pdf(content, "statement.pdf", "user-id-12345678")
    assert result.raw_extraction.extraction_method == "text"
    assert [item.amount for item in result.transactions] == [Decimal("-450.00"), Decimal("900.00")]


def test_unreadable_statement_fails_instead_of_being_sent_to_ai(monkeypatch: pytest.MonkeyPatch) -> None:
    _arm_provider_keys(monkeypatch)
    _forbid_network(monkeypatch)
    monkeypatch.setattr("pdf_processor.main.extract_layers", _unknown_layers)
    with pytest.raises(PdfProcessingError, match="insufficient readable content"):
        process_pdf(_text_pdf(["blank"]), "statement.pdf", "user-id-12345678")
