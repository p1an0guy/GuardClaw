# Safety Steering

GuardClaw must be careful with household safety context.

## Requirements
- Always label replay/simulated data.
- Do not claim real emergency alerts, dispatches, or outbound sends unless implemented and verified.
- Do not frame the product as surveillance.
- Do not store secrets in the repo.
- Do not contact real people without explicit user approval.
- If a user describes an urgent real-world emergency, direct them to official local alerts and emergency services.

## MVP Privacy Posture
- Household data is seeded demo data.
- Camera input is represented only as a boolean occupancy-confirmed home signal.
- Timeline entries are local SQLite records.
- Messaging adapters are stubs for Discord, email, SMS, and backend Telegram delivery.

