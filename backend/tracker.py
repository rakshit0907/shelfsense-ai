"""
tracker.py — Frame buffer, majority voting, occlusion guard, snapshot management
Implements the EXACT algorithm specified in the requirements.
"""

import json
import time
from collections import deque, Counter
from typing import List, Dict, Any, Optional, Deque
from datetime import datetime

from config import settings
from grid_mapper import GridMapper


GridType = List[List[str]]


class ShelfTracker:
    """
    Core tracking engine.

    Pipeline:
      add_frame(raw_grid) → occlusion_guard → frame_buffer → stable_grid
      snapshot() → compare → sales_events
    """

    def __init__(self, rows: int, cols: int, mapper: GridMapper):
        self.rows = rows
        self.cols = cols
        self.mapper = mapper

        # ── Frame buffer ─────────────────────────────────────────────────
        self._buffer: Deque[GridType] = deque(maxlen=settings.buffer_size)

        # ── Rolling average of occupied cells (for occlusion guard) ──────
        self._occ_history: Deque[int] = deque(maxlen=20)

        # ── Stable grid ──────────────────────────────────────────────────
        self.stable_grid: GridType = self._empty_grid()

        # ── Snapshot system ──────────────────────────────────────────────
        self._last_snapshot: Optional[GridType] = None
        self._last_snapshot_time: float = 0.0

        # ── Stats ─────────────────────────────────────────────────────────
        self.frames_processed: int = 0
        self.frames_skipped: int = 0
        self.total_sales: int = 0
        self.system_status: str = "initializing"  # normal | occluded | no_shelf | error

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _empty_grid(self) -> GridType:
        return [["empty"] * self.cols for _ in range(self.rows)]

    def _rolling_avg_occupied(self) -> float:
        if not self._occ_history:
            return float(self.rows * self.cols) * 0.5
        return sum(self._occ_history) / len(self._occ_history)

    # ── Core pipeline ────────────────────────────────────────────────────────

    def add_frame(self, raw_grid: GridType) -> bool:
        """
        Add a new detection grid to the buffer.
        Applies occlusion guard before adding.
        Returns True if frame was accepted.
        """
        occupied = self.mapper.count_occupied(raw_grid)
        rolling_avg = self._rolling_avg_occupied()

        # Occlusion guard: reject frames where occupancy drops too sharply
        if self._occ_history and occupied < rolling_avg * settings.occlusion_threshold:
            self.frames_skipped += 1
            self.system_status = "occluded"
            return False

        self._occ_history.append(occupied)
        self._buffer.append(raw_grid)
        self.frames_processed += 1
        self.system_status = "normal"
        return True

    def _majority_vote(self) -> GridType:
        """
        For each cell, pick the most common value across all buffered frames.
        ["bottle","bottle","empty","bottle","bottle"] → "bottle"
        """
        if not self._buffer:
            return self._empty_grid()

        result = []
        for r in range(self.rows):
            row = []
            for c in range(self.cols):
                values = [frame[r][c] for frame in self._buffer]
                most_common = Counter(values).most_common(1)[0][0]
                row.append(most_common)
            result.append(row)
        return result

    def update_stable_grid(self) -> GridType:
        """Rebuild the stable grid using majority voting."""
        self.stable_grid = self._majority_vote()
        return self.stable_grid

    # ── Snapshot system ──────────────────────────────────────────────────────

    def should_snapshot(self) -> bool:
        """Returns True if it's time to take a new snapshot."""
        return time.time() - self._last_snapshot_time >= settings.snapshot_interval_sec

    def take_snapshot(self) -> Optional[GridType]:
        """
        Take a snapshot of the current stable grid.
        Returns the snapshot if buffer has enough frames, else None.
        """
        if len(self._buffer) < max(1, settings.buffer_size // 2):
            return None  # Not enough frames yet

        stable = self.update_stable_grid()
        snapshot = [row[:] for row in stable]  # deep copy
        self._last_snapshot = snapshot
        self._last_snapshot_time = time.time()
        return snapshot

    def get_last_snapshot(self) -> Optional[GridType]:
        return self._last_snapshot

    # ── State export ─────────────────────────────────────────────────────────

    def get_state(self) -> Dict[str, Any]:
        return {
            "stable_grid": self.stable_grid,
            "buffer_size": len(self._buffer),
            "buffer_capacity": settings.buffer_size,
            "frames_processed": self.frames_processed,
            "frames_skipped": self.frames_skipped,
            "total_sales": self.total_sales,
            "status": self.system_status,
            "last_snapshot_time": datetime.fromtimestamp(self._last_snapshot_time).isoformat()
            if self._last_snapshot_time
            else None,
        }
