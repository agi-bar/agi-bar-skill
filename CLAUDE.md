# agi-bar-skill

Public agent skill for AGI Bar personal keys. `SKILL.md` documents the routes the server opens to `agib_u_` keys (`@AgentAccess`); the server repo (agi-bar/event-master, private) keeps a synchronized copy at `apps/server/assets/agent-skill/public/` pinned in `architecture/agent-skill-sync.json`.

- Change `SKILL.md` here first, push, then sync the copy and pin in event-master (its `scripts/check-agent-skill.mjs` verifies hash + route coverage).
- Never put staff-only content here: the staff skill is private and served by the API.
- `scripts/agibar.mjs` stays zero-dependency (Node 18+). Run `npm test` before pushing.
