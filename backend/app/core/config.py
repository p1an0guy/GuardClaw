from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path


def _bool_env(name: str, default: bool) -> bool:
    raw = os.getenv(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def _csv_env(name: str, default: list[str]) -> list[str]:
    raw = os.getenv(name)
    if not raw:
        return default
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    app_name: str = "GuardClaw API"
    demo_mode: bool = _bool_env("GUARDCLAW_DEMO_MODE", True)
    sqlite_path: Path = Path(
        os.getenv(
            "GUARDCLAW_SQLITE_PATH",
            str(Path(__file__).resolve().parents[2] / "data" / "guardclaw.db"),
        )
    )
    cors_origins: list[str] = None  # type: ignore[assignment]
    hermes_api_base_url: str = os.getenv("HERMES_API_BASE_URL", "http://127.0.0.1:8642/v1")
    hermes_api_key: str = os.getenv("HERMES_API_KEY", "")
    hermes_model: str = os.getenv("HERMES_MODEL", "hermes-agent")
    use_hermes: bool = _bool_env("GUARDCLAW_USE_HERMES", False)
    hermes_timeout_seconds: float = float(os.getenv("HERMES_TIMEOUT_SECONDS", "12"))
    supabase_url: str = os.getenv("SUPABASE_URL", os.getenv("EXPO_PUBLIC_SUPABASE_URL", ""))
    supabase_key: str = os.getenv(
        "SUPABASE_SERVICE_ROLE_KEY",
        os.getenv("SUPABASE_ANON_KEY", os.getenv("EXPO_PUBLIC_SUPABASE_ANON_KEY", "")),
    )
    supabase_family_id: str = os.getenv("SUPABASE_FAMILY_ID", os.getenv("EXPO_PUBLIC_FAMILY_ID", ""))
    cctv_clip_url: str = os.getenv(
        "GUARDCLAW_CCTV_CLIP_URL",
        "https://media.w3.org/2010/05/sintel/trailer.mp4",
    )

    def __post_init__(self) -> None:
        if self.cors_origins is None:
            object.__setattr__(
                self,
                "cors_origins",
                _csv_env(
                    "GUARDCLAW_CORS_ORIGINS",
                    [
                        "http://localhost:3000",
                        "http://127.0.0.1:3000",
                        "http://localhost:3100",
                        "http://127.0.0.1:3100",
                        "http://localhost:3200",
                        "http://127.0.0.1:3200",
                    ],
                ),
            )


settings = Settings()
