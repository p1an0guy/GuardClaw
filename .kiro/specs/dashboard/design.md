# Dashboard Design

## Layout
- Header: product name, demo badge, replay source selector, simulation button.
- Active incident banner: severity, title, source, location, simulated/live label.
- Household panel: member cards and home signal status.
- Rationale panel: affected people and human-readable explanation.
- Timeline panel: generated plan steps, outbound draft logs, acknowledgements.

## Data Flow
- On load, fetch household, active incident, and timeline.
- On simulate, call `POST /api/simulate/event`, then refresh household and timeline.
- On acknowledge, call `POST /api/actions/acknowledge`, then refresh timeline.

## Visual Direction
- Warm neutral background with sage and blue accents.
- Rounded cards and clear spacing.
- Explicit labels for demo/replay state.
- Avoid fear-based styling.

