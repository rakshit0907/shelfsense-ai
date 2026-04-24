"""
tests/test_logic.py — Unit tests for the count-capped sales detection algorithm
"""
import pytest
from logic import detect_sales, generate_alerts, SalesRateTracker


# ── Sales Detection Tests ─────────────────────────────────────────────────────

def test_real_sale_detected():
    """A genuine removal (net count decrease) must be detected."""
    prev = [
        ["bottle", "bottle", "chips"],
        ["juice",  "empty",  "cola" ],
    ]
    curr = [
        ["bottle", "empty",  "chips"],   # bottle removed from (0,1)
        ["juice",  "empty",  "cola" ],
    ]
    sales = detect_sales(prev, curr)
    assert len(sales) == 1
    assert sales[0]["item_name"] == "bottle"
    assert sales[0]["quantity"] == 1


def test_rearrangement_ignored():
    """Item moved to another cell (same total count) must NOT trigger a sale."""
    prev = [
        ["bottle", "empty",  "chips"],
        ["empty",  "empty",  "empty"],
    ]
    curr = [
        ["empty",  "bottle", "chips"],   # bottle moved (0,0) → (0,1)
        ["empty",  "empty",  "empty"],
    ]
    sales = detect_sales(prev, curr)
    # bottle moved but count stayed at 1 → no sale
    assert all(s["item_name"] != "bottle" for s in sales)


def test_refill_no_sale():
    """Adding items must never trigger a sale."""
    prev = [
        ["empty", "empty", "empty"],
    ]
    curr = [
        ["bottle", "bottle", "chips"],
    ]
    sales = detect_sales(prev, curr)
    assert sales == []


def test_multiple_sales_same_item():
    """Multiple units of the same item sold must all be counted."""
    prev = [
        ["bottle", "bottle", "bottle"],
        ["bottle", "empty",  "empty" ],
    ]
    curr = [
        ["empty",  "empty",  "bottle"],
        ["empty",  "empty",  "empty" ],
    ]
    sales = detect_sales(prev, curr)
    bottle_sale = next((s for s in sales if s["item_name"] == "bottle"), None)
    assert bottle_sale is not None
    # 4 bottles → 1 bottle: cap = 3, disappearances = 3 → confirmed 3
    assert bottle_sale["quantity"] == 3


def test_cap_limits_confirmation():
    """
    If 3 bottles disappear but only 2 were removed (1 moved elsewhere),
    the cap should limit confirmed sales to 2.
    """
    prev = [
        ["bottle", "bottle", "bottle"],
        ["empty",  "empty",  "empty" ],
    ]
    curr = [
        ["empty",  "empty",  "empty" ],
        ["bottle", "empty",  "empty" ],   # 1 moved to row 1
    ]
    sales = detect_sales(prev, curr)
    bottle_sale = next((s for s in sales if s["item_name"] == "bottle"), None)
    assert bottle_sale is not None
    # 3 prev, 1 curr → cap = 2; 3 cells disappeared but 1 was just moved
    assert bottle_sale["quantity"] == 2


def test_empty_grids():
    """Empty grids must not crash."""
    assert detect_sales([], []) == []
    assert detect_sales([[]], [[]]) == []


def test_mixed_items():
    """Sales of different items in the same snapshot comparison."""
    prev = [["bottle", "chips", "juice"]],
    prev = [["bottle", "chips", "juice"]]
    curr = [["empty",  "chips", "empty" ]]
    sales = detect_sales(prev, curr)
    items = {s["item_name"] for s in sales}
    assert "bottle" in items
    assert "juice" in items
    assert "chips" not in items


# ── Alert Tests ───────────────────────────────────────────────────────────────

def test_low_stock_alert():
    grid = [
        ["bottle", "empty", "empty", "empty", "empty"],
        ["empty",  "empty", "empty", "empty", "empty"],
    ]
    alerts = generate_alerts(grid)
    types = [a["type"] for a in alerts]
    assert "warning" in types or "critical" in types


def test_no_alert_healthy_shelf():
    grid = [
        ["bottle", "chips",  "juice",  "cola",  "water"],
        ["bottle", "cereal", "yogurt", "snack", "candy"],
    ]
    alerts = generate_alerts(grid)
    # No critical alert; low_stock only if fill < 25%
    critical = [a for a in alerts if a["type"] == "critical"]
    assert len(critical) == 0


def test_shelf_empty_critical():
    grid = [["empty", "empty"], ["empty", "empty"]]
    alerts = generate_alerts(grid)
    assert any(a["id"] == "shelf_empty" for a in alerts)


# ── Sales Rate Tests ──────────────────────────────────────────────────────────

def test_sales_rate_accumulates():
    tracker = SalesRateTracker(window_hours=1.0)
    tracker.record("bottle", 3)
    tracker.record("bottle", 2)
    assert tracker.get_rate("bottle") == 5


def test_sales_rate_unknown_item():
    tracker = SalesRateTracker()
    assert tracker.get_rate("nonexistent") == 0.0
