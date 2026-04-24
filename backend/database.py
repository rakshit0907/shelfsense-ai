"""
database.py — Async SQLite persistence for ShelfSense AI
"""

import aiosqlite
import asyncio
from datetime import date, datetime
from typing import Optional, List, Dict, Any
from config import settings


DB_PATH = settings.db_path

CREATE_TABLES_SQL = """
CREATE TABLE IF NOT EXISTS sales_events (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    item_name   TEXT    NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 1,
    timestamp   TEXT    NOT NULL,
    cell_row    INTEGER,
    cell_col    INTEGER,
    confidence  REAL
);

CREATE TABLE IF NOT EXISTS daily_sales (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT    NOT NULL,
    item_name   TEXT    NOT NULL,
    quantity    INTEGER NOT NULL DEFAULT 0,
    UNIQUE(date, item_name)
);

CREATE TABLE IF NOT EXISTS sales_audit_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sale_id     INTEGER,
    action      TEXT    NOT NULL,
    old_value   TEXT,
    new_value   TEXT,
    reason      TEXT,
    changed_by  TEXT    DEFAULT 'system',
    timestamp   TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_reports_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    date        TEXT    NOT NULL UNIQUE,
    sent        INTEGER NOT NULL DEFAULT 0,
    sent_at     TEXT,
    channel     TEXT    DEFAULT 'whatsapp',
    message     TEXT
);

CREATE TABLE IF NOT EXISTS shelf_config (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    key         TEXT    NOT NULL UNIQUE,
    value       TEXT    NOT NULL,
    updated_at  TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS snapshots (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp   TEXT    NOT NULL,
    grid_json   TEXT    NOT NULL,
    mode        TEXT    DEFAULT 'auto'
);
"""


async def get_db() -> aiosqlite.Connection:
    db = await aiosqlite.connect(DB_PATH)
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA journal_mode=WAL")
    await db.execute("PRAGMA foreign_keys=ON")
    return db


async def init_db():
    """Create all tables on startup."""
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        for stmt in CREATE_TABLES_SQL.strip().split(";"):
            stmt = stmt.strip()
            if stmt:
                await db.execute(stmt)
        await db.commit()


# ── Sales Events ────────────────────────────────────────────────────────────

async def insert_sale_event(
    item_name: str,
    quantity: int,
    timestamp: str,
    cell_row: Optional[int] = None,
    cell_col: Optional[int] = None,
    confidence: Optional[float] = None,
) -> int:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """INSERT INTO sales_events (item_name, quantity, timestamp, cell_row, cell_col, confidence)
               VALUES (?, ?, ?, ?, ?, ?)""",
            (item_name, quantity, timestamp, cell_row, cell_col, confidence),
        )
        await db.commit()
        sale_id = cursor.lastrowid
        # Also upsert into daily_sales
        today = timestamp[:10]
        await db.execute(
            """INSERT INTO daily_sales (date, item_name, quantity)
               VALUES (?, ?, ?)
               ON CONFLICT(date, item_name) DO UPDATE SET quantity = quantity + excluded.quantity""",
            (today, item_name, quantity),
        )
        await db.commit()
        # Audit log
        await _audit(db, sale_id, "CREATE", None, f"{item_name} x{quantity}", "auto-detection", "system")
        await db.commit()
        return sale_id


