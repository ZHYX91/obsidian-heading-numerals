# Repository guidance

- Begin audits read-only and preserve unrelated user changes.
- Treat `src/core` as host-independent pure logic; it must not import Obsidian.
- All file writes require an immutable plan, preview, stale-content check, and bounded target.
- Never broaden cleanup recognition without adding false-positive fixtures first.
- Virtual and conceal display paths must never call Editor or Vault write APIs.
- A green `npm run check` is not real Obsidian runtime acceptance; use `docs/ACCEPTANCE.md`.
- Do not deploy to a production Vault unless the user explicitly names and authorizes that target.
- Preserve plugin `data.json` during any scoped artifact deployment.
- Use Conventional Commit subjects and normal Git identity; do not add agent attribution.
