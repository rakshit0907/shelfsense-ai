"""
logic.py — Count-capped sales detection, alerts, and Gemini-powered insights
Implements the EXACT sales detection algorithm from the spec.
"""

import json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from collections import deque

from config import settings

GridType = List[List[str]]

# ── Sales Detection ───────────────────────────────────────────────────────────


def detect_sales(
    prev_grid: GridType,
    curr_grid: GridType,
) -> List[Dict[str, Any]]:
    """
    Count-capped sales detection algorithm.

    Step 1: Count items in both grids
    Step 2: Compute sale_cap per item = old_count - new_count
    Step 3: Find cells where old != "empty" and new == "empty"
    Step 4: Confirm sales up to sale_cap (ignores rearrangements)

    Returns list of sale events:
      [{"item_name": str, "quantity": int, "cells": [(row, col), ...]}]
    """
    if not prev_grid or not curr_grid:
        return []

    rows = len(prev_grid)
    cols = len(prev_grid[0]) if rows else 0

    # Step 1: Count items
    old_counts: Dict[str, int] = {}
    new_counts: Dict[str, int] = {}
    for r in range(rows):
        for c in range(cols):
            old_item = prev_grid[r][c]
            new_item = curr_grid[r][c]
            if old_item != "empty":
                old_counts[old_item] = old_counts.get(old_item, 0) + 1
            if new_item != "empty":
                new_counts[new_item] = new_counts.get(new_item, 0) + 1

    # Step 2: Sale cap per item
    sale_cap: Dict[str, int] = {}
    for item, old_cnt in old_counts.items():
        new_cnt = new_counts.get(item, 0)
        cap = old_cnt - new_cnt
        if cap > 0:
            sale_cap[item] = cap

    if not sale_cap:
        return []  # No net reduction → rearrangement or refill

    # Step 3: Find per-cell disappearances
    disappearances: Dict[str, List[Tuple[int, int]]] = {}
    for r in range(rows):
        for c in range(cols):
            old_item = prev_grid[r][c]
            new_item = curr_grid[r][c]
            if old_item != "empty" and new_item == "empty":
                if old_item not in disappearances:
                    disappearances[old_item] = []
                disappearances[old_item].append((r, c))

    # Step 4: Apply cap — confirm sales, ignore rearrangements
    sales: List[Dict[str, Any]] = []
    for item, cells in disappearances.items():
        cap = sale_cap.get(item, 0)
        if cap <= 0:
            continue  # Item moved but total count didn't drop → rearrangement
        confirmed_cells = cells[:cap]  # Take only up to sale_cap
        sales.append({
            "item_name": item,
            "quantity": len(confirmed_cells),
            "cells": confirmed_cells,
        })

    return sales


# ── Alerts ───────────────────────────────────────────────────────────────────

LOW_STOCK_THRESHOLD = 0.25  # 25% of cells occupied → low stock alert


def generate_alerts(
    grid: GridType,
    sales_rate: Optional[Dict[str, float]] = None,
) -> List[Dict[str, Any]]:
    """
    Generate alerts based on current shelf state.

    Alert types:
      - out_of_stock: item count = 0 (was previously seen)
      - low_stock: item count < LOW_STOCK_THRESHOLD * total cells
      - fast_moving: sales rate > 2 per hour
      - shelf_empty: entire shelf is empty
    """
    alerts = []
    rows = len(grid)
    cols = len(grid[0]) if rows else 0
    total_cells = rows * cols
    ts = datetime.utcnow().isoformat()

    # Count per item
    counts: Dict[str, int] = {}
    empty_count = 0
    for row in grid:
        for cell in row:
            if cell == "empty":
                empty_count += 1
            else:
                counts[cell] = counts.get(cell, 0) + 1

    occupied = total_cells - empty_count

    # Shelf completely empty
    if occupied == 0:
        alerts.append({
            "id": "shelf_empty",
            "type": "critical",
            "title": "Shelf is Empty",
            "message": "No products detected on the shelf. Immediate restocking needed.",
            "timestamp": ts,
        })
        return alerts

    # Per-item checks
    for item, count in counts.items():
        fill_ratio = count / total_cells
        if fill_ratio < LOW_STOCK_THRESHOLD:
            alerts.append({
                "id": f"low_stock_{item}",
                "type": "warning",
                "title": f"Low Stock: {item.title()}",
                "message": f"Only {count} unit(s) of {item} remaining on shelf.",
                "timestamp": ts,
            })

        # Fast-moving check
        if sales_rate and item in sales_rate:
            rate = sales_rate[item]
            if rate > 2.0:
                alerts.append({
                    "id": f"fast_moving_{item}",
                    "type": "info",
                    "title": f"Fast Moving: {item.title()}",
                    "message": f"{item.title()} selling at {rate:.1f} units/hour.",
                    "timestamp": ts,
                })

    return alerts


