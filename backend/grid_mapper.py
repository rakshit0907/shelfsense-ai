"""
grid_mapper.py — Maps YOLO detections onto a shelf grid
"""

from typing import List, Dict, Any, Optional
from config import settings


class GridMapper:
    """
    Divides the visible shelf region into R×C cells.
    Maps each detection's center point to a cell.
    If multiple detections land in the same cell → keep highest confidence.
    Detections outside the shelf region are ignored.
    """

    def __init__(
        self,
        rows: Optional[int] = None,
        cols: Optional[int] = None,
        shelf_x1: Optional[float] = None,
        shelf_y1: Optional[float] = None,
        shelf_x2: Optional[float] = None,
        shelf_y2: Optional[float] = None,
    ):
        self.rows = rows or settings.grid_rows
        self.cols = cols or settings.grid_cols
        self.shelf_x1 = shelf_x1 if shelf_x1 is not None else settings.shelf_x1
        self.shelf_y1 = shelf_y1 if shelf_y1 is not None else settings.shelf_y1
        self.shelf_x2 = shelf_x2 if shelf_x2 is not None else settings.shelf_x2
        self.shelf_y2 = shelf_y2 if shelf_y2 is not None else settings.shelf_y2

    def update_region(
        self,
        shelf_x1: float,
        shelf_y1: float,
        shelf_x2: float,
        shelf_y2: float,
    ):
        self.shelf_x1 = shelf_x1
        self.shelf_y1 = shelf_y1
        self.shelf_x2 = shelf_x2
        self.shelf_y2 = shelf_y2

    def _detection_to_cell(
        self,
        bbox: List[int],
        frame_w: int,
        frame_h: int,
    ) -> Optional[tuple]:
        """
        Convert a bbox [x1,y1,x2,y2] to (row, col) in the shelf grid.
        Returns None if center is outside the shelf region.
        """
        cx = (bbox[0] + bbox[2]) / 2
        cy = (bbox[1] + bbox[3]) / 2

        # Normalise to 0-1
        cx_norm = cx / frame_w
        cy_norm = cy / frame_h

        # Check inside shelf region
        if not (self.shelf_x1 <= cx_norm <= self.shelf_x2 and
                self.shelf_y1 <= cy_norm <= self.shelf_y2):
            return None

        # Map to cell
        rel_x = (cx_norm - self.shelf_x1) / (self.shelf_x2 - self.shelf_x1)
        rel_y = (cy_norm - self.shelf_y1) / (self.shelf_y2 - self.shelf_y1)

        col = min(int(rel_x * self.cols), self.cols - 1)
        row = min(int(rel_y * self.rows), self.rows - 1)

        return (row, col)

    def map(
        self,
        detections: List[Dict[str, Any]],
        frame_w: int = 640,
        frame_h: int = 480,
    ) -> List[List[str]]:
        """
        Build and return a grid[row][col] = "item_name" | "empty".

        When multiple detections map to the same cell, the one with
        the highest confidence wins.
        """
        # Best detection per cell: (confidence, class_name)
        best: Dict[tuple, tuple] = {}

        for det in detections:
            cell = self._detection_to_cell(det["bbox"], frame_w, frame_h)
            if cell is None:
                continue
            conf = det["confidence"]
            if cell not in best or conf > best[cell][0]:
                best[cell] = (conf, det["class"])

        # Build grid
        grid = [["empty"] * self.cols for _ in range(self.rows)]
        for (row, col), (conf, cls) in best.items():
            grid[row][col] = cls

        return grid

    def get_cell_bounds_normalized(self, row: int, col: int) -> Dict[str, float]:
        """Return normalised (0-1) bounding box of a grid cell for UI overlay."""
        shelf_w = self.shelf_x2 - self.shelf_x1
        shelf_h = self.shelf_y2 - self.shelf_y1
        cell_w = shelf_w / self.cols
        cell_h = shelf_h / self.rows
        return {
            "x1": self.shelf_x1 + col * cell_w,
            "y1": self.shelf_y1 + row * cell_h,
            "x2": self.shelf_x1 + (col + 1) * cell_w,
            "y2": self.shelf_y1 + (row + 1) * cell_h,
        }

    def get_shelf_region(self) -> Dict[str, float]:
        return {
            "x1": self.shelf_x1,
            "y1": self.shelf_y1,
            "x2": self.shelf_x2,
            "y2": self.shelf_y2,
        }

    def count_occupied(self, grid: List[List[str]]) -> int:
        return sum(1 for row in grid for cell in row if cell != "empty")

    def count_by_item(self, grid: List[List[str]]) -> Dict[str, int]:
        counts: Dict[str, int] = {}
        for row in grid:
            for cell in row:
                if cell != "empty":
                    counts[cell] = counts.get(cell, 0) + 1
        return counts
