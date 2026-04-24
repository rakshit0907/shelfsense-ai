"""
main.py — FastAPI application: REST API + WebSocket pipeline
"""

import asyncio
import base64
import json
import random
import time
from contextlib import asynccontextmanager
from datetime import date, datetime
from typing import Any, Dict, List, Optional

import numpy as np
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from fastapi import FastAPI, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import database as db
import detector
import whatsapp_service
from config import settings
from grid_mapper import GridMapper
from logic import SalesRateTracker, detect_sales, generate_alerts, get_gemini_insights
from tracker import ShelfTracker

# ── Global state ──────────────────────────────────────────────────────────────

grid_mapper = GridMapper()
tracker = ShelfTracker(rows=settings.grid_rows, cols=settings.grid_cols, mapper=grid_mapper)
rate_tracker = SalesRateTracker(window_hours=1.0)
scheduler = AsyncIOScheduler()

# Runtime state
_current_alerts: List[Dict[str, Any]] = []
_active_connections: List[WebSocket] = []
_camera_active: bool = False
_demo_mode: bool = settings.app_mode == "demo"
_last_insights: str = "• Shelf monitoring active. All stock levels normal."

# Demo simulation state
_demo_grid_state: Optional[List[List[str]]] = None


def _reset_tracker():
    global tracker, grid_mapper
    grid_mapper = GridMapper(
        rows=settings.grid_rows,
        cols=settings.grid_cols,
    )
    tracker = ShelfTracker(
        rows=settings.grid_rows,
        cols=settings.grid_cols,
        mapper=grid_mapper,
    )


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    await db.init_db()
    _reset_tracker()

    # Schedule daily report
    scheduler.add_job(
        _scheduled_daily_report,
        "cron",
        hour=settings.daily_report_hour,
        minute=settings.daily_report_minute,
        id="daily_report",
    )
    scheduler.start()

    # Start demo simulation loop
    asyncio.create_task(_demo_simulation_loop())

    print(f"[ShelfSense] Started in {settings.app_mode.upper()} mode")
    yield
    scheduler.shutdown()


async def _scheduled_daily_report():
    result = await whatsapp_service.send_whatsapp_report()
    print(f"[Scheduler] Daily report: {result['message']}")


# ── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="ShelfSense AI API",
    version="1.0.0",
    description="AI-powered Retail Shelf Monitoring & Inventory Management",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic Models ───────────────────────────────────────────────────────────

class SaleCreate(BaseModel):
    item_name: str
    quantity: int
    timestamp: Optional[str] = None
    cell_row: Optional[int] = None
    cell_col: Optional[int] = None


class SaleUpdate(BaseModel):
    item_name: Optional[str] = None
    quantity: Optional[int] = None
    reason: str = "manual correction"


class ConfigUpdate(BaseModel):
    mode: Optional[str] = None  # "demo" | "production"
    grid_rows: Optional[int] = None
    grid_cols: Optional[int] = None
    shelf_x1: Optional[float] = None
    shelf_y1: Optional[float] = None
    shelf_x2: Optional[float] = None
    shelf_y2: Optional[float] = None


# ── Helper: broadcast WebSocket message ──────────────────────────────────────

async def _broadcast(data: Dict[str, Any]):
    if not _active_connections:
        return
    msg = json.dumps(data)
    disconnected = []
    for ws in _active_connections:
        try:
            await ws.send_text(msg)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        _active_connections.remove(ws)


# ── Demo simulation ───────────────────────────────────────────────────────────

DEMO_PRODUCTS = [
    "bottle", "chips", "juice", "water", "cola",
    "snack", "cereal", "yogurt", "candy", "energy drink",
]


def _init_demo_grid() -> List[List[str]]:
    """Create initial demo grid with 75-85% fill."""
    grid = []
    for r in range(settings.grid_rows):
        row = []
        for c in range(settings.grid_cols):
            if random.random() < 0.80:
                row.append(random.choice(DEMO_PRODUCTS))
            else:
                row.append("empty")
        grid.append(row)
    return grid


async def _demo_simulation_loop():
    """Simulate shelf changes in demo mode for live UI updates."""
    global _demo_grid_state, _camera_active

    await asyncio.sleep(2)  # Let server fully start
    _demo_grid_state = _init_demo_grid()

    while True:
        if _demo_mode and _camera_active:
            await _process_grid(_demo_grid_state, source="demo")

            # Occasionally sell an item
            if random.random() < 0.15:
                _simulate_sale()

        await asyncio.sleep(settings.snapshot_interval_sec)


def _simulate_sale():
    """Remove a random item from the demo grid to simulate a sale."""
    global _demo_grid_state
    if not _demo_grid_state:
        return
    occupied = [
        (r, c)
        for r in range(len(_demo_grid_state))
        for c in range(len(_demo_grid_state[0]))
        if _demo_grid_state[r][c] != "empty"
    ]
    if occupied:
        r, c = random.choice(occupied)
        _demo_grid_state[r][c] = "empty"