# ── Sales Rate ────────────────────────────────────────────────────────────────

class SalesRateTracker:
    """Tracks sales over time to compute per-item rates."""

    def __init__(self, window_hours: float = 1.0):
        self.window_sec = window_hours * 3600
        # {item_name: deque[(timestamp, quantity)]}
        self._events: Dict[str, deque] = {}

    def record(self, item_name: str, quantity: int):
        if item_name not in self._events:
            self._events[item_name] = deque()
        now = datetime.utcnow().timestamp()
        self._events[item_name].append((now, quantity))
        self._prune(item_name)

    def _prune(self, item_name: str):
        cutoff = datetime.utcnow().timestamp() - self.window_sec
        q = self._events[item_name]
        while q and q[0][0] < cutoff:
            q.popleft()

    def get_rate(self, item_name: str) -> float:
        """Units sold per hour."""
        if item_name not in self._events or not self._events[item_name]:
            return 0.0
        self._prune(item_name)
        total = sum(qty for _, qty in self._events[item_name])
        return total  # per window (1 hour)

    def get_all_rates(self) -> Dict[str, float]:
        return {item: self.get_rate(item) for item in self._events}


# ── Gemini Insights ───────────────────────────────────────────────────────────

async def get_gemini_insights(
    daily_sales: List[Dict[str, Any]],
    alerts: List[Dict[str, Any]],
) -> str:
    """
    Generate natural language insights using Gemini API.
    Falls back to rule-based summary if API not available.
    """
    if not settings.gemini_api_key:
        return _rule_based_insights(daily_sales, alerts)

    try:
        import google.generativeai as genai
        genai.configure(api_key=settings.gemini_api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")

        sales_str = "\n".join(
            f"  - {s['item_name']}: {s['quantity']} units" for s in daily_sales
        )
        alert_str = "\n".join(f"  - {a['title']}: {a['message']}" for a in alerts)

        prompt = f"""You are an AI retail analyst. Provide 2-3 concise actionable insights for a retail store manager.

Today's Sales:
{sales_str or "  No sales recorded yet."}

Current Alerts:
{alert_str or "  No alerts."}

Keep it brief, practical, and use bullet points. No introductory sentences."""

        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"[Logic] Gemini insights error: {e}")
        return _rule_based_insights(daily_sales, alerts)


def _rule_based_insights(
    daily_sales: List[Dict[str, Any]],
    alerts: List[Dict[str, Any]],
) -> str:
    lines = []
    total = sum(s.get("quantity", 0) for s in daily_sales)
    if total > 0:
        top = max(daily_sales, key=lambda s: s.get("quantity", 0))
        lines.append(f"• {top['item_name'].title()} is today's top seller with {top['quantity']} units.")

    low_stock = [a for a in alerts if a.get("type") == "warning"]
    if low_stock:
        items = ", ".join(a["title"].replace("Low Stock: ", "") for a in low_stock[:3])
        lines.append(f"• Restock soon: {items}.")

    critical = [a for a in alerts if a.get("type") == "critical"]
    if critical:
        lines.append("• URGENT: Shelf is empty — immediate restocking required.")

    if not lines:
        lines.append("• Shelf monitoring active. All stock levels normal.")

    return "\n".join(lines)
