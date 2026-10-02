import logging
import threading
from dataclasses import dataclass
from typing import Any, Literal, Sequence

import cv2
import numpy as np
from PIL import Image, ImageOps

logger = logging.getLogger("tracepay.pdf.ocr")

OCR_CONFIDENCE_MIN = 0.6
_PADDLE_LOCK = threading.Lock()
_PADDLE_ENGINE: Any = None


@dataclass(frozen=True)
class OcrResult:
    text: str
    confidence: float
    engine: Literal["paddleocr", "tesseract", "none"]


def preprocess_statement_image(image: Image.Image | np.ndarray) -> np.ndarray:
    """Deskew-safe grayscale contrast pass for scanned statement pages."""
    array = _as_bgr(image)
    gray = cv2.cvtColor(array, cv2.COLOR_BGR2GRAY) if array.ndim == 3 else array
    height, width = gray.shape[:2]
    shortest = min(height, width)
    if shortest and shortest < 1000:
        scale = 1000 / shortest
        gray = cv2.resize(gray, None, fx=scale, fy=scale, interpolation=cv2.INTER_CUBIC)
    denoised = cv2.fastNlMeansDenoising(gray, h=10)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(denoised)
    return cv2.cvtColor(enhanced, cv2.COLOR_GRAY2BGR)


def ocr_page_images(images: Sequence[Image.Image | np.ndarray]) -> OcrResult:
    """Run PaddleOCR 3.x, then Tesseract only when Paddle fails or is low-confidence."""
    if not images:
        return OcrResult(text="", confidence=0.0, engine="none")

    prepared = [preprocess_statement_image(image) for image in images]
    paddle = _paddle_ocr(prepared)
    if _usable(paddle) and paddle.confidence >= OCR_CONFIDENCE_MIN:
        return paddle

    logger.info(
        "ocr_paddle_fallback_tesseract paddle_confidence=%s paddle_chars=%s",
        round(paddle.confidence, 3),
        len(" ".join(paddle.text.split())),
    )
    tesseract = _tesseract_ocr(prepared)
    if _usable(tesseract) and (
        not _usable(paddle) or tesseract.confidence >= paddle.confidence
    ):
        return tesseract
    if _usable(paddle):
        return paddle
    if _usable(tesseract):
        return tesseract
    return OcrResult(text="", confidence=0.0, engine="none")


def _usable(result: OcrResult) -> bool:
    return len(" ".join(result.text.split())) >= 80


def _as_bgr(image: Image.Image | np.ndarray) -> np.ndarray:
    if isinstance(image, np.ndarray):
        if image.ndim == 2:
            return cv2.cvtColor(image, cv2.COLOR_GRAY2BGR)
        if image.shape[2] == 4:
            return cv2.cvtColor(image, cv2.COLOR_BGRA2BGR)
        return image
    rgb = ImageOps.exif_transpose(image.convert("RGB"))
    return cv2.cvtColor(np.array(rgb), cv2.COLOR_RGB2BGR)


def _paddle_ocr(images: Sequence[np.ndarray]) -> OcrResult:
    pages: list[str] = []
    scores: list[float] = []
    try:
        engine = _get_paddle()
    except Exception as error:
        logger.warning("paddleocr_unavailable error_type=%s", type(error).__name__)
        return OcrResult(text="", confidence=0.0, engine="none")

    for index, image in enumerate(images):
        try:
            raw = _predict_paddle(engine, image)
            text, confidence = _parse_paddle_result(raw)
            pages.append(text)
            if text.strip():
                scores.append(confidence)
        except Exception as error:
            logger.warning(
                "paddleocr_failed page=%s error_type=%s",
                index + 1,
                type(error).__name__,
            )
            continue
    text = "\n".join(part for part in pages if part.strip())
    confidence = float(sum(scores) / len(scores)) if scores else 0.0
    return OcrResult(text=text, confidence=max(0.0, min(1.0, confidence)), engine="paddleocr")