async def _process_grid(raw_grid: List[List[str]], source: str = "camera"):
    """Process a raw detection grid through the full pipeline."""
    global _current_alerts, _last_insights

    accepted = tracker.add_frame(raw_grid)
    if not accepted:
        await _broadcast({"type": "status", "status": "occluded"})
        return

    if not tracker.should_snapshot():
        # Just send stable grid update
        stable = tracker.update_stable_grid()
        await _broadcast({
            "type": "grid_update",
            "grid": stable,
            "status": tracker.system_status,
            "stats": tracker.get_state(),
        })
        return

    # Take snapshot
    prev_snapshot = tracker.get_last_snapshot()
    curr_snapshot = tracker.take_snapshot()
    if curr_snapshot is None:
        return

    # Detect sales (if we have a previous snapshot to compare against)
    if prev_snapshot:
        sales_events = detect_sales(prev_snapshot, curr_snapshot)
        ts = datetime.utcnow().isoformat()

        for sale in sales_events:
            sale_id = await db.insert_sale_event(
                item_name=sale["item_name"],
                quantity=sale["quantity"],
                timestamp=ts,
            )
            rate_tracker.record(sale["item_name"], sale["quantity"])
            tracker.total_sales += sale["quantity"]

            await _broadcast({
                "type": "sale_detected",
                "item_name": sale["item_name"],
                "quantity": sale["quantity"],
                "cells": sale["cells"],
                "timestamp": ts,
                "sale_id": sale_id,
            })

    # Generate alerts
    rates = rate_tracker.get_all_rates()
    _current_alerts = generate_alerts(curr_snapshot, rates)

    # Broadcast full update
    await _broadcast({
        "type": "snapshot",
        "grid": curr_snapshot,
        "alerts": _current_alerts,
        "stats": tracker.get_state(),
        "source": source,
    })

    # Periodically refresh insights (every 5 snapshots)
    if tracker.frames_processed % 5 == 0:
        today_sales = await db.get_daily_sales()
        _last_insights = await get_gemini_insights(today_sales, _current_alerts)


# ── REST API ──────────────────────────────────────────────────────────────────

@app.get("/api/status")
async def get_status():
    return {
        "status": "ok",
        "mode": settings.app_mode,
        "camera_active": _camera_active,
        "demo_mode": _demo_mode,
        "grid": {"rows": settings.grid_rows, "cols": settings.grid_cols},
        "tracker": tracker.get_state(),
        "shelf_region": grid_mapper.get_shelf_region(),
        "version": "1.0.0",
    }


@app.get("/api/grid")
async def get_grid():
    return {
        "grid": tracker.stable_grid,
        "status": tracker.system_status,
        "shelf_region": grid_mapper.get_shelf_region(),
        "item_counts": grid_mapper.count_by_item(tracker.stable_grid),
    }


@app.get("/api/alerts")
async def get_alerts():
    return {"alerts": _current_alerts}


@app.get("/api/insights")
async def get_insights():
    return {"insights": _last_insights}


# ── Sales CRUD ────────────────────────────────────────────────────────────────

@app.get("/api/sales")
async def list_sales(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    date_filter: Optional[str] = Query(None),
    item_filter: Optional[str] = Query(None),
):
    sales = await db.get_sales_events(limit, offset, date_filter, item_filter)
    return {"sales": sales, "count": len(sales)}


@app.post("/api/sales", status_code=201)
async def create_sale(payload: SaleCreate):
    ts = payload.timestamp or datetime.utcnow().isoformat()
    sale_id = await db.insert_sale_event(
        item_name=payload.item_name,
        quantity=payload.quantity,
        timestamp=ts,
        cell_row=payload.cell_row,
        cell_col=payload.cell_col,
    )
    return {"id": sale_id, "message": "Sale recorded."}


