"""
config.py — Central configuration for ShelfSense AI
Demo mode: fast, responsive; Production mode: stable, noise-resistant
"""

from pydantic_settings import BaseSettings
from pydantic import Field
from typing import List
import os


class Settings(BaseSettings):
    # ── Core ──────────────────────────────────────────────────────────────
    app_mode: str = Field(default="production", env="APP_MODE")  # "demo" | "production"

    # ── Grid ──────────────────────────────────────────────────────────────
    grid_rows: int = Field(default=4, env="GRID_ROWS")
    grid_cols: int = Field(default=5, env="GRID_COLS")

    # ── Shelf Region (normalised 0-1) ──────────────────────────────────────
    shelf_x1: float = Field(default=0.05, env="SHELF_X1")
    shelf_y1: float = Field(default=0.10, env="SHELF_Y1")
    shelf_x2: float = Field(default=0.95, env="SHELF_X2")
    shelf_y2: float = Field(default=0.90, env="SHELF_Y2")

    # ── YOLO ──────────────────────────────────────────────────────────────
    custom_model_path: str = Field(default="", env="CUSTOM_MODEL_PATH")
    yolo_confidence: float = Field(default=0.40, env="YOLO_CONFIDENCE")

    # ── Google Gemini ──────────────────────────────────────────────────────
    gemini_api_key: str = Field(default="", env="GEMINI_API_KEY")

    # ── Twilio WhatsApp ────────────────────────────────────────────────────
    twilio_account_sid: str = Field(default="", env="TWILIO_ACCOUNT_SID")
    twilio_auth_token: str = Field(default="", env="TWILIO_AUTH_TOKEN")
    twilio_from: str = Field(default="whatsapp:+14155238886", env="TWILIO_FROM")
    twilio_to: str = Field(default="", env="TWILIO_TO")

    # ── Scheduler ─────────────────────────────────────────────────────────
    daily_report_hour: int = Field(default=20, env="DAILY_REPORT_HOUR")
    daily_report_minute: int = Field(default=0, env="DAILY_REPORT_MINUTE")

    # ── Database ──────────────────────────────────────────────────────────
    db_path: str = Field(default="shelfsense.db", env="DB_PATH")

    model_config = {"env_file": ".env", "extra": "ignore"}

    # ── Dynamic properties based on mode ──────────────────────────────────
    @property
    def buffer_size(self) -> int:
        return 3 if self.app_mode == "demo" else 7

    @property
    def snapshot_interval_sec(self) -> float:
        return 3.0 if self.app_mode == "demo" else 8.0

    @property
    def occlusion_threshold(self) -> float:
        """If occupied_cells < rolling_avg * threshold → skip frame"""
        return 0.5 if self.app_mode == "demo" else 0.6

    @property
    def min_sale_confidence(self) -> float:
        return 0.40 if self.app_mode == "demo" else 0.50


# Allowed retail item classes (COCO + common retail names)
RETAIL_CLASSES = {
    "bottle", "cup", "bowl", "wine glass", "fork", "knife", "spoon",
    "banana", "apple", "sandwich", "orange", "broccoli", "carrot",
    "hot dog", "pizza", "donut", "cake", "book", "scissors",
    "toothbrush", "hair drier", "vase", "clock", "cell phone",
    "laptop", "keyboard", "remote", "mouse", "backpack", "handbag",
    "suitcase", "umbrella", "tie", "skis", "snowboard", "sports ball",
    "frisbee", "kite", "baseball bat", "baseball glove", "skateboard",
    "surfboard", "tennis racket", "bottle", "wine glass", "teddy bear",
    # Generic fallback — keeps anything that is NOT explicitly excluded
}

# Classes to ALWAYS exclude regardless of confidence
EXCLUDED_CLASSES = {
    "person", "bicycle", "car", "motorcycle", "airplane", "bus", "train",
    "truck", "boat", "traffic light", "fire hydrant", "stop sign",
    "parking meter", "bench", "bird", "cat", "dog", "horse", "sheep",
    "cow", "elephant", "bear", "zebra", "giraffe",
}


settings = Settings()
