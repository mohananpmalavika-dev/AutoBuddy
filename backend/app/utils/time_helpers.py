from datetime import datetime, timedelta, timezone

IST_TZ = timezone(timedelta(hours=5, minutes=30))


def get_ist_now() -> datetime:
    """Return the current datetime in Indian Standard Time (IST)."""
    return datetime.now(IST_TZ)
