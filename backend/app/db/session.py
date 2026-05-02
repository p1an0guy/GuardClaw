from __future__ import annotations

from app.core.config import settings
from app.repositories.store import SQLiteStore


store = SQLiteStore(settings.sqlite_path)

