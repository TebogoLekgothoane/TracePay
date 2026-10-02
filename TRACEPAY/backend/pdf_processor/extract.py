import io
import logging
from dataclasses import dataclass
from typing import Any

from .models import RawExtraction
from .normalise import has_usable_structured_text
from .ocr import ocr_page_images
from .tables import extract_camelot_tables

logger = logging.getLogger("tracepay.pdf.extract")

_USEFUL_TEXT_MIN = 80
_PAGE_TEXT_MIN = 40
_TEXT_METHOD_CONFIDENCE = 0.75
_OCR_RENDER_ZOOM = 2.5


class ExtractionError(ValueError):
    pass


class PasswordRequiredError(ExtractionError):
    pass


class InvalidPasswordError(ExtractionError):
    pass


@dataclass(frozen=True)
class _PyMuPdfLayer:
    text: str
    pages: int
    useful_text_characters: int
    scanned: bool
    page_images: list[Any]


def decrypt_pdf_content(content: bytes, password: str | None = None) -> bytes:
    """Return decrypted PDF bytes when the file is encrypted."""
    return _decrypt_if_needed(content, password)


def extract_layers(content: bytes, password: str | None = None) -> tuple[RawExtraction, str, list[list[list[str]]]]:
    content = _decrypt_if_needed(content, password)
    pymupdf = _extract_pymupdf(content)
    text = pymupdf.text
    useful_text = pymupdf.useful_text_characters
    tables: list[list[list[str]]] = []
    method = "unknown"
    confidence = 0.0

    if has_usable_structured_text(text):
        method = "text"
        confidence = _TEXT_METHOD_CONFIDENCE
        logger.info("pdf_pymupdf_structured_text pages=%s useful_chars=%s", pymupdf.pages, useful_text)
    elif not pymupdf.scanned:
        tables, table_confidence = extract_camelot_tables(content)
        if tables:
            method = "table"
            confidence = table_confidence if table_confidence > 0 else 1.0
            logger.info("pdf_camelot_tables tables=%s confidence=%s", len(tables), confidence)
        elif useful_text >= _USEFUL_TEXT_MIN:
            method = "text"
            confidence = _TEXT_METHOD_CONFIDENCE

    needs_ocr = pymupdf.scanned or (method == "unknown" and useful_text == 0)
    if needs_ocr:
        images = pymupdf.page_images or _render_pdf_pages(content)
        if images:
            ocr = ocr_page_images(images)
            ocr_useful = len(" ".join(ocr.text.split()))
            if ocr_useful >= _USEFUL_TEXT_MIN:
                text = ocr.text
                useful_text = ocr_useful
                method = "ocr"
                confidence = round(ocr.confidence, 3)
                logger.info(
                    "pdf_ocr_used engine=%s confidence=%s useful_chars=%s",
                    ocr.engine,
                    confidence,
                    useful_text,
                )

    if method == "unknown" and useful_text > 0:
        method = "text"
        confidence = 0.4 if useful_text < _USEFUL_TEXT_MIN else _TEXT_METHOD_CONFIDENCE

    return (
        RawExtraction(
            pages=pymupdf.pages,
            extraction_method=method,
            extraction_confidence=round(max(0.0, min(1.0, confidence)), 3),
            raw_text_available=useful_text > 0,
            useful_text_characters=useful_text,
            tables_found=len(tables),
            rows_found=sum(len(table) for table in tables),
        ),
        text,
        tables,
    )


def _extract_pymupdf(content: bytes) -> _PyMuPdfLayer:
    try:
        import fitz
    except ImportError as error:
        raise ExtractionError("PyMuPDF is not installed.") from error

    try:
        document = fitz.open(stream=content, filetype="pdf")
    except Exception as error:
        raise ExtractionError("The PDF could not be opened.") from error

    try:
        text_parts: list[str] = []
        scanned_pages = 0
        page_images: list[Any] = []
        for page in document:
            page_text = page.get_text("text") or ""
            text_parts.append(page_text)
            if _page_is_scanned(page, page_text):
                scanned_pages += 1
                rendered = _render_page(page)
                if rendered is not None:
                    page_images.append(rendered)
        text = "\n".join(text_parts)
        useful_text = len(" ".join(text.split()))
        page_count = document.page_count
        scanned = page_count > 0 and scanned_pages >= max(1, (page_count + 1) // 2)
        return _PyMuPdfLayer(
            text=text,
            pages=page_count,
            useful_text_characters=useful_text,
            scanned=scanned,
            page_images=page_images if scanned else [],
        )
    finally:
        document.close()


def _page_is_scanned(page: Any, page_text: str) -> bool:
    useful = len(" ".join(page_text.split()))
    if useful >= _PAGE_TEXT_MIN:
        return False
    try:
        images = page.get_images()
    except Exception:
        images = []
    return bool(images) and useful < _PAGE_TEXT_MIN


def _render_page(page: Any) -> Any:
    try:
        import cv2
        import fitz
        import numpy as np
    except ImportError:
        return None
    try:
        pixmap = page.get_pixmap(matrix=fitz.Matrix(_OCR_RENDER_ZOOM, _OCR_RENDER_ZOOM), alpha=False)
        array = np.frombuffer(pixmap.samples, dtype=np.uint8)
        if pixmap.n <= 1:
            return array.reshape(pixmap.height, pixmap.width)
        channels = array.reshape(pixmap.height, pixmap.width, pixmap.n)
        if pixmap.n == 4:
            return cv2.cvtColor(channels, cv2.COLOR_RGBA2BGR)
        return cv2.cvtColor(channels, cv2.COLOR_RGB2BGR)
    except Exception as error:
        logger.warning("pdf_page_render_failed error_type=%s", type(error).__name__)
        return None


def _render_pdf_pages(content: bytes) -> list[Any]:
    try:
        import fitz
    except ImportError:
        return []
    try:
        document = fitz.open(stream=content, filetype="pdf")
    except Exception:
        return []
    try:
        images = []
        for page in document:
            rendered = _render_page(page)
            if rendered is not None:
                images.append(rendered)
        return images
    finally:
        document.close()


def _decrypt_if_needed(content: bytes, password: str | None) -> bytes:
    try:
        from pypdf import PdfReader, PdfWriter
    except ImportError as error:
        raise ExtractionError("pypdf is not installed.") from error

    try:
        reader = PdfReader(io.BytesIO(content), strict=False)
    except Exception as error:
        raise ExtractionError("The PDF could not be opened.") from error
    if not reader.is_encrypted:
        return content
    if not password:
        raise PasswordRequiredError("This PDF is password protected. Please enter the password to continue.")
    try:
        decrypted = reader.decrypt(password)
    except Exception as error:
        raise InvalidPasswordError("The PDF password is incorrect. Please try again.") from error
    if not decrypted:
        raise InvalidPasswordError("The PDF password is incorrect. Please try again.")

    output = io.BytesIO()
    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)
    writer.write(output)
    return output.getvalue()