async def get_sales_events(
    limit: int = 50,
    offset: int = 0,
    date_filter: Optional[str] = None,
    item_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        conditions = []
        params: List[Any] = []
        if date_filter:
            conditions.append("date(timestamp) = ?")
            params.append(date_filter)
        if item_filter:
            conditions.append("item_name LIKE ?")
            params.append(f"%{item_filter}%")
        where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        params += [limit, offset]
        rows = await db.execute_fetchall(
            f"SELECT * FROM sales_events {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            params,
        )
        return [dict(r) for r in rows]


async def update_sale_event(
    sale_id: int,
    item_name: Optional[str] = None,
    quantity: Optional[int] = None,
    reason: str = "manual correction",
    changed_by: str = "user",
) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        row = await db.execute_fetchall("SELECT * FROM sales_events WHERE id = ?", [sale_id])
        if not row:
            return False
        old = dict(row[0])
        updates = {}
        if item_name is not None:
            updates["item_name"] = item_name
        if quantity is not None:
            updates["quantity"] = quantity
        if not updates:
            return False
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        vals = list(updates.values()) + [sale_id]
        await db.execute(f"UPDATE sales_events SET {set_clause} WHERE id = ?", vals)
        await db.commit()
        await _audit(
            db, sale_id, "UPDATE",
            f"{old['item_name']} x{old['quantity']}",
            f"{updates.get('item_name', old['item_name'])} x{updates.get('quantity', old['quantity'])}",
            reason, changed_by,
        )
        await db.commit()
        return True


async def delete_sale_event(
    sale_id: int,
    reason: str = "manual deletion",
    changed_by: str = "user",
) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        row = await db.execute_fetchall("SELECT * FROM sales_events WHERE id = ?", [sale_id])
        if not row:
            return False
        old = dict(row[0])
        await db.execute("DELETE FROM sales_events WHERE id = ?", [sale_id])
        await db.commit()
        await _audit(db, sale_id, "DELETE", f"{old['item_name']} x{old['quantity']}", None, reason, changed_by)
        await db.commit()
        return True


# ── Daily Sales ─────────────────────────────────────────────────────────────

async def get_daily_sales(target_date: Optional[str] = None) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        d = target_date or date.today().isoformat()
        rows = await db.execute_fetchall(
            "SELECT * FROM daily_sales WHERE date = ? ORDER BY quantity DESC", [d]
        )
        return [dict(r) for r in rows]


async def get_sales_summary(days: int = 7) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            """SELECT date, item_name, quantity FROM daily_sales
               WHERE date >= date('now', ?)
               ORDER BY date DESC, quantity DESC""",
            [f"-{days} days"],
        )
        return [dict(r) for r in rows]


# ── Audit Log ───────────────────────────────────────────────────────────────

async def _audit(
    db: aiosqlite.Connection,
    sale_id: Optional[int],
    action: str,
    old_value: Optional[str],
    new_value: Optional[str],
    reason: Optional[str],
    changed_by: str = "system",
):
    ts = datetime.utcnow().isoformat()
    await db.execute(
        """INSERT INTO sales_audit_log (sale_id, action, old_value, new_value, reason, changed_by, timestamp)
           VALUES (?, ?, ?, ?, ?, ?, ?)""",
        (sale_id, action, old_value, new_value, reason, changed_by, ts),
    )


async def get_audit_log(sale_id: Optional[int] = None, limit: int = 100) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if sale_id is not None:
            rows = await db.execute_fetchall(
                "SELECT * FROM sales_audit_log WHERE sale_id = ? ORDER BY timestamp DESC LIMIT ?",
                [sale_id, limit],
            )
        else:
            rows = await db.execute_fetchall(
                "SELECT * FROM sales_audit_log ORDER BY timestamp DESC LIMIT ?",
                [limit],
            )
        return [dict(r) for r in rows]


# ── Daily Reports ────────────────────────────────────────────────────────────

async def mark_report_sent(target_date: str, message: str, channel: str = "whatsapp"):
    async with aiosqlite.connect(DB_PATH) as db:
        ts = datetime.utcnow().isoformat()
        await db.execute(
            """INSERT INTO daily_reports_log (date, sent, sent_at, channel, message)
               VALUES (?, 1, ?, ?, ?)
               ON CONFLICT(date) DO UPDATE SET sent=1, sent_at=excluded.sent_at, message=excluded.message""",
            (target_date, ts, channel, message),
        )
        await db.commit()


async def was_report_sent(target_date: str) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT sent FROM daily_reports_log WHERE date = ?", [target_date]
        )
        return bool(rows and rows[0]["sent"])


async def get_report_log(limit: int = 30) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT * FROM daily_reports_log ORDER BY date DESC LIMIT ?", [limit]
        )
        return [dict(r) for r in rows]


# ── Snapshots ────────────────────────────────────────────────────────────────

async def save_snapshot(grid_json: str, mode: str = "auto"):
    async with aiosqlite.connect(DB_PATH) as db:
        ts = datetime.utcnow().isoformat()
        await db.execute(
            "INSERT INTO snapshots (timestamp, grid_json, mode) VALUES (?, ?, ?)",
            (ts, grid_json, mode),
        )
        await db.commit()


async def get_snapshots(limit: int = 20) -> List[Dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        rows = await db.execute_fetchall(
            "SELECT * FROM snapshots ORDER BY timestamp DESC LIMIT ?", [limit]
        )
        return [dict(r) for r in rows]
