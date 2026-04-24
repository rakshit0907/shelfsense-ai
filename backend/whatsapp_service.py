"""
whatsapp_service.py — Twilio WhatsApp integration with duplicate prevention
"""

from datetime import date, datetime
from typing import Optional, Dict, Any

from config import settings
import database as db


def _build_message(sales: list, report_date: str) -> str:
    """Format the daily sales report message."""
    lines = [
        "📊 *ShelfSense AI — Daily Sales Report*",
        "",
        f"📅 Date: {report_date}",
        "━━━━━━━━━━━━━━━━━━━━━",
    ]
    total = 0
    if sales:
        for s in sales:
            item = s["item_name"].title()
            qty = s["quantity"]
            lines.append(f"  • {item}: {qty} unit(s)")
            total += qty
    else:
        lines.append("  No sales recorded today.")

    lines += [
        "━━━━━━━━━━━━━━━━━━━━━",
        f"📦 *Total Units Sold: {total}*",
        "",
        "Powered by ShelfSense AI 🤖",
    ]
    return "\n".join(lines)


async def send_whatsapp_report(
    target_date: Optional[str] = None,
    force: bool = False,
) -> Dict[str, Any]:
    """
    Send the daily WhatsApp report.

    - Checks for duplicate send via daily_reports_log
    - Falls back to mock/log mode if Twilio not configured
    - Returns {"success": bool, "message": str, "mode": "real" | "mock"}
    """
    report_date = target_date or date.today().isoformat()

    # Duplicate prevention
    if not force and await db.was_report_sent(report_date):
        return {
            "success": False,
            "message": f"Report for {report_date} already sent.",
            "mode": "skipped",
        }

    # Fetch today's sales
    sales = await db.get_daily_sales(report_date)
    message_text = _build_message(sales, report_date)

    # Try Twilio
    if (settings.twilio_account_sid and settings.twilio_auth_token and settings.twilio_to):
        try:
            from twilio.rest import Client
            client = Client(settings.twilio_account_sid, settings.twilio_auth_token)
            msg = client.messages.create(
                body=message_text,
                from_=settings.twilio_from,
                to=settings.twilio_to,
            )
            await db.mark_report_sent(report_date, message_text, "whatsapp")
            return {
                "success": True,
                "message": f"WhatsApp report sent! SID: {msg.sid}",
                "mode": "real",
                "sid": msg.sid,
            }
        except Exception as e:
            print(f"[WhatsApp] Twilio error: {e}")
            # Fall through to mock

    # Mock mode — log to console and DB
    print("\n" + "=" * 50)
    print("[WhatsApp MOCK — would send via Twilio]")
    print(f"TO: {settings.twilio_to or 'NOT CONFIGURED'}")
    print(message_text)
    print("=" * 50 + "\n")

    await db.mark_report_sent(report_date, message_text, "mock")
    return {
        "success": True,
        "message": "Report logged (mock mode — add Twilio credentials to .env for real WhatsApp).",
        "mode": "mock",
        "report_text": message_text,
    }
