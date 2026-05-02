# Tech Steering

## Stack
- Frontend: Next.js, TypeScript strict mode, Tailwind CSS.
- Backend: FastAPI, Python, Pydantic API contracts.
- Persistence: SQLite.
- Runtime orchestration: Hermes Agent through a dedicated `guardclaw` profile.
- Repo workflow: Kiro specs and steering files live under `.kiro/`.

## Constraints
- Keep the first slice boring and maintainable.
- Prefer typed schemas at service boundaries.
- Demo mode is explicit in response payloads and visible UI.
- Real messaging adapters can replace stubs later without changing risk-engine behavior.
- External alert sources are normalized behind adapters; replay fixtures are the default demo path.

