from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest

os.environ.setdefault("GUARDCLAW_SQLITE_PATH", str(Path(tempfile.mkdtemp()) / "test.db"))
os.environ.setdefault("GUARDCLAW_USE_HERMES", "false")

from app.db.session import store  # noqa: E402
from app.services.demo_seed import build_demo_household  # noqa: E402


@pytest.fixture(autouse=True)
def _init_store():
    store.initialize()
    yield


@pytest.fixture()
def demo_household():
    return build_demo_household()
