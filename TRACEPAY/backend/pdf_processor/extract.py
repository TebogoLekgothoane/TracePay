import io
import logging
import os
import tempfile
from typing import Any

from .models import RawExtraction
from .tables import normalize_table

logger = logging.getLogger("tracepay.pdf.extract")


class ExtractionError(ValueError):
    pass


class PasswordRequiredError(ExtractionError):
    pass


class InvalidPasswordError(ExtractionError):
    pass


def extract_layers(content: bytes, password: str | None = None) -> tuple[RawExtraction, str, list[list[list[str]]]]:
    content = _decrypt_if_needed(content, password)
    try:
        import pdfplumber
    except ImportError as error:
        raise ExtractionError("pdfplumber is not installed.") from error
    try:
        pdf = pdfplumber.open(io.BytesIO(content))
    except Exception as error:
        raise ExtractionError("The PDF could not be opened.") from error

    text_parts: list[str] = []
    for page in pdf.pages:
        text_parts.append(page.extract_text() or "")
    text = "\n".join(text_parts)
    tables = _extract_camelot(content)
    useful_text = len(" ".join(text.split()))
    if tables:
        method = "table"
    elif useful_text >= 80:
        method = "text"
    else:
        ocr_text = _extract_ocr(pdf)
        if len(" ".join(ocr_text.split())) >= 80:
            text = ocr_text
            method = "ocr"
            useful_text = len(" ".join(text.split()))
        else:
            method = "unknown"
    pdf.close()
    return RawExtraction(pages=len(text_parts), extraction_method=method, raw_text_available=useful_text > 0, useful_text_characters=useful_text, tables_found=len(tables), rows_found=sum(len(table) for table in tables)), text, tables


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


def _extract_camelot(content: bytes) -> list[list[list[str]]]:
    try:
        import camelot
    except ImportError:
        return []
    tables: list[list[list[str]]] = []
    temporary_path = ""
    try:
        with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as temporary_file:
            temporary_file.write(content)
            temporary_path = temporary_file.name
        for flavor in ("lattice", "stream"):
            try:
                found: Any = camelot.read_pdf(temporary_path, pages="all", flavor=flavor)
                for table in found:
                    rows = normalize_table(table)
                    if rows:
                        tables.append(rows)
                if tables:
                    break
            except Exception as error:
                logger.warning("camelot_failed flavor=%s error_type=%s", flavor, type(error).__name__)
                continue
    finally:
        if temporary_path:
            os.unlink(temporary_path)
    return tables


def _extract_ocr(pdf: Any) -> str:
    try:
        import pytesseract
    except ImportError:
        return ""
    text: list[str] = []
    for page in pdf.pages:
        try:
            image = page.to_image(resolution=180).original
            text.append(pytesseract.image_to_string(image))
        except Exception as error:
            logger.warning("ocr_failed page=%s error_type=%s", page.page_number, type(error).__name__)
            continue
    return "\n".join(text)
