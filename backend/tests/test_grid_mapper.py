"""
tests/test_grid_mapper.py — Unit tests for shelf region and grid mapping
"""
import pytest
from grid_mapper import GridMapper


@pytest.fixture
def mapper():
    """4×5 grid with full-frame shelf region."""
    return GridMapper(rows=4, cols=5, shelf_x1=0.0, shelf_y1=0.0, shelf_x2=1.0, shelf_y2=1.0)


def test_center_detection_maps_correctly(mapper):
    """Detection centred at (0.5, 0.5) should map to the middle cell."""
    # Centre of a 4×5 grid at (0.5, 0.5) → row=2, col=2
    det = [{"class": "bottle", "confidence": 0.9, "bbox": [304, 224, 336, 256]}]
    grid = mapper.map(det, frame_w=640, frame_h=480)
    assert grid[2][2] == "bottle"


def test_detection_outside_shelf_ignored():
    """Detections outside the shelf bounding box must be dropped."""
    m = GridMapper(rows=4, cols=5, shelf_x1=0.2, shelf_y1=0.2, shelf_x2=0.8, shelf_y2=0.8)
    # Detection at corner (0,0) → outside shelf
    det = [{"class": "bottle", "confidence": 0.9, "bbox": [0, 0, 10, 10]}]
    grid = m.map(det, frame_w=640, frame_h=480)
    occupied = sum(1 for row in grid for c in row if c != "empty")
    assert occupied == 0


def test_highest_confidence_wins(mapper):
    """Two detections in the same cell — highest confidence must win."""
    det = [
        {"class": "bottle", "confidence": 0.60, "bbox": [300, 220, 340, 260]},
        {"class": "chips",  "confidence": 0.90, "bbox": [305, 225, 335, 255]},
    ]
    grid = mapper.map(det, frame_w=640, frame_h=480)
    center_item = grid[2][2]
    assert center_item == "chips"


def test_empty_detections_return_empty_grid(mapper):
    grid = mapper.map([], frame_w=640, frame_h=480)
    assert all(c == "empty" for row in grid for c in row)


def test_count_by_item(mapper):
    grid = [
        ["bottle", "chips", "empty"],
        ["bottle", "empty", "juice"],
    ]
    counts = mapper.count_by_item(grid)
    assert counts["bottle"] == 2
    assert counts["chips"] == 1
    assert counts["juice"] == 1
    assert "empty" not in counts


def test_count_occupied(mapper):
    grid = [["bottle", "empty", "chips"], ["empty", "empty", "empty"]]
    assert mapper.count_occupied(grid) == 2


def test_full_frame_shelf_cells_non_overlapping(mapper):
    """All cells must cover distinct areas with no gap."""
    seen = set()
    for r in range(mapper.rows):
        for c in range(mapper.cols):
            bounds = mapper.get_cell_bounds_normalized(r, c)
            key = (round(bounds["x1"], 4), round(bounds["y1"], 4))
            assert key not in seen
            seen.add(key)
