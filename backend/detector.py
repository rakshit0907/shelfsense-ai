"""
detector.py — YOLOv8 detection with class filtering and Gemini Vision fallback
"""

import base64
import io
import os
import random
from typing import List, Dict, Any, Optional
import numpy as np

from config import settings, RETAIL_CLASSES, EXCLUDED_CLASSES

# ── YOLO Loading ──────────────────────────────────────────────────────────────
_model = None
_model_loaded = False
_model_error: Optional[str] = None

DEMO_PRODUCTS = [
    "bottle", "bottle", "bottle", "cup", "chips", "juice", "water",
    "snack", "cereal", "yogurt", "candy", "cola", "energy drink",
]


def _load_model():
    global _model, _model_loaded, _model_error
    if _model_loaded:
        return
    try:
        from ultralytics import YOLO
        custom_path = settings.custom_model_path
        if custom_path and os.path.isfile(custom_path):
            _model = YOLO(custom_path)
            print(f"[Detector] Loaded custom model: {custom_path}")
        else:
            _model = YOLO("yolov8n.pt")
            print("[Detector] Loaded default yolov8n.pt")
        _model_loaded = True
        _model_error = None
    except Exception as e:
        _model_error = str(e)
        _model_loaded = True  # Mark as attempted so we don't keep retrying
        print(f"[Detector] YOLO load failed: {e}. Using mock/Gemini fallback.")


def _filter_detection(class_name: str, confidence: float) -> bool:
    """Return True if detection should be kept."""
    if class_name in EXCLUDED_CLASSES:
        return False
    if confidence < settings.yolo_confidence:
        return False
    return True


def _run_yolo(frame: np.ndarray) -> List[Dict[str, Any]]:
    """Run YOLO on a frame and return filtered detections."""
    if _model is None:
        return []
    try:
        results = _model(frame, verbose=False)[0]
        detections = []
        for box in results.boxes:
            cls_id = int(box.cls[0])
            class_name = results.names[cls_id].lower()
            confidence = float(box.conf[0])
            if not _filter_detection(class_name, confidence):
                continue
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            detections.append({
                "class": class_name,
                "confidence": round(confidence, 3),
                "bbox": [int(x1), int(y1), int(x2), int(y2)],
            })
        return detections
    except Exception as e:
        print(f"[Detector] YOLO inference error: {e}")
        return []


def _run_gemini_vision(frame_b64: str) -> List[Dict[str, Any]]:
    """Fallback: use Gemini Vision to detect retail items."""
    if not settings.gemini_api_key:
        return []
    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        prompt = (
            "You are a retail shelf monitoring system. "
            "Analyze this shelf image and return ONLY a JSON array of detected retail items. "
            "Each item: {\"class\": \"<name>\", \"confidence\": <0.0-1.0>, \"bbox\": [x1, y1, x2, y2]}. "
            "Exclude people, animals, vehicles. Use pixel coordinates. Return ONLY the JSON array."
        )
        import json
        image_data = {"mime_type": "image/jpeg", "data": frame_b64}
        response = model.generate_content([prompt, image_data])
        text = response.text.strip()
        # Extract JSON from response
        start = text.find("[")
        end = text.rfind("]") + 1
        if start >= 0 and end > start:
            detections = json.loads(text[start:end])
            return [d for d in detections if isinstance(d, dict) and "class" in d]
    except Exception as e:
        print(f"[Detector] Gemini Vision error: {e}")
    return []


def _generate_mock_detections(rows: int, cols: int) -> List[Dict[str, Any]]:
    """
    Generate realistic mock detections for demo mode when no camera is available.
    Simulates a shelf with some items and some empty spots.
    """
    detections = []
    frame_h, frame_w = 480, 640

    sx1 = int(settings.shelf_x1 * frame_w)
    sy1 = int(settings.shelf_y1 * frame_h)
    sx2 = int(settings.shelf_x2 * frame_w)
    sy2 = int(settings.shelf_y2 * frame_h)

    cell_w = (sx2 - sx1) / cols
    cell_h = (sy2 - sy1) / rows

    for r in range(rows):
        for c in range(cols):
            if random.random() < 0.75:  # 75% fill rate
                product = random.choice(DEMO_PRODUCTS)
                cx = sx1 + c * cell_w + cell_w / 2
                cy = sy1 + r * cell_h + cell_h / 2
                half_w = cell_w * 0.35
                half_h = cell_h * 0.35
                detections.append({
                    "class": product,
                    "confidence": round(random.uniform(0.65, 0.95), 2),
                    "bbox": [
                        int(cx - half_w), int(cy - half_h),
                        int(cx + half_w), int(cy + half_h),
                    ],
                })
    return detections


# ── Public API ────────────────────────────────────────────────────────────────

def detect(
    frame: Optional[np.ndarray] = None,
    frame_b64: Optional[str] = None,
    rows: int = 4,
    cols: int = 5,
    use_mock: bool = False,
) -> Dict[str, Any]:
    """
    Main detection entry point.

    Priority:
      1. YOLO (if model loaded and frame provided)
      2. Gemini Vision (if API key set and frame_b64 provided)
      3. Mock (demo mode / no camera)

    Returns:
      {
        "detections": [...],
        "source": "yolo" | "gemini" | "mock",
        "model_error": str | None
      }
    """
    global _model_loaded
    if not _model_loaded:
        _load_model()

    # Mock mode — used when no real camera is connected
    if use_mock:
        return {
            "detections": _generate_mock_detections(rows, cols),
            "source": "mock",
            "model_error": None,
        }

    # YOLO
    if frame is not None and _model is not None:
        detections = _run_yolo(frame)
        return {
            "detections": detections,
            "source": "yolo",
            "model_error": _model_error,
        }

    # Gemini Vision fallback
    if frame_b64 and settings.gemini_api_key:
        detections = _run_gemini_vision(frame_b64)
        return {
            "detections": detections,
            "source": "gemini",
            "model_error": _model_error,
        }

    # Final fallback — mock
    return {
        "detections": _generate_mock_detections(rows, cols),
        "source": "mock",
        "model_error": _model_error or "No detection source available",
    }