@app.put("/api/sales/{sale_id}")
async def update_sale(sale_id: int, payload: SaleUpdate):
    ok = await db.update_sale_event(
        sale_id,
        item_name=payload.item_name,
        quantity=payload.quantity,
        reason=payload.reason,
        changed_by="user",
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Sale not found.")
    return {"message": "Sale updated."}


@app.delete("/api/sales/{sale_id}")
async def delete_sale(sale_id: int, reason: str = "manual deletion"):
    ok = await db.delete_sale_event(sale_id, reason=reason, changed_by="user")
    if not ok:
        raise HTTPException(status_code=404, detail="Sale not found.")
    return {"message": "Sale deleted."}


@app.get("/api/sales/audit")
async def get_audit(sale_id: Optional[int] = Query(None), limit: int = Query(100)):
    log = await db.get_audit_log(sale_id=sale_id, limit=limit)
    return {"audit_log": log}


@app.get("/api/daily-report")
async def get_daily_report(target_date: Optional[str] = Query(None)):
    d = target_date or date.today().isoformat()
    sales = await db.get_daily_sales(d)
    total = sum(s["quantity"] for s in sales)
    already_sent = await db.was_report_sent(d)
    rates = rate_tracker.get_all_rates()
    insights = await get_gemini_insights(sales, _current_alerts)
    return {
        "date": d,
        "sales": sales,
        "total_units": total,
        "already_sent": already_sent,
        "insights": insights,
        "alerts": _current_alerts,
    }


@app.get("/api/sales/summary")
async def get_sales_summary(days: int = Query(7, ge=1, le=90)):
    data = await db.get_sales_summary(days)
    return {"summary": data, "days": days}


# ── Config ────────────────────────────────────────────────────────────────────

@app.post("/api/config")
async def update_config(payload: ConfigUpdate):
    global _demo_mode, _demo_grid_state

    if payload.mode in ("demo", "production"):
        settings.app_mode = payload.mode
        _demo_mode = payload.mode == "demo"

    if payload.grid_rows and payload.grid_cols:
        settings.grid_rows = payload.grid_rows
        settings.grid_cols = payload.grid_cols
        _reset_tracker()
        if _demo_mode:
            _demo_grid_state = _init_demo_grid()

    if all(v is not None for v in [payload.shelf_x1, payload.shelf_y1, payload.shelf_x2, payload.shelf_y2]):
        grid_mapper.update_region(
            payload.shelf_x1, payload.shelf_y1,
            payload.shelf_x2, payload.shelf_y2,
        )

    return {"message": "Config updated.", "mode": settings.app_mode}


# ── Camera control ────────────────────────────────────────────────────────────

@app.post("/api/camera/start")
async def start_camera():
    global _camera_active
    _camera_active = True
    return {"camera_active": True}


@app.post("/api/camera/stop")
async def stop_camera():
    global _camera_active
    _camera_active = False
    return {"camera_active": False}


# ── WhatsApp ──────────────────────────────────────────────────────────────────

@app.post("/api/whatsapp/send")
async def send_whatsapp(target_date: Optional[str] = None, force: bool = False):
    result = await whatsapp_service.send_whatsapp_report(target_date, force)
    if not result["success"]:
        raise HTTPException(status_code=409, detail=result["message"])
    return result


@app.get("/api/whatsapp/log")
async def get_whatsapp_log():
    log = await db.get_report_log()
    return {"log": log}


# ── WebSocket ─────────────────────────────────────────────────────────────────

@app.websocket("/ws/camera")
async def websocket_camera(websocket: WebSocket):
    """
    WebSocket endpoint for live camera frame streaming.

    Client sends: {"type": "frame", "data": "<base64 jpeg>", "width": 640, "height": 480}
    Server broadcasts: grid updates, sale detections, alerts
    """
    await websocket.accept()
    _active_connections.append(websocket)
    print(f"[WS] Client connected. Total: {len(_active_connections)}")

    try:
        # Send initial state
        await websocket.send_text(json.dumps({
            "type": "connected",
            "mode": settings.app_mode,
            "grid": tracker.stable_grid,
            "status": tracker.system_status,
        }))

        while True:
            raw = await websocket.receive_text()
            msg = json.loads(raw)

            if msg.get("type") == "frame":
                # Real camera frame
                frame_b64 = msg.get("data", "")
                w = msg.get("width", 640)
                h = msg.get("height", 480)

                # Decode and detect
                result = detector.detect(
                    frame_b64=frame_b64,
                    rows=settings.grid_rows,
                    cols=settings.grid_cols,
                    use_mock=False,
                )
                raw_grid = grid_mapper.map(result["detections"], frame_w=w, frame_h=h)
                await _process_grid(raw_grid, source=result["source"])

            elif msg.get("type") == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))

            elif msg.get("type") == "request_mock":
                # Force a mock detection cycle
                result = detector.detect(
                    rows=settings.grid_rows,
                    cols=settings.grid_cols,
                    use_mock=True,
                )
                raw_grid = grid_mapper.map(result["detections"])
                await _process_grid(raw_grid, source="mock")

    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _active_connections:
            _active_connections.remove(websocket)
        print(f"[WS] Client disconnected. Total: {len(_active_connections)}")


@app.websocket("/ws/live")
async def websocket_live(websocket: WebSocket):
    """
    Live updates-only WebSocket (no frame sending).
    For dashboards that just want to receive updates.
    """
    await websocket.accept()
    _active_connections.append(websocket)
    try:
        await websocket.send_text(json.dumps({
            "type": "connected",
            "mode": settings.app_mode,
            "grid": tracker.stable_grid,
            "stats": tracker.get_state(),
            "alerts": _current_alerts,
        }))
        while True:
            # Keep alive
            await asyncio.sleep(30)
            await websocket.send_text(json.dumps({"type": "ping"}))
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _active_connections:
            _active_connections.remove(websocket)
