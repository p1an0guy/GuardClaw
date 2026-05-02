# Structure Steering

## Layout
- `backend/app/models`: Pydantic contracts and domain schemas.
- `backend/app/services`: risk engine, alert source adapters, Hermes adapter, messaging abstractions.
- `backend/app/repositories`: SQLite persistence.
- `frontend/app`: Next.js App Router pages and global styling.
- `frontend/components`: dashboard UI sections.
- `frontend/lib`: typed API client and shared frontend types.
- `hermes`: GuardClaw Hermes identity and setup notes.
- `.kiro/specs`: feature specs.

## Rules
- Do not hide demo behavior behind ambiguous labels.
- Keep generated outbound drafts separate from real sends.
- Avoid broad framework abstractions until the demo flow proves they are needed.