def _get_paddle() -> Any:
    global _PADDLE_ENGINE
    if _PADDLE_ENGINE is not None:
        return _PADDLE_ENGINE
    with _PADDLE_LOCK:
        if _PADDLE_ENGINE is not None:
            return _PADDLE_ENGINE
        from paddleocr import PaddleOCR

        try:
            _PADDLE_ENGINE = PaddleOCR(
                lang="en",
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
        except TypeError:
            _PADDLE_ENGINE = PaddleOCR(
                use_doc_orientation_classify=False,
                use_doc_unwarping=False,
                use_textline_orientation=False,
            )
        return _PADDLE_ENGINE


def _predict_paddle(engine: Any, image: np.ndarray) -> Any:
    if hasattr(engine, "predict"):
        try:
            return engine.predict(input=image)
        except TypeError:
            return engine.predict(image)
    return engine.ocr(image)


def _parse_paddle_result(result: Any) -> tuple[str, float]:
    texts: list[str] = []
    scores: list[float] = []
    for page in _paddle_pages(result):
        page_texts, page_scores, page_boxes = _paddle_page_items(page)
        if page_boxes and len(page_boxes) == len(page_texts):
            texts.append(_lines_from_ocr_items(page_texts, page_boxes))
        else:
            texts.append("\n".join(item for item in page_texts if item.strip()))
        scores.extend(page_scores)
    joined = "\n".join(part for part in texts if part.strip())
    confidence = float(sum(scores) / len(scores)) if scores else 0.0
    return joined, max(0.0, min(1.0, confidence))


def _paddle_pages(result: Any) -> list[Any]:
    if result is None:
        return []
    if isinstance(result, dict):
        return [result]
    if isinstance(result, list):
        return [item for item in result if item is not None]
    return [result]


def _paddle_page_items(page: Any) -> tuple[list[str], list[float], list[Any]]:
    payload = _unwrap_paddle_page(page)
    if _is_legacy_ocr_lines(payload):
        return _legacy_ocr_items(payload)
    texts = _as_str_list(_lookup(payload, "rec_texts", "rec_text"))
    scores = _as_float_list(_lookup(payload, "rec_scores", "rec_score"))
    boxes = _as_list(_lookup(payload, "rec_boxes", "rec_polys", "dt_polys"))
    if len(scores) < len(texts):
        scores.extend([0.0] * (len(texts) - len(scores)))
    return texts, scores[: len(texts)], boxes


def _unwrap_paddle_page(page: Any) -> Any:
    if isinstance(page, dict) and "res" in page and len(page) == 1:
        return page["res"]
    nested = _lookup(page, "res")
    return nested if nested is not None else page


def _is_legacy_ocr_lines(payload: Any) -> bool:
    return (
        isinstance(payload, list)
        and payload
        and isinstance(payload[0], list)
        and payload[0]
        and isinstance(payload[0][0], (list, tuple))
    )


def _legacy_ocr_items(lines: list[Any]) -> tuple[list[str], list[float], list[Any]]:
    texts: list[str] = []
    scores: list[float] = []
    boxes: list[Any] = []
    for line in lines:
        if not line or len(line) < 2:
            continue
        box, item = line[0], line[1]
        if isinstance(item, (list, tuple)) and item:
            texts.append(str(item[0]))
            scores.append(float(item[1]) if len(item) > 1 else 0.0)
            boxes.append(box)
    return texts, scores, boxes


def _lookup(payload: Any, *names: str) -> Any:
    for name in names:
        if isinstance(payload, dict) and name in payload:
            return payload[name]
        if hasattr(payload, name):
            value = getattr(payload, name)
            if value is not None:
                return value
    return None


def _as_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, np.ndarray):
        return value.tolist()
    if isinstance(value, (list, tuple)):
        return list(value)
    return [value]


def _as_str_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value]
    return [str(item) for item in _as_list(value)]


def _as_float_list(value: Any) -> list[float]:
    if isinstance(value, (int, float, np.floating)):
        return [float(value)]
    values: list[float] = []
    for item in _as_list(value):
        try:
            values.append(float(item))
        except (TypeError, ValueError):
            continue
    return values


def _lines_from_ocr_items(texts: list[str], boxes: list[Any]) -> str:
    items: list[tuple[float, float, str]] = []
    heights: list[float] = []
    for text, box in zip(texts, boxes):
        cleaned = text.strip()
        if not cleaned:
            continue
        x, y, height = _box_origin(box)
        items.append((y, x, cleaned))
        if height > 0:
            heights.append(height)
    if not items:
        return ""
    items.sort(key=lambda item: (item[0], item[1]))
    tolerance = max(12.0, (sorted(heights)[len(heights) // 2] * 0.6) if heights else 16.0)
    lines: list[list[str]] = []
    current_y: float | None = None
    for y, _x, text in items:
        if current_y is None or abs(y - current_y) > tolerance:
            lines.append([text])
            current_y = y
        else:
            lines[-1].append(text)
    return "\n".join(" ".join(line) for line in lines)


def _box_origin(box: Any) -> tuple[float, float, float]:
    points = np.array(box, dtype=float).reshape(-1)
    if points.size >= 4 and points.size % 2 == 0:
        xs = points[0::2]
        ys = points[1::2]
        return float(xs.min()), float(ys.min()), float(ys.max() - ys.min())
    if points.size >= 4:
        return float(points[0]), float(points[1]), float(max(points[3] - points[1], 0))
    return 0.0, 0.0, 0.0


def _tesseract_ocr(images: Sequence[np.ndarray]) -> OcrResult:
    try:
        import pytesseract
    except ImportError:
        logger.warning("tesseract_unavailable")
        return OcrResult(text="", confidence=0.0, engine="none")

    pages: list[str] = []
    scores: list[float] = []
    for index, image in enumerate(images):
        try:
            pil = _to_pil(image)
            text = pytesseract.image_to_string(pil)
            pages.append(text)
            data = pytesseract.image_to_data(pil, output_type=pytesseract.Output.DICT)
            page_scores = []
            for raw in data.get("conf", []):
                try:
                    value = float(raw)
                except (TypeError, ValueError):
                    continue
                if value >= 0:
                    page_scores.append(value / 100.0)
            if text.strip() and page_scores:
                scores.append(sum(page_scores) / len(page_scores))
        except Exception as error:
            logger.warning(
                "tesseract_failed page=%s error_type=%s",
                index + 1,
                type(error).__name__,
            )
            continue
    text = "\n".join(part for part in pages if part.strip())
    confidence = float(sum(scores) / len(scores)) if scores else 0.0
    return OcrResult(text=text, confidence=max(0.0, min(1.0, confidence)), engine="tesseract")


def _to_pil(image: np.ndarray) -> Image.Image:
    if image.ndim == 2:
        return Image.fromarray(image)
    return Image.fromarray(cv2.cvtColor(image, cv2.COLOR_BGR2RGB))
