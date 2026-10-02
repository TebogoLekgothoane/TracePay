import io
from types import SimpleNamespace

import numpy as np
import pytest
from PIL import Image, ImageDraw
from reportlab.lib.utils import ImageReader
from reportlab.pdfgen.canvas import Canvas

from pdf_processor.extract import extract_layers
from pdf_processor.ocr import (
    OcrResult,
    _lines_from_ocr_items,
    _parse_paddle_result,
    ocr_page_images,
    preprocess_statement_image,
)


def _scanned_pdf() -> bytes:
    image = Image.new("RGB", (400, 560), "white")
    draw = ImageDraw.Draw(image)
    draw.text((40, 80), "SCANNED STATEMENT", fill="black")
    buffer = io.BytesIO()
    image.save(buffer, format="PNG")
    buffer.seek(0)
    pdf = io.BytesIO()
    canvas = Canvas(pdf)
    canvas.drawImage(ImageReader(buffer), 0, 0, width=400, height=560)
    canvas.save()
    return pdf.getvalue()


def test_preprocess_statement_image_returns_enhanced_bgr() -> None:
    noisy = np.full((120, 180), 180, dtype=np.uint8)
    noisy[30:90, 40:140] = 40
    processed = preprocess_statement_image(noisy)
    assert processed.ndim == 3
    assert processed.shape[2] == 3
    assert processed.dtype == np.uint8
    assert processed.shape[0] >= 1000 or processed.shape[1] >= 1000


def test_paddle_result_groups_words_into_lines() -> None:
    result = {
        "res": {
            "rec_texts": ["18/09/2026", "SCANNED PAYMENT", "-450.00", "19/09/2026", "SCANNED DEPOSIT", "+900.00"],
            "rec_scores": [0.99, 0.98, 0.97, 0.96, 0.95, 0.94],
            "rec_boxes": [
                [10, 10, 80, 24],
                [90, 10, 220, 24],
                [230, 10, 300, 24],
                [10, 40, 80, 54],
                [90, 40, 230, 54],
                [240, 40, 310, 54],
            ],
        }
    }
    text, confidence = _parse_paddle_result(result)
    lines = text.splitlines()
    assert lines[0] == "18/09/2026 SCANNED PAYMENT -450.00"
    assert lines[1] == "19/09/2026 SCANNED DEPOSIT +900.00"
    assert confidence == pytest.approx(0.965, abs=0.01)


def test_legacy_paddle_ocr_format_is_parsed() -> None:
    legacy = [[
        [[[10, 10], [80, 10], [80, 24], [10, 24]], ("WOOLWORTHS", 0.93)],
        [[[90, 10], [140, 10], [140, 24], [90, 24]], ("-12.00", 0.91)],
    ]]
    text, confidence = _parse_paddle_result(legacy)
    assert "WOOLWORTHS" in text
    assert confidence == pytest.approx(0.92, abs=0.01)


def test_ocr_line_grouping_uses_box_height_tolerance() -> None:
    text = _lines_from_ocr_items(
        ["A", "B", "C"],
        [[0, 0, 10, 20], [12, 2, 22, 22], [0, 40, 10, 60]],
    )
    assert text.splitlines() == ["A B", "C"]


def test_low_confidence_paddleocr_falls_back_to_tesseract(monkeypatch: pytest.MonkeyPatch) -> None:
    image = np.zeros((64, 64, 3), dtype=np.uint8)
    monkeypatch.setattr(
        "pdf_processor.ocr._paddle_ocr",
        lambda _images: OcrResult(
            text="weak paddle text " * 20,
            confidence=0.41,
            engine="paddleocr",
        ),
    )
    monkeypatch.setattr(
        "pdf_processor.ocr._tesseract_ocr",
        lambda _images: OcrResult(
            text="18/09/2026 TESSERACT PAYMENT -450.00 extra fallback words " * 8,
            confidence=0.72,
            engine="tesseract",
        ),
    )
    result = ocr_page_images([image])
    assert result.engine == "tesseract"
    assert result.confidence == 0.72
    assert "TESSERACT PAYMENT" in result.text


def test_paddleocr_failure_falls_back_to_tesseract(monkeypatch: pytest.MonkeyPatch) -> None:
    image = np.zeros((64, 64, 3), dtype=np.uint8)
    monkeypatch.setattr(
        "pdf_processor.ocr._paddle_ocr",
        lambda _images: OcrResult(text="", confidence=0.0, engine="none"),
    )
    monkeypatch.setattr(
        "pdf_processor.ocr._tesseract_ocr",
        lambda _images: OcrResult(
            text="18/09/2026 TESSERACT PAYMENT -450.00 extra fallback words " * 8,
            confidence=0.66,
            engine="tesseract",
        ),
    )
    result = ocr_page_images([image])
    assert result.engine == "tesseract"
    assert result.confidence == 0.66


def test_high_confidence_paddleocr_skips_tesseract(monkeypatch: pytest.MonkeyPatch) -> None:
    image = np.zeros((64, 64, 3), dtype=np.uint8)
    monkeypatch.setattr(
        "pdf_processor.ocr._tesseract_ocr",
        lambda _images: (_ for _ in ()).throw(AssertionError("Tesseract should not run")),
    )
    monkeypatch.setattr(
        "pdf_processor.ocr._paddle_ocr",
        lambda _images: OcrResult(
            text="18/09/2026 PADDLE PAYMENT -450.00 extra high confidence words " * 8,
            confidence=0.91,
            engine="paddleocr",
        ),
    )
    result = ocr_page_images([image])
    assert result.engine == "paddleocr"
    assert result.confidence == 0.91


def test_scanned_pdf_uses_ocr_and_records_confidence(monkeypatch: pytest.MonkeyPatch) -> None:
    content = _scanned_pdf()
    monkeypatch.setattr(
        "pdf_processor.extract.ocr_page_images",
        lambda images: OcrResult(
            text="18/09/2026 SCANNED PAYMENT -450.00 extra useful characters for the threshold padding",
            confidence=0.88,
            engine="paddleocr",
        ),
    )
    raw, text, tables = extract_layers(content)
    assert raw.extraction_method == "ocr"
    assert raw.extraction_confidence == 0.88
    assert raw.raw_text_available is True
    assert "SCANNED PAYMENT" in text
    assert tables == []


def test_camelot_accuracy_is_normalised_to_unit_interval(monkeypatch: pytest.MonkeyPatch) -> None:
    import sys

    from pdf_processor.tables import extract_camelot_tables

    table = SimpleNamespace(
        df=[["Date", "Description", "Debit"], ["18/09/2026", "WOOLWORTHS", "450.00"]],
        accuracy=91.0,
    )
    monkeypatch.setitem(sys.modules, "camelot", SimpleNamespace(read_pdf=lambda *_args, **_kwargs: [table]))
    rows, confidence = extract_camelot_tables(b"%PDF-1.4 test")
    assert rows
    assert confidence == 0.91
